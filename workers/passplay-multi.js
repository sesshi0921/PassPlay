const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const GAME_DEFINITIONS = {
  'old-maid': {
    minPlayers: 2,
    maxPlayers: 8,
  },
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (parts[0] !== 'api' || parts[1] !== 'rooms') {
      return json({ error: 'not found' }, 404);
    }

    if (parts.length === 2 && request.method === 'POST') {
      const body = await request.json();
      const roomId = createRoomId();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      return withCors(await stub.fetch(new Request(`https://room.internal/create`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-passplay-room-id': roomId,
          'x-passplay-origin': `${url.protocol}//${url.host}`,
        },
        body: JSON.stringify(body),
      })));
    }

    const roomId = parts[2];
    if (!roomId) return json({ error: 'room id required' }, 400);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
    const targetPath = `/${parts.slice(3).join('/')}`;
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.set('x-passplay-room-id', roomId);
    forwardHeaders.set('x-passplay-origin', `${url.protocol}//${url.host}`);
    const response = await stub.fetch(new Request(`https://room.internal${targetPath}${url.search}`, {
      method: request.method,
      headers: forwardHeaders,
      body: request.method === 'GET' ? undefined : await request.text(),
    }));
    if (request.headers.get('upgrade') === 'websocket') return response;
    return withCors(response);
  },
};

