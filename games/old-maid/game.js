(() => {
  'use strict';

  if (window.parent === window) {
    const directParams = new URLSearchParams(window.location.search);
    const redirect = new URL('../../play.html', window.location.href);
    redirect.searchParams.set('game', 'old-maid');
    redirect.searchParams.set('mode', 'multi');
    const room = directParams.get('room');
    if (room) redirect.searchParams.set('room', room);
    const api = directParams.get('api');
    if (api) redirect.searchParams.set('api', api);
    window.location.replace(redirect.toString());
  }
})();

window.PassPlay.register(async api => {
  'use strict';

  const USERNAME_STORAGE_KEY = 'passplay.multi.username';
  const phases = Array.from(document.querySelectorAll('[data-phase]'));
  const state = {
    snapshot: null,
    previousSnapshot: null,
    selectedTargetSlot: null,
    lastTargetTapAt: 0,
    removalAnim: null,
    drawAnim: null,
  };

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
  const $playerRing = document.getElementById('player-ring');
  const $turnLabel = document.getElementById('turn-label');
  const $targetLabel = document.getElementById('target-label');
  const $targetPanel = document.getElementById('target-panel');
  const $targetHand = document.getElementById('target-hand');
  const $myHand = document.getElementById('my-hand');
  const $handOverlay = document.getElementById('hand-overlay');
  const $discardPile = document.getElementById('discard-pile');
  const $selectionPopup = document.getElementById('selection-popup');
  const $drawAnimationCard = document.getElementById('draw-animation-card');
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

  function makePill(text, extraClass = '') {
    const span = document.createElement('span');
    span.className = `pill ${extraClass}`.trim();
    span.textContent = text;
    return span;
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
    const selectingMine = publicState.targetPlayerId === me?.playerId
      && publicState.turnPlayerId
      && publicState.turnPlayerId !== me?.playerId;

    $turnLabel.textContent = isMyTurn ? 'あなたのターン' : `${nameById(snapshot, publicState.turnPlayerId)} のターン`;
    $targetLabel.textContent = isMyTurn && targetPlayer
      ? `${targetPlayer.name} の手札をダブルタップして引きます`
      : selectingMine
        ? `${nameById(snapshot, publicState.turnPlayerId)} があなたのカードを選んでいます...`
        : targetPlayer
          ? `${targetPlayer.name} から1枚引きます`
          : '';

    $selectionPopup.hidden = !selectingMine;
    $selectionPopup.textContent = selectingMine
      ? `${nameById(snapshot, publicState.turnPlayerId)} があなたのカードを選んでいます...`
      : '';

    renderRing(snapshot, me?.playerId);
    renderDiscardPile(publicState.discardPile || []);
    renderTargetStack(snapshot, targetPlayer);
    renderMyHand(snapshot.privateState.hand || []);
    renderHandOverlay();
    renderDrawAnimation();
  }

  function renderRing(snapshot, myPlayerId) {
    const publicState = snapshot.publicState || {};
    const order = (publicState.turnOrder && publicState.turnOrder.length
      ? publicState.turnOrder
      : snapshot.players.map(player => player.id))
      .filter(playerId => playerId !== myPlayerId);
    const ringPlayers = order
      .map(playerId => snapshot.players.find(player => player.id === playerId))
      .filter(Boolean);

    $playerRing.innerHTML = '';
    const total = ringPlayers.length;
    ringPlayers.forEach((player, index) => {
      const angle = total <= 1 ? 270 : 210 + (120 * index) / Math.max(1, total - 1);
      const chip = document.createElement('div');
      chip.className = 'table-player';
      chip.style.setProperty('--angle', `${angle}deg`);
      if (player.id === publicState.turnPlayerId) chip.classList.add('is-turn');
      if (player.id === publicState.targetPlayerId) chip.classList.add('is-target');
      if (player.isOut) chip.classList.add('is-out');

      const icon = document.createElement('div');
      icon.className = 'table-player-icon';
      icon.textContent = '👤';

      const name = document.createElement('div');
      name.className = 'table-player-name';
      name.textContent = truncateName(player.name, 10);

      const meta = document.createElement('div');
      meta.className = 'table-player-meta';
      if (player.isHost) meta.appendChild(makePill('HOST'));
      if (player.cardCount !== undefined) meta.appendChild(makePill(`${player.cardCount}枚`));

      chip.appendChild(icon);
      chip.appendChild(name);
      chip.appendChild(meta);
      $playerRing.appendChild(chip);
    });
  }

  function renderDiscardPile(discardPile) {
    $discardPile.innerHTML = '';
    const latest = discardPile.slice(-3).reverse();
    if (latest.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'discard-placeholder';
      empty.textContent = 'まだありません';
      $discardPile.appendChild(empty);
      return;
    }

    latest.forEach((entry, groupIndex) => {
      const group = document.createElement('div');
      group.className = 'discard-group';
      group.style.setProperty('--group-index', String(groupIndex));
      (entry.labels || []).slice(0, 4).forEach((label, cardIndex) => {
        const card = document.createElement('div');
        card.className = 'discard-card';
        card.style.setProperty('--discard-index', String(cardIndex));
        card.textContent = label;
        group.appendChild(card);
      });
      $discardPile.appendChild(group);
    });
  }

  function renderTargetStack(snapshot, targetPlayer) {
    const canDraw = !!snapshot.privateState?.canDraw;
    $targetPanel.hidden = !targetPlayer;
    $targetHand.innerHTML = '';
    if (!targetPlayer) return;

    (targetPlayer.handPreview || []).forEach((preview, index) => {
      const button = document.createElement('button');
      button.className = 'stack-card';
      button.type = 'button';
      button.style.setProperty('--stack-index', String(index));
      if (preview.appealing) button.classList.add('appealing');
      if (state.selectedTargetSlot === preview.slot) button.classList.add('is-selected');
      button.disabled = !canDraw;
      button.addEventListener('click', () => handleTargetTap(preview.slot));
      $targetHand.appendChild(button);
    });

    if (!canDraw) {
      state.selectedTargetSlot = null;
      state.lastTargetTapAt = 0;
    }
  }

  function renderMyHand(hand) {
    $myHand.innerHTML = '';
    hand.forEach((card, index) => {
      const button = document.createElement('button');
      button.className = 'hand-card';
      button.style.setProperty('--card-index', String(index));
      if (card.appealing) button.classList.add('appealing');
      button.type = 'button';
      button.addEventListener('click', () => toggleAppeal(state.snapshot, card.cardId));

      const label = document.createElement('span');
      label.className = 'hand-card-name';
      label.textContent = card.label;

      const note = document.createElement('span');
      note.className = 'hand-card-toggle';
      note.textContent = card.appealing ? 'アピール中' : 'タップでアピール';

      button.appendChild(label);
      button.appendChild(note);
      $myHand.appendChild(button);
    });
  }

  function renderHandOverlay() {
    $handOverlay.innerHTML = '';
    if (!state.removalAnim) return;

    const ghost = document.createElement('div');
    ghost.className = 'hand-card removal-ghost';
    ghost.style.setProperty('--card-index', String(state.removalAnim.slot));
    ghost.innerHTML = `<span class="hand-card-name">${state.removalAnim.cardLabel}</span><span class="hand-card-toggle">選ばれました</span>`;
    $handOverlay.appendChild(ghost);
  }

  function renderDrawAnimation() {
    if (!state.drawAnim) {
      $drawAnimationCard.hidden = true;
      $drawAnimationCard.textContent = '';
      return;
    }
    $drawAnimationCard.hidden = false;
    $drawAnimationCard.textContent = state.drawAnim.cardLabel;
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

  function truncateName(name, limit) {
    return name.length > limit ? `${name.slice(0, limit)}...` : name;
  }

  function handleTargetTap(slot) {
    const now = Date.now();
    if (state.selectedTargetSlot === slot && now - state.lastTargetTapAt < 360) {
      state.selectedTargetSlot = null;
      state.lastTargetTapAt = 0;
      act('draw-card', { slot });
      return;
    }
    state.selectedTargetSlot = slot;
    state.lastTargetTapAt = now;
    if (state.snapshot?.phase === 'playing') renderPlay(state.snapshot);
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

  function primeAnimations(previousSnapshot, nextSnapshot) {
    const previousMoveAt = previousSnapshot?.publicState?.lastMove?.at || 0;
    const nextMove = nextSnapshot?.publicState?.lastMove;
    if (!nextMove || nextMove.at === previousMoveAt) return;

    if (nextMove.targetPlayerId === nextSnapshot?.me?.playerId) {
      const previousHand = previousSnapshot?.privateState?.hand || [];
      const removedCard = previousHand[nextMove.targetSlot];
      if (removedCard) {
        state.removalAnim = { slot: nextMove.targetSlot, cardLabel: removedCard.label, at: nextMove.at };
        window.setTimeout(() => {
          if (state.removalAnim?.at === nextMove.at) {
            state.removalAnim = null;
            if (state.snapshot?.phase === 'playing') renderPlay(state.snapshot);
          }
        }, 720);
      }
    }

    if (nextMove.actorPlayerId === nextSnapshot?.me?.playerId) {
      state.drawAnim = { cardLabel: nextMove.drawnCardLabel, at: nextMove.at };
      window.setTimeout(() => {
        if (state.drawAnim?.at === nextMove.at) {
          state.drawAnim = null;
          if (state.snapshot?.phase === 'playing') renderPlay(state.snapshot);
        }
      }, 900);
    }
  }

  function setSnapshot(snapshot) {
    primeAnimations(state.snapshot, snapshot);
    state.previousSnapshot = state.snapshot;
    state.snapshot = snapshot;
    renderRoom(snapshot);
  }

  document.getElementById('create-room').addEventListener('click', async () => {
    setError('');
    try {
      const name = playerName();
      saveName(name);
      const roomLabel = roomLabelValue();
      const snapshot = await api.room.create({ playerName: name, transport: 'ws', roomLabel });
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
      const snapshot = await api.room.join({ roomId, playerName: name, transport: 'ws' });
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
    state.previousSnapshot = null;
    state.selectedTargetSlot = null;
    state.lastTargetTapAt = 0;
    state.removalAnim = null;
    state.drawAnim = null;
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
