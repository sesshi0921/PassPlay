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

if (window.parent !== window) {
window.PassPlay.register(async api => {
  'use strict';

  const USERNAME_STORAGE_KEY = 'passplay.multi.username';
  const phases = Array.from(document.querySelectorAll('[data-phase]'));
  const state = {
    snapshot: null,
    previousSnapshot: null,
    selectedTargetSlot: null,
    lastTargetTapAt: 0,
    selectedPairCardIds: [],
    pairSelectionDeadline: 0,
    pairSelectionTimer: null,
    turnCountdownTimer: null,
    initialSweepKey: '',
    initialSweepTimers: [],
    initialCheckingCardIds: new Set(),
    initialReleaseCardIds: new Set(),
    removalAnim: null,
    releaseGhosts: [],
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
  const $turnTimer = document.getElementById('turn-timer');
  const $targetLabel = document.getElementById('target-label');
  const $targetPanel = document.getElementById('target-panel');
  const $targetHand = document.getElementById('target-hand');
  const $myHand = document.getElementById('my-hand');
  const $handOverlay = document.getElementById('hand-overlay');
  const $discardPile = document.getElementById('discard-pile');
  const $selectionPopup = document.getElementById('selection-popup');
  const $pairingOverlay = document.getElementById('pairing-overlay');
  const $pairingTitle = document.getElementById('pairing-title');
  const $pairingNote = document.getElementById('pairing-note');
  const $pairingTimer = document.getElementById('pairing-timer');
  const $pairingReady = document.getElementById('pairing-ready');
  const $startBanner = document.getElementById('start-banner');
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
    if (snapshot.phase === 'pairing' || snapshot.phase === 'playing') show('play');
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
    const isPairing = snapshot.phase === 'pairing';
    document.body.dataset.oldMaidPhase = snapshot.phase;

    $turnLabel.textContent = isPairing
      ? '手札の準備'
      : isMyTurn ? 'あなたのターン' : `${nameById(snapshot, publicState.turnPlayerId)} のターン`;
    $targetLabel.textContent = isPairing
      ? 'そろった数字を捨ててから全員の準備完了を待ちます'
      : isMyTurn && targetPlayer
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

    renderPairing(snapshot);
    renderTurnCountdown(snapshot);
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
    const positions = getRingPositions(ringPlayers.length);

    $playerRing.innerHTML = '';
    ringPlayers.forEach((player, index) => {
      const chip = document.createElement('div');
      chip.className = 'table-player';
      const position = positions[index] || { x: 50, y: 20 };
      chip.style.left = `${position.x}%`;
      chip.style.top = `${position.y}%`;
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
      if (player.cardCount !== undefined) meta.appendChild(makeCardCountStack(player.cardCount));

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
      empty.textContent = 'そろったカード';
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
    if (snapshot.phase !== 'playing') {
      $targetPanel.hidden = true;
      $targetHand.innerHTML = '';
      return;
    }
    const canDraw = !!snapshot.privateState?.canDraw;
    $targetPanel.hidden = !targetPlayer || !canDraw;
    $targetHand.innerHTML = '';
    if (!targetPlayer || !canDraw) {
      state.selectedTargetSlot = null;
      state.lastTargetTapAt = 0;
      return;
    }

    const previews = targetPlayer.handPreview || [];
    layoutCardFan($targetHand, previews.length, {
      minWidth: 38,
      maxWidth: 66,
      heightRatio: 1.42,
      minStep: 18,
      maxStep: 34,
      fallbackWidth: 332,
    });
    previews.forEach((preview, index) => {
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

  }

  function renderPairing(snapshot) {
    const isPairing = snapshot.phase === 'pairing';
    $pairingOverlay.hidden = true;
    if (!isPairing) {
      clearPairSelection();
      clearInitialSweep();
      $startBanner.hidden = true;
      return;
    }

    setupInitialSweep(snapshot);
  }

  function setupInitialSweep(snapshot) {
    const dealKey = `${snapshot.roomId}:${snapshot.publicState?.dealStartedAt || snapshot.revision}`;
    if (state.initialSweepKey === dealKey) return;

    clearInitialSweep();
    state.initialSweepKey = dealKey;
    $startBanner.hidden = false;

    const hand = snapshot.privateState?.hand || [];
    const releaseGroups = findReleaseGroups(hand);
    const startDelay = 1800;
    const stepDelay = 340;

    state.initialSweepTimers.push(window.setTimeout(() => {
      $startBanner.hidden = true;
      releaseGroups.forEach((group, index) => {
        state.initialSweepTimers.push(window.setTimeout(() => {
          state.initialCheckingCardIds = new Set(group);
          for (const cardId of group) state.initialReleaseCardIds.add(cardId);
          if (state.snapshot?.phase === 'pairing') renderMyHand(state.snapshot.privateState?.hand || []);
        }, index * stepDelay));
      });
    }, startDelay));
  }

  function clearInitialSweep() {
    for (const timer of state.initialSweepTimers) clearTimeout(timer);
    state.initialSweepTimers = [];
    state.initialCheckingCardIds = new Set();
    state.initialReleaseCardIds = new Set();
    state.initialSweepKey = '';
  }

  function findReleaseGroups(hand) {
    const groups = new Map();
    for (const card of hand) {
      const rank = rankFromLabel(card.label);
      if (rank === 'JOKER') continue;
      const cards = groups.get(rank) || [];
      cards.push(card);
      groups.set(rank, cards);
    }

    const releaseGroups = [];
    for (const cards of groups.values()) {
      const startIndex = cards.length % 2 === 1 ? 1 : 0;
      for (let index = startIndex; index + 1 < cards.length; index += 2) {
        releaseGroups.push([cards[index].cardId, cards[index + 1].cardId]);
      }
    }
    return releaseGroups;
  }

  function renderMyHand(hand) {
    $myHand.innerHTML = '';
    layoutCardFan($myHand, hand.length, {
      minWidth: 30,
      maxWidth: 68,
      heightRatio: 1.42,
      minStep: 12,
      maxStep: 46,
      fallbackWidth: 332,
    });
    hand.forEach((card, index) => {
      const button = document.createElement('button');
      button.className = 'hand-card';
      button.style.setProperty('--card-index', String(index));
      if (card.appealing || state.selectedPairCardIds.includes(card.cardId)) button.classList.add('appealing');
      if (state.initialCheckingCardIds.has(card.cardId)) button.classList.add('checking');
      if (state.initialReleaseCardIds.has(card.cardId)) button.classList.add('releasing');
      button.type = 'button';
      button.addEventListener('click', () => handleHandCardClick(card.cardId));

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
    const ghosts = [];
    if (state.removalAnim) ghosts.push(state.removalAnim);
    ghosts.push(...state.releaseGhosts);
    if (ghosts.length === 0) return;
    const slotCount = Math.max(
      state.snapshot?.privateState?.hand?.length || 1,
      ...ghosts.map(ghost => (ghost.slot || 0) + 1),
    );
    layoutCardFan($handOverlay, slotCount, {
      minWidth: 30,
      maxWidth: 68,
      heightRatio: 1.42,
      minStep: 12,
      maxStep: 46,
      fallbackWidth: 332,
    });

    ghosts.forEach(ghostData => {
      const ghost = document.createElement('div');
      ghost.className = 'hand-card removal-ghost';
      ghost.style.setProperty('--card-index', String(ghostData.slot || 0));
      ghost.innerHTML = `<span class="hand-card-name">${ghostData.cardLabel}</span><span class="hand-card-toggle">リリース</span>`;
      $handOverlay.appendChild(ghost);
    });
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
    clearTurnCountdown();
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

  function getRingPositions(count) {
    if (count <= 0) return [];
    if (count === 1) return [{ x: 50, y: 16 }];
    if (count === 2) return [{ x: 24, y: 18 }, { x: 76, y: 18 }];
    if (count === 3) return [{ x: 16, y: 46 }, { x: 50, y: 16 }, { x: 84, y: 46 }];
    const positions = [];
    const radiusX = 34;
    const radiusY = 30;
    for (let index = 0; index < count; index += 1) {
      const angle = (-90 + (180 * index) / (count - 1)) * (Math.PI / 180);
      positions.push({
        x: 50 + Math.cos(angle) * radiusX,
        y: 48 + Math.sin(angle) * radiusY,
      });
    }
    return positions;
  }

  function makeCardCountStack(count) {
    const stack = document.createElement('div');
    stack.className = 'card-count-stack';
    stack.setAttribute('aria-label', `${count}枚`);
    const visible = Math.min(4, Math.max(1, count));
    for (let index = 0; index < visible; index += 1) {
      const card = document.createElement('span');
      card.className = 'card-count-stack-card';
      card.style.setProperty('--stack-card-index', String(index));
      stack.appendChild(card);
    }
    const label = document.createElement('span');
    label.className = 'card-count-stack-label';
    label.textContent = String(count);
    stack.appendChild(label);
    return stack;
  }

  function makeReleaseGhosts(previousHand, removedLabels, drawnCardLabel, moveAt) {
    const usedCardIds = new Set();
    return removedLabels.map(label => {
      const previousIndex = previousHand.findIndex(card => (
        !usedCardIds.has(card.cardId) && card.label === label
      ));
      if (previousIndex !== -1) {
        usedCardIds.add(previousHand[previousIndex].cardId);
        return { slot: previousIndex, cardLabel: label, at: moveAt };
      }
      return {
        slot: insertionSlotForLabel(previousHand, drawnCardLabel || label),
        cardLabel: label,
        at: moveAt,
      };
    });
  }

  function insertionSlotForLabel(hand, label) {
    const incoming = labelSortKey(label);
    for (let index = 0; index < hand.length; index += 1) {
      if (compareLabelKeys(incoming, labelSortKey(hand[index].label)) < 0) return index;
    }
    return hand.length;
  }

  function rankFromLabel(label) {
    return String(label || '').replace(/[♠♣♥♦]/g, '');
  }

  function labelSortKey(label) {
    const text = String(label || '');
    const suit = text.includes('♠') ? 'S'
      : text.includes('♣') ? 'C'
      : text.includes('♥') ? 'H'
      : text.includes('♦') ? 'D'
      : 'X';
    return { rank: rankFromLabel(text), suit };
  }

  function compareLabelKeys(left, right) {
    const rankGap = rankWeight(left.rank) - rankWeight(right.rank);
    if (rankGap !== 0) return rankGap;
    return suitWeight(left.suit) - suitWeight(right.suit);
  }

  function rankWeight(rank) {
    const order = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER'];
    const index = order.indexOf(rank);
    return index === -1 ? 999 : index;
  }

  function suitWeight(suit) {
    const order = { S: 0, C: 1, H: 2, D: 3, X: 4 };
    return order[suit] ?? 99;
  }

  function layoutCardFan(element, count, options = {}) {
    const resolvedCount = Math.max(1, count || 1);
    const bounds = element.getBoundingClientRect();
    const fallbackWidth = options.fallbackWidth || Math.min(360, Math.max(280, window.innerWidth - 28));
    const available = Math.max(1, Math.floor((bounds.width || element.clientWidth || fallbackWidth) - 2));
    const minWidth = options.minWidth || 34;
    const maxWidth = options.maxWidth || 68;
    const minStep = options.minStep || 16;
    const maxStep = options.maxStep || 46;
    let cardWidth = Math.min(maxWidth, Math.max(minWidth, Math.floor(available * 0.2)));
    let step = resolvedCount <= 1 ? 0 : Math.floor((available - cardWidth) / (resolvedCount - 1));

    if (step < minStep) {
      cardWidth = Math.max(minWidth, Math.min(cardWidth, available - (minStep * (resolvedCount - 1))));
      step = resolvedCount <= 1 ? 0 : Math.floor((available - cardWidth) / (resolvedCount - 1));
    }

    const hardMinStep = Math.min(minStep, 12);
    step = resolvedCount <= 1 ? 0 : Math.max(hardMinStep, Math.min(maxStep, step));
    if (resolvedCount > 1 && minWidth + (step * (resolvedCount - 1)) > available) {
      step = Math.max(8, Math.floor((available - minWidth) / (resolvedCount - 1)));
    }
    cardWidth = Math.max(minWidth, Math.min(maxWidth, Math.floor(available - (step * (resolvedCount - 1)))));
    if (resolvedCount === 1) cardWidth = Math.min(maxWidth, Math.max(minWidth, available));

    const cardHeight = Math.round(cardWidth * (options.heightRatio || 1.42));
    element.style.setProperty('--hand-count', String(count || 0));
    element.style.setProperty('--hand-card-width', `${cardWidth}px`);
    element.style.setProperty('--hand-card-height', `${cardHeight}px`);
    element.style.setProperty('--hand-step', `${step}px`);
  }

  function renderTurnCountdown(snapshot) {
    clearTurnCountdown();
    const deadline = snapshot.publicState?.turnDeadlineAt;
    if (snapshot.phase !== 'playing' || !deadline) {
      $turnTimer.hidden = true;
      return;
    }
    $turnTimer.hidden = false;
    const update = () => {
      const remainSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $turnTimer.textContent = `${remainSeconds}s`;
      $turnTimer.classList.toggle('is-danger', remainSeconds <= 10);
    };
    update();
    state.turnCountdownTimer = window.setInterval(update, 250);
  }

  function clearTurnCountdown() {
    if (state.turnCountdownTimer) {
      clearInterval(state.turnCountdownTimer);
      state.turnCountdownTimer = null;
    }
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

  function handleHandCardClick(cardId) {
    if (!state.snapshot) return;
    if (state.snapshot.phase === 'pairing') {
      return;
    }
    toggleAppeal(state.snapshot, cardId);
  }

  function handlePairCardClick(cardId) {
    const hand = state.snapshot?.privateState?.hand || [];
    const card = hand.find(current => current.cardId === cardId);
    if (!card) return;

    if (state.selectedPairCardIds.includes(cardId)) {
      if (state.selectedPairCardIds.length === 2 && isDiscardablePair(hand, state.selectedPairCardIds)) {
        act('discard-pairs', { cardIds: state.selectedPairCardIds.slice() });
      } else {
        state.selectedPairCardIds = state.selectedPairCardIds.filter(id => id !== cardId);
        if (state.selectedPairCardIds.length === 0) clearPairSelection();
      }
      renderPlay(state.snapshot);
      return;
    }

    if (state.selectedPairCardIds.length >= 2) {
      clearPairSelection();
    }
    state.selectedPairCardIds = state.selectedPairCardIds.concat(cardId);
    ensurePairSelectionTimer();
    renderPlay(state.snapshot);
  }

  function isDiscardablePair(hand, cardIds) {
    if (cardIds.length !== 2) return false;
    const cards = cardIds.map(id => hand.find(card => card.cardId === id)).filter(Boolean);
    if (cards.length !== 2) return false;
    const left = cards[0].label.replace(/[♠♣♥♦]/g, '');
    const right = cards[1].label.replace(/[♠♣♥♦]/g, '');
    return left === right && left !== 'JOKER';
  }

  function ensurePairSelectionTimer() {
    state.pairSelectionDeadline = Date.now() + 15000;
    clearInterval(state.pairSelectionTimer);
    state.pairSelectionTimer = window.setInterval(() => {
      renderPairSelectionTimer();
      if (Date.now() >= state.pairSelectionDeadline) {
        clearPairSelection();
        if (state.snapshot?.phase === 'pairing') renderPlay(state.snapshot);
      }
    }, 250);
  }

  function renderPairSelectionTimer() {
    if (!state.pairSelectionDeadline) return;
    const remainMs = Math.max(0, state.pairSelectionDeadline - Date.now());
    $pairingTimer.textContent = `${Math.ceil(remainMs / 1000)}`;
  }

  function clearPairSelection() {
    state.selectedPairCardIds = [];
    state.pairSelectionDeadline = 0;
    clearInterval(state.pairSelectionTimer);
    state.pairSelectionTimer = null;
  }

  async function act(type, payload) {
    try {
      const snapshot = await api.room.action({ type, payload });
      if (type === 'discard-pairs') clearPairSelection();
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

    if (nextMove.type === 'starter-selected') {
      state.drawAnim = { cardLabel: `${nameById(nextSnapshot, nextMove.starterPlayerId)} が先手`, at: nextMove.at };
      window.setTimeout(() => {
        if (state.drawAnim?.at === nextMove.at) {
          state.drawAnim = null;
          if (state.snapshot?.phase === 'playing') renderPlay(state.snapshot);
        }
      }, 1200);
      return;
    }

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

      if ((nextMove.removedLabels || []).length > 0) {
        window.setTimeout(() => {
          state.releaseGhosts = makeReleaseGhosts(previousSnapshot?.privateState?.hand || [], nextMove.removedLabels, nextMove.drawnCardLabel, nextMove.at);
          if (state.snapshot?.phase === 'playing') renderPlay(state.snapshot);
          window.setTimeout(() => {
            state.releaseGhosts = state.releaseGhosts.filter(ghost => ghost.at !== nextMove.at);
            if (state.snapshot?.phase === 'playing') renderPlay(state.snapshot);
          }, 760);
        }, 620);
      }
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
  $pairingReady.addEventListener('click', async () => {
    try {
      setSnapshot(await api.room.action({ type: 'ready-play' }));
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
    clearPairSelection();
    clearInitialSweep();
    clearTurnCountdown();
    state.removalAnim = null;
    state.releaseGhosts = [];
    state.drawAnim = null;
    show('setup');
  }

  document.getElementById('leave-room').addEventListener('click', leaveRoom);
  document.getElementById('leave-after-result').addEventListener('click', leaveRoom);
  $copyInvite.addEventListener('click', copyInviteUrl);
  window.addEventListener('resize', () => {
    if (state.snapshot?.privateState) renderPlay(state.snapshot);
  });

  window.addEventListener('passplay-room-ended', event => {
    state.snapshot = null;
    state.previousSnapshot = null;
    state.selectedTargetSlot = null;
    state.lastTargetTapAt = 0;
    clearPairSelection();
    clearInitialSweep();
    clearTurnCountdown();
    state.removalAnim = null;
    state.releaseGhosts = [];
    state.drawAnim = null;
    show('setup');
    const reason = event.detail?.reason;
    setError(reason === 'kicked'
      ? '通信が切れたため部屋から退出しました。もう一度参加してください。'
      : '部屋が終了しました。');
  });

  $playerName.value = localStorage.getItem(USERNAME_STORAGE_KEY) || '';
  $joinRoomId.value = getRoomCodeFromUrl();

  api.room.onStateChange(snapshot => {
    if (snapshot) {
      setSnapshot(snapshot);
    } else if (state.snapshot) {
      state.snapshot = null;
      state.previousSnapshot = null;
      clearPairSelection();
      clearInitialSweep();
      clearTurnCountdown();
      show('setup');
    }
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
}