export class PassPlayRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = null;
    this.sockets = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const roomId = request.headers.get('x-passplay-room-id') || url.searchParams.get('roomId');
    if (!roomId) return json({ error: 'room id required' }, 400);
    try {
      await this.load(roomId);

      if (url.pathname === '/create' && request.method === 'POST') {
        return this.handleCreate(request);
      }
      if (url.pathname === '/join' && request.method === 'POST') {
        return this.handleJoin(request);
      }
      if (url.pathname === '/leave' && request.method === 'POST') {
        return this.handleLeave(request);
      }
      if (url.pathname === '/start' && request.method === 'POST') {
        return this.handleStart(request);
      }
      if (url.pathname === '/actions' && request.method === 'POST') {
        return this.handleAction(request);
      }
      if (url.pathname === '/sync' && request.method === 'GET') {
        return this.handleSync(request, url);
      }
      if (url.pathname === '/ws' && request.headers.get('upgrade') === 'websocket') {
        return this.handleWebSocket(request, url);
      }
      return json({ error: 'not found' }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  }

  async load(roomId) {
    if (this.room && this.room.roomId === roomId) return;
    const stored = await this.ctx.storage.get('room');
    this.room = stored || {
      roomId,
      gameId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 0,
      phase: 'waiting',
      hostPlayerId: null,
      players: [],
      turnOrder: [],
      turnPlayerId: null,
      lastEvent: null,
      result: null,
    };
  }

  async persist() {
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put('room', this.room);
  }

  playerById(playerId) {
    return this.room.players.find(player => player.id === playerId) || null;
  }

  auth(playerId, sessionToken) {
    const player = this.playerById(playerId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error('invalid session');
    }
    return player;
  }

  async handleCreate(request) {
    const body = await request.json();
    validateGame(body.gameId);
    const playerName = normalizeName(body.playerName);
    const playerId = createId('p');
    const sessionToken = createSecret();
    this.room.gameId = body.gameId;
    this.room.phase = 'waiting';
    this.room.hostPlayerId = playerId;
    this.room.players = [{
      id: playerId,
      name: playerName,
      isHost: true,
      isConnected: true,
      transport: body.transport || 'http',
      sessionToken,
      hand: [],
      appeal: [],
      isOut: false,
      finishOrder: null,
    }];
    this.room.turnOrder = [];
    this.room.turnPlayerId = null;
    this.bump('room-created');
    await this.persist();
    return json({
      sessionToken,
      snapshot: this.makeSnapshot(playerId, body.transport || 'http', request.headers.get('x-passplay-origin')),
    });
  }

  async handleJoin(request) {
    const body = await request.json();
    validateGame(body.gameId);
    if (this.room.gameId !== body.gameId) throw new Error('game mismatch');
    if (this.room.phase !== 'waiting') throw new Error('game already started');
    const rule = GAME_DEFINITIONS[this.room.gameId];
    if (this.room.players.length >= rule.maxPlayers) throw new Error('room is full');
    const playerName = normalizeName(body.playerName);
    if (this.room.players.some(player => player.name === playerName)) {
      throw new Error('duplicate player name');
    }
    const playerId = createId('p');
    const sessionToken = createSecret();
    this.room.players.push({
      id: playerId,
      name: playerName,
      isHost: false,
      isConnected: true,
      transport: body.transport || 'http',
      sessionToken,
      hand: [],
      appeal: [],
      isOut: false,
      finishOrder: null,
    });
    this.bump('player-joined');
    await this.persist();
    await this.broadcast(request.headers.get('x-passplay-origin'));
    return json({
      sessionToken,
      snapshot: this.makeSnapshot(playerId, body.transport || 'http', request.headers.get('x-passplay-origin')),
    });
  }

  async handleLeave(request) {
    const body = await request.json();
    const player = this.auth(body.playerId, body.sessionToken);
    player.isConnected = false;
    this.bump('player-left');
    await this.persist();
    await this.broadcast(request.headers.get('x-passplay-origin'));
    return json({ ok: true });
  }

  async handleStart(request) {
    const body = await request.json();
    const player = this.auth(body.playerId, body.sessionToken);
    if (!player.isHost) throw new Error('host only');
    if (this.room.phase !== 'waiting') throw new Error('already started');
    const rule = GAME_DEFINITIONS[this.room.gameId];
    if (this.room.players.length < rule.minPlayers) throw new Error('not enough players');
    startOldMaid(this.room);
    this.bump('game-started');
    await this.persist();
    await this.broadcast(request.headers.get('x-passplay-origin'));
    return json({
      snapshot: this.makeSnapshot(player.id, player.transport || 'http', request.headers.get('x-passplay-origin')),
    });
  }

  async handleAction(request) {
    const body = await request.json();
    const player = this.auth(body.playerId, body.sessionToken);
    if (this.room.gameId !== body.gameId) throw new Error('game mismatch');
    applyRoomAction(this.room, player.id, body.action);
    this.bump(body.action?.type || 'action');
    await this.persist();
    await this.broadcast(request.headers.get('x-passplay-origin'));
    return json({
      snapshot: this.makeSnapshot(player.id, player.transport || 'http', request.headers.get('x-passplay-origin')),
    });
  }

  async handleSync(request, url) {
    const player = this.auth(url.searchParams.get('playerId'), url.searchParams.get('sessionToken'));
    return json({
      snapshot: this.makeSnapshot(player.id, player.transport || 'http', request.headers.get('x-passplay-origin')),
    });
  }

  handleWebSocket(request, url) {
    const player = this.auth(url.searchParams.get('playerId'), url.searchParams.get('sessionToken'));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets.set(player.id, server);
    server.send(JSON.stringify({
      type: 'snapshot',
      snapshot: this.makeSnapshot(player.id, 'ws', request.headers.get('x-passplay-origin')),
    }));
    server.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'hello') {
          server.send(JSON.stringify({
            type: 'snapshot',
            snapshot: this.makeSnapshot(player.id, 'ws', request.headers.get('x-passplay-origin')),
          }));
        }
      } catch {
        server.send(JSON.stringify({ type: 'error', message: 'invalid message' }));
      }
    });
    server.addEventListener('close', () => {
      this.sockets.delete(player.id);
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  makeSnapshot(playerId, transport, origin) {
    const targetPlayerId = getNextActivePlayerId(this.room, this.room.turnPlayerId);
    const player = this.playerById(playerId);
    return {
      roomId: this.room.roomId,
      gameId: this.room.gameId,
      revision: this.room.revision,
      phase: this.room.phase,
      transport,
      me: player ? {
        roomId: this.room.roomId,
        playerId: player.id,
        playerName: player.name,
        isHost: player.isHost,
        transport,
        joined: true,
      } : null,
      players: this.room.players.map(current => ({
        id: current.id,
        name: current.name,
        isHost: current.isHost,
        isConnected: current.isConnected,
        cardCount: current.hand.length,
        isOut: current.isOut,
        finishOrder: current.finishOrder,
        handPreview: current.hand.map((cardId, slot) => ({
          slot,
          appealing: current.appeal.includes(cardId),
        })),
      })),
      publicState: {
        roomId: this.room.roomId,
        turnPlayerId: this.room.turnPlayerId,
        targetPlayerId,
        phase: this.room.phase,
        result: this.room.result,
        canStart: this.room.phase === 'waiting' && this.room.players.length >= GAME_DEFINITIONS[this.room.gameId]?.minPlayers,
        transportUrls: {
          http: `${origin}/api`,
          ws: `${origin.replace(/^http/, 'ws')}/api/rooms/${this.room.roomId}/ws`,
        },
      },
      privateState: player ? {
        hand: player.hand.map(cardId => ({
          cardId,
          label: cardLabel(cardId),
          appealing: player.appeal.includes(cardId),
        })),
        canStart: player.isHost && this.room.phase === 'waiting' && this.room.players.length >= GAME_DEFINITIONS[this.room.gameId]?.minPlayers,
        canDraw: this.room.phase === 'playing' && this.room.turnPlayerId === player.id,
      } : null,
    };
  }

  async broadcast(origin) {
    for (const [playerId, socket] of this.sockets.entries()) {
      try {
        socket.send(JSON.stringify({
          type: 'snapshot',
          snapshot: this.makeSnapshot(playerId, 'ws', origin),
        }));
      } catch {
        this.sockets.delete(playerId);
      }
    }
  }

  bump(eventType) {
    this.room.revision += 1;
    this.room.lastEvent = {
      type: eventType,
      at: Date.now(),
    };
  }
}

function applyRoomAction(room, playerId, action) {
  if (!action || typeof action.type !== 'string') throw new Error('invalid action');
  if (room.gameId !== 'old-maid') throw new Error('unsupported game');
  if (action.type === 'set-appeal') {
    const player = findPlayer(room, playerId);
    const nextAppeal = Array.isArray(action.payload?.cardIds) ? action.payload.cardIds.slice(0, 2) : [];
    const unique = [...new Set(nextAppeal)];
    for (const cardId of unique) {
      if (!player.hand.includes(cardId)) throw new Error('card not in hand');
    }
    player.appeal = unique;
    return;
  }
  if (action.type === 'draw-card') {
    applyOldMaidDraw(room, playerId, Number(action.payload?.slot));
    return;
  }
  throw new Error('unsupported action');
}

function startOldMaid(room) {
  const order = shuffle(room.players.map(player => player.id));
  const deck = shuffle(createDeck());
  room.turnOrder = order;
  room.turnPlayerId = order[0];
  room.phase = 'playing';
  room.result = null;
  for (const player of room.players) {
    player.hand = [];
    player.appeal = [];
    player.isOut = false;
    player.finishOrder = null;
    player.isConnected = true;
  }
  deck.forEach((card, index) => {
    const owner = findPlayer(room, order[index % order.length]);
    owner.hand.push(card);
  });
  for (const player of room.players) {
    player.hand = removePairs(player.hand);
  }
  assignFinishedPlayers(room);
  maybeFinishRoom(room);
  room.turnPlayerId = getNextTurnPlayer(room, room.turnPlayerId);
}

function applyOldMaidDraw(room, playerId, slot) {
  if (room.phase !== 'playing') throw new Error('game is not active');
  if (room.turnPlayerId !== playerId) throw new Error('not your turn');
  const actor = findPlayer(room, playerId);
  const targetId = getNextActivePlayerId(room, playerId);
  if (!targetId) throw new Error('no target player');
  const target = findPlayer(room, targetId);
  if (!Number.isInteger(slot) || slot < 0 || slot >= target.hand.length) {
    throw new Error('invalid slot');
  }

  const [drawnCard] = target.hand.splice(slot, 1);
  target.appeal = target.appeal.filter(cardId => cardId !== drawnCard);
  actor.hand.push(drawnCard);
  actor.hand = removePairs(actor.hand);
  actor.appeal = actor.appeal.filter(cardId => actor.hand.includes(cardId)).slice(0, 2);

  assignFinishedPlayers(room);
  if (maybeFinishRoom(room)) return;
  room.turnPlayerId = getNextTurnPlayer(room, actor.id);
}

function getNextTurnPlayer(room, currentPlayerId) {
  const activeIds = room.turnOrder.filter(playerId => !findPlayer(room, playerId).isOut);
  if (activeIds.length <= 1) return activeIds[0] || null;
  const index = room.turnOrder.indexOf(currentPlayerId);
  for (let offset = 1; offset <= room.turnOrder.length; offset += 1) {
    const nextId = room.turnOrder[(index + offset) % room.turnOrder.length];
    if (!findPlayer(room, nextId).isOut) return nextId;
  }
  return null;
}

function getNextActivePlayerId(room, playerId) {
  if (!playerId) return null;
  return getNextTurnPlayer(room, playerId);
}

function assignFinishedPlayers(room) {
  const assigned = room.players.filter(player => player.finishOrder !== null).length;
  let nextOrder = assigned + 1;
  for (const playerId of room.turnOrder) {
    const player = findPlayer(room, playerId);
    if (!player.isOut && player.hand.length === 0) {
      player.isOut = true;
      player.finishOrder = nextOrder;
      nextOrder += 1;
    }
  }
}

function maybeFinishRoom(room) {
  const activePlayers = room.players.filter(player => !player.isOut);
  if (activePlayers.length > 1) return false;
  room.phase = 'finished';
  room.turnPlayerId = null;
  if (activePlayers[0]) {
    activePlayers[0].finishOrder = room.players.length;
    activePlayers[0].isOut = true;
  }
  const ordered = room.players.slice().sort((a, b) => (a.finishOrder || 999) - (b.finishOrder || 999));
  room.result = {
    winnerIds: ordered.filter(player => player.finishOrder === 1).map(player => player.id),
    loserPlayerId: ordered[ordered.length - 1]?.id || null,
    standings: ordered.map(player => ({
      playerId: player.id,
      name: player.name,
      finishOrder: player.finishOrder,
    })),
  };
  return true;
}

function findPlayer(room, playerId) {
  const player = room.players.find(candidate => candidate.id === playerId);
  if (!player) throw new Error('player not found');
  return player;
}

function createDeck() {
  const suits = ['S', 'H', 'D', 'C'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}-${suit}-${createId('c')}`);
    }
  }
  deck.push(`JOKER-X-${createId('c')}`);
  return deck;
}

function removePairs(hand) {
  const counts = new Map();
  const kept = new Map();
  for (const cardId of hand) {
    const rank = cardId.split('-')[0];
    counts.set(rank, (counts.get(rank) || 0) + 1);
  }
  return hand.filter(cardId => {
    const rank = cardId.split('-')[0];
    if (rank === 'JOKER') return true;
    if ((counts.get(rank) || 0) % 2 === 0) return false;
    if (kept.get(rank)) return false;
    kept.set(rank, true);
    return true;
  });
}

function cardLabel(cardId) {
  const [rank, suit] = cardId.split('-');
  if (rank === 'JOKER') return 'JOKER';
  const symbols = { S: '♠', H: '♥', D: '♦', C: '♣' };
  return `${rank}${symbols[suit] || ''}`;
}

function validateGame(gameId) {
  if (!GAME_DEFINITIONS[gameId]) throw new Error('unsupported game');
}

function normalizeName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('player name required');
  if (trimmed.length > 16) throw new Error('player name too long');
  return trimmed;
}

function createRoomId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i += 1) {
    result += alphabet[randomInt(alphabet.length)];
  }
  return result;
}

function createId(prefix) {
  return `${prefix}_${randomToken(8)}`;
}

function createSecret() {
  return `${randomToken(16)}${randomToken(16)}`;
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomInt(max) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % max;
}

function randomToken(length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += alphabet[randomInt(alphabet.length)];
  }
  return value;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
    webSocket: response.webSocket,
  });
}
