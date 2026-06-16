(() => {
  'use strict';

  const API_BASE_STORAGE_KEY = 'passplay.multi.api-base';
  const SESSION_STORAGE_PREFIX = 'passplay.multi.session.';
  const DEFAULT_REMOTE_API_BASE = 'https://passplay.seshimaru-dev.workers.dev/api';

  function normalizeApiBase(input) {
    if (!input) return DEFAULT_REMOTE_API_BASE;
    const trimmed = String(input).trim();
    if (!trimmed) return DEFAULT_REMOTE_API_BASE;
    return trimmed.replace(/\/+$/, '');
  }

  function buildUrl(base, path, params) {
    const url = new URL(`${normalizeApiBase(base)}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  function readJson(response) {
    return response.text().then(text => {
      const payload = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string'
          ? payload.error
          : `Request failed: ${response.status}`;
        throw new Error(message);
      }
      return payload;
    });
  }

  function roomSessionKey(gameId) {
    return `${SESSION_STORAGE_PREFIX}${gameId}`;
  }

  function loadStoredSession(gameId) {
    try {
      const raw = localStorage.getItem(roomSessionKey(gameId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveStoredSession(gameId, session) {
    if (!session) {
      localStorage.removeItem(roomSessionKey(gameId));
      return;
    }
    localStorage.setItem(roomSessionKey(gameId), JSON.stringify(session));
  }

  function getDefaultApiBase() {
    return normalizeApiBase(
      window.PASSPLAY_API_BASE
      || new URLSearchParams(window.location.search).get('api')
      || localStorage.getItem(API_BASE_STORAGE_KEY)
      || DEFAULT_REMOTE_API_BASE
    );
  }

  function setDefaultApiBase(apiBase) {
    localStorage.setItem(API_BASE_STORAGE_KEY, normalizeApiBase(apiBase));
  }

  function createEmitter() {
    const listeners = new Set();
    return {
      emit(value) {
        for (const listener of listeners) listener(value);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  function createClient({ gameId, roomId, apiBase }) {
    const emitter = createEmitter();
    let resolvedApiBase = normalizeApiBase(apiBase || getDefaultApiBase());
    let snapshot = null;
    let session = loadStoredSession(gameId);
    let pollTimer = null;
    let disposed = false;
    let socket = null;
    let socketTransport = null;

    function setSnapshot(nextSnapshot) {
      snapshot = nextSnapshot;
      emitter.emit(nextSnapshot);
    }

    function clearPolling() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function closeSocket() {
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
      socket = null;
      socketTransport = null;
    }

    async function request(method, path, body, params) {
      const response = await fetch(buildUrl(resolvedApiBase, path, params), {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return readJson(response);
    }

    function persistSessionFromPayload(payload, transportHint) {
      if (!payload || !payload.snapshot || !payload.sessionToken) return;
      const me = payload.snapshot.me;
      if (!me) return;
      session = {
        gameId,
        roomId: payload.snapshot.roomId,
        roomLabel: payload.snapshot.roomLabel || payload.snapshot.roomId,
        playerId: me.playerId,
        playerName: me.playerName,
        sessionToken: payload.sessionToken,
        isHost: me.isHost,
        transport: transportHint || me.transport || 'http',
      };
      saveStoredSession(gameId, session);
    }

    function clearSession() {
      session = null;
      saveStoredSession(gameId, null);
      setSnapshot(null);
      clearPolling();
      closeSocket();
    }

    async function createRoom(options) {
      const transport = options.transport || 'http';
      const payload = await request('POST', '/rooms', {
        gameId,
        playerName: options.playerName,
        transport,
      });
      persistSessionFromPayload(payload, transport);
      setSnapshot(payload.snapshot);
      startRealtime();
      return payload.snapshot;
    }

    async function joinRoom(options) {
      const transport = options.transport || 'http';
      const payload = await request('POST', '/rooms/join', {
        gameId,
        playerName: options.playerName,
        roomLabel: options.roomId,
        transport,
      });
      persistSessionFromPayload(payload, transport);
      setSnapshot(payload.snapshot);
      startRealtime();
      return payload.snapshot;
    }

    async function sync() {
      if (!session) throw new Error('room session not found');
      const payload = await request(
        'GET',
        `/rooms/${encodeURIComponent(session.roomId)}/sync`,
        null,
        {
          gameId,
          playerId: session.playerId,
          sessionToken: session.sessionToken,
          since: snapshot ? snapshot.revision : 0,
        },
      );
      if (payload && payload.snapshot) setSnapshot(payload.snapshot);
      return payload ? payload.snapshot : snapshot;
    }

    async function start() {
      if (!session) throw new Error('room session not found');
      const payload = await request('POST', `/rooms/${encodeURIComponent(session.roomId)}/start`, {
        gameId,
        playerId: session.playerId,
        sessionToken: session.sessionToken,
      });
      setSnapshot(payload.snapshot);
      return payload.snapshot;
    }

    async function sendAction(action) {
      if (!session) throw new Error('room session not found');
      const payload = await request('POST', `/rooms/${encodeURIComponent(session.roomId)}/actions`, {
        gameId,
        playerId: session.playerId,
        sessionToken: session.sessionToken,
        action,
      });
      setSnapshot(payload.snapshot);
      return payload.snapshot;
    }

    async function leave() {
      if (!session) return true;
      try {
        await request('POST', `/rooms/${encodeURIComponent(session.roomId)}/leave`, {
          gameId,
          playerId: session.playerId,
          sessionToken: session.sessionToken,
        });
      } finally {
        clearSession();
      }
      return true;
    }

    function schedulePolling(delayMs = 1000) {
      clearPolling();
      if (disposed || !session) return;
      pollTimer = setTimeout(async () => {
        try {
          await sync();
        } catch (error) {
          console.warn('[PassPlay] room poll failed:', error);
        } finally {
          if (!socket) schedulePolling(1200);
        }
      }, delayMs);
    }

    function openSocket() {
      if (!session || !snapshot || !snapshot.publicState || !snapshot.publicState.transportUrls) return false;
      const wsUrl = snapshot.publicState.transportUrls.ws;
      if (!wsUrl || typeof WebSocket !== 'function') return false;
      closeSocket();
      socketTransport = 'ws';
      socket = new WebSocket(`${wsUrl}?playerId=${encodeURIComponent(session.playerId)}&sessionToken=${encodeURIComponent(session.sessionToken)}&gameId=${encodeURIComponent(gameId)}`);
      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'hello',
          lastRevision: snapshot ? snapshot.revision : 0,
        }));
      };
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'snapshot' && message.snapshot) {
            setSnapshot(message.snapshot);
          }
        } catch (error) {
          console.warn('[PassPlay] invalid ws message:', error);
        }
      };
      socket.onerror = () => {
        closeSocket();
        schedulePolling(600);
      };
      socket.onclose = () => {
        closeSocket();
        schedulePolling(600);
      };
      return true;
    }

    function startRealtime() {
      clearPolling();
      if (disposed || !session) return;
      const preferredTransport = session.transport || 'http';
      if (preferredTransport === 'ws' && openSocket()) return;
      schedulePolling(400);
    }

    if (session && (!roomId || roomId === session.roomId)) {
      schedulePolling(200);
    } else if (roomId && session && roomId !== session.roomId) {
      clearSession();
    }

    return {
      getApiBase() {
        return resolvedApiBase;
      },
      setApiBase(nextApiBase) {
        resolvedApiBase = normalizeApiBase(nextApiBase);
        setDefaultApiBase(resolvedApiBase);
      },
      getSession() {
        return snapshot?.me || (session ? {
          roomId: session.roomId,
          roomLabel: session.roomLabel || session.roomId,
          playerId: session.playerId,
          playerName: session.playerName,
          isHost: session.isHost,
          transport: session.transport,
          joined: true,
        } : null);
      },
      getSnapshot() {
        return snapshot;
      },
      createRoom,
      joinRoom,
      sync,
      start,
      sendAction,
      leave,
      subscribe(listener) {
        return emitter.subscribe(listener);
      },
      dispose() {
        disposed = true;
        clearPolling();
        closeSocket();
      },
    };
  }

  window.PassPlayRoomRuntime = {
    createClient,
    getDefaultApiBase,
    setDefaultApiBase,
  };
})();
