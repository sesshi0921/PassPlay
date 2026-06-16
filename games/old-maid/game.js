(() => {
  'use strict';

  const directParams = new URLSearchParams(window.location.search);
  if (window.parent === window && directParams.get('room')) {
    const redirect = new URL('../../play.html', window.location.href);
    redirect.searchParams.set('game', 'old-maid');
    redirect.searchParams.set('mode', 'multi');
    redirect.searchParams.set('room', directParams.get('room'));
    const api = directParams.get('api');
    if (api) redirect.searchParams.set('api', api);
    window.location.replace(redirect.toString());
  }
})();

window.PassPlay.register(async api => {
  'use strict';

  const USERNAME_STORAGE_KEY = 'passplay.multi.username';
  const phases = Array.from(document.querySelectorAll('[data-phase]'));
  const state = { snapshot: null };

  const $playerName = document.getElementById('player-name');
  const $roomLabel = document.getElementById('room-label');
  const $joinRoomId = document.getElementById('join-room-id');
  const $setupError = document.getElementById('setup-error');
  const $roomCode = document.getElementById('room-code');
  const $playRoomCode = document.getElementById('play-room-code');
  const $inviteUrl = document.getElementById('invite-url');
  const $copyInvite = document.getElementById('copy-invite');
  const $roomStatus = document.getElementById('room-status');
  const $playersList = document.getElementById('players-list');
  const $publicPlayers = document.getElementById('public-players');
  const $turnLabel = document.getElementById('turn-label');
  const $targetLabel = document.getElementById('target-label');
  const $targetHand = document.getElementById('target-hand');
  const $myHand = document.getElementById('my-hand');
  const $resultSummary = document.getElementById('result-summary');

  function show(phase) {
    for (const element of phases) {
      const active = element.dataset.phase === phase;
      element.hidden = !active;
      element.classList.toggle('is-active', active);
    }
  }

  function getRoomCodeFromUrl() {
    return new URLSearchParams(window.location.search).get('room') || '';
  }

  function getInviteUrl(roomLabel) {
    const url = new URL('../../play.html', window.location.href);
    url.searchParams.set('game', 'old-maid');
    url.searchParams.set('mode', 'multi');
    url.searchParams.set('room', roomLabel);
    return url.toString();
  }

  function roomLabelValue() {
    return ($roomLabel?.value || '').trim();
  }

  function setError(message) {
    $setupError.hidden = !message;
    $setupError.textContent = message || '';
  }

  async function copyInviteUrl() {
    const value = $inviteUrl.value.trim();
    if (!value) return;
    const originalLabel = $copyInvite.textContent;
    try {
      await navigator.clipboard.writeText(value);
      $copyInvite.textContent = 'コピー済み';
    } catch {
      $inviteUrl.focus();
      $inviteUrl.select();
      try {
        document.execCommand('copy');
        $copyInvite.textContent = 'コピー済み';
      } catch {
        $copyInvite.textContent = '失敗';
      }
    }
    window.setTimeout(() => {
      $copyInvite.textContent = originalLabel;
    }, 1400);
  }

  function playerName() {
    const name = $playerName.value.trim();
    if (!name) throw new Error('名前を入力してください');
    return name;
  }

  function saveName(value) {
    localStorage.setItem(USERNAME_STORAGE_KEY, value);
  }

  function renderPlayers(target, players, options = {}) {
    const showCardCount = !!options.showCardCount;
    target.innerHTML = '';
    for (const player of players) {
      const li = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = player.name;
      const meta = document.createElement('div');
      meta.className = 'player-meta';
      if (player.isHost) meta.appendChild(makePill('HOST'));
      if (showCardCount && player.cardCount !== undefined) meta.appendChild(makePill(`${player.cardCount}枚`));
      if (player.finishOrder) meta.appendChild(makePill(`${player.finishOrder}位`, player.isOut ? 'out' : ''));
      if (player.isOut && !player.finishOrder) meta.appendChild(makePill('OUT', 'out'));
      li.appendChild(name);
      li.appendChild(meta);
      target.appendChild(li);
    }
  }

  function makePill(text, extraClass = '') {
    const span = document.createElement('span');
    span.className = `pill ${extraClass}`.trim();
    span.textContent = text;
    return span;
  }

  function renderRoom(snapshot) {
    const isWaiting = snapshot.phase === 'waiting';
    const isFinished = snapshot.phase === 'finished';
    if (isWaiting) show('room');
    if (snapshot.phase === 'playing') show('play');
    if (isFinished) show('result');

    $roomCode.textContent = snapshot.roomLabel || snapshot.roomId;
    $playRoomCode.textContent = snapshot.roomLabel || snapshot.roomId;
    $inviteUrl.value = getInviteUrl(snapshot.roomLabel || snapshot.roomId);
    $roomStatus.textContent = phaseLabel(snapshot.phase);

    const showCardCount = snapshot.phase !== 'waiting';
    renderPlayers($playersList, snapshot.players, { showCardCount });
    renderPlayers($publicPlayers, snapshot.players, { showCardCount });

    renderPlay(snapshot);
    renderResult(snapshot);

    document.getElementById('start-game').disabled = !snapshot.privateState?.canStart;
  }

  function renderPlay(snapshot) {
    if (!snapshot.privateState) return;
    const me = snapshot.me;
    const publicState = snapshot.publicState || {};
    const targetPlayer = snapshot.players.find(player => player.id === publicState.targetPlayerId) || null;
    const isMyTurn = publicState.turnPlayerId === me?.playerId;
    $turnLabel.textContent = isMyTurn ? 'あなたのターン' : `${nameById(snapshot, publicState.turnPlayerId)} のターン`;
    $targetLabel.textContent = targetPlayer ? `${targetPlayer.name} から1枚引きます` : '';

    $targetHand.innerHTML = '';
    const previews = targetPlayer?.handPreview || [];
    for (const preview of previews) {
      const button = document.createElement('button');
      button.className = 'card-button';
      if (preview.appealing) button.classList.add('appealing');
      button.disabled = !snapshot.privateState.canDraw;
      button.type = 'button';
      button.addEventListener('click', () => act('draw-card', { slot: preview.slot }));
      $targetHand.appendChild(button);
    }

    $myHand.innerHTML = '';
    for (const card of snapshot.privateState.hand || []) {
      const button = document.createElement('button');
      button.className = 'hand-card';
      if (card.appealing) button.classList.add('appealing');
      button.type = 'button';
      button.addEventListener('click', () => toggleAppeal(snapshot, card.cardId));
      const label = document.createElement('span');
      label.className = 'hand-card-name';
      label.textContent = card.label;
      const note = document.createElement('span');
      note.className = 'hand-card-toggle';
      note.textContent = card.appealing ? 'アピール中' : 'タップでアピール';
      button.appendChild(label);
      button.appendChild(note);
      $myHand.appendChild(button);
    }
  }

  function renderResult(snapshot) {
    if (snapshot.phase !== 'finished') return;
    const result = snapshot.publicState?.result;
    const lines = [];
    if (result?.loserPlayerId) {
      lines.push(`ババ: ${nameById(snapshot, result.loserPlayerId)}`);
    }
    for (const standing of result?.standings || []) {
      lines.push(`${standing.finishOrder}位 ${standing.name}`);
    }
    $resultSummary.innerHTML = '';
    for (const line of lines) {
      const row = document.createElement('div');
      row.textContent = line;
      $resultSummary.appendChild(row);
    }
  }

  function phaseLabel(phase) {
    if (phase === 'waiting') return '待機中';
    if (phase === 'playing') return '対戦中';
    if (phase === 'finished') return '終了';
    return phase;
  }

  function nameById(snapshot, playerId) {
    return snapshot.players.find(player => player.id === playerId)?.name || '不明';
  }

  async function act(type, payload) {
    try {
      const snapshot = await api.room.action({ type, payload });
      setSnapshot(snapshot);
    } catch (error) {
      setError(error.message);
    }
  }

  async function toggleAppeal(snapshot, cardId) {
    const current = snapshot.privateState.hand.filter(card => card.appealing).map(card => card.cardId);
    const next = current.includes(cardId)
      ? current.filter(value => value !== cardId)
      : current.concat(cardId).slice(-2);
    await act('set-appeal', { cardIds: next });
  }

  function setSnapshot(snapshot) {
    state.snapshot = snapshot;
    renderRoom(snapshot);
  }

  document.getElementById('create-room').addEventListener('click', async () => {
    setError('');
    try {
      const name = playerName();
      saveName(name);
      const roomLabel = roomLabelValue();
      const snapshot = await api.room.create({ playerName: name, transport: 'http', roomLabel });
      setSnapshot(snapshot);
    } catch (error) {
      setError(error.message);
    }
  });

  document.getElementById('join-room').addEventListener('click', async () => {
    setError('');
    try {
      const name = playerName();
      saveName(name);
      const roomId = $joinRoomId.value.trim();
      const snapshot = await api.room.join({ roomId, playerName: name, transport: 'http' });
      setSnapshot(snapshot);
    } catch (error) {
      setError(error.message);
    }
  });

  document.getElementById('start-game').addEventListener('click', async () => {
    try {
      setSnapshot(await api.room.start());
    } catch (error) {
      setError(error.message);
    }
  });

  async function leaveRoom() {
    await api.room.leave();
    state.snapshot = null;
    show('setup');
  }

  document.getElementById('leave-room').addEventListener('click', leaveRoom);
  document.getElementById('leave-after-result').addEventListener('click', leaveRoom);
  $copyInvite.addEventListener('click', copyInviteUrl);

  $playerName.value = localStorage.getItem(USERNAME_STORAGE_KEY) || '';
  $joinRoomId.value = getRoomCodeFromUrl();

  api.room.onStateChange(snapshot => {
    if (snapshot) setSnapshot(snapshot);
  });

  try {
    const session = await api.room.getSession();
    if (session) {
      setSnapshot(await api.room.sync());
    } else {
      show('setup');
    }
  } catch {
    show('setup');
  }
});
