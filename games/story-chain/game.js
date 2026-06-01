(() => {
  'use strict';

  const STORAGE_KEY = 'passplay.players';
  const PART_CLASSES = ['phase-ki', 'phase-sho', 'phase-ten', 'phase-ketsu'];
  const PART_LABELS = ['起', '承', '転', '結'];
  const BADGE_CLASSES = ['badge-ki', 'badge-sho', 'badge-ten', 'badge-ketsu'];
  const TEXT_CLASSES = ['ki-text', 'sho-text', 'ten-text', 'ketsu-text'];

  const state = {
    players: [],
    story: [],
    currentIdx: 0,
  };

  const phases = Array.from(document.querySelectorAll('[data-phase]'));
  function show(name) {
    for (const el of phases) {
      el.hidden = (el.dataset.phase !== name);
    }
  }

  function setPartColor(idx) {
    document.body.classList.remove(...PART_CLASSES);
    if (idx >= 0 && idx < PART_CLASSES.length) {
      document.body.classList.add(PART_CLASSES[idx]);
    }
  }

  function loadPlayers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(s => typeof s === 'string' && s.length > 0) : [];
    } catch {
      return [];
    }
  }

  function initGame() {
    const players = loadPlayers();
    if (players.length < 4) {
      alert('4人のプレイヤーが必要です');
      return;
    }
    state.players = players.slice(0, 4);
    state.story = [];
    state.currentIdx = 0;
    setPartColor(0);
    show('pass');
    updatePass();
  }

  function updatePass() {
    const player = state.players[state.currentIdx];
    document.getElementById('pass-name').textContent = player;
  }

  function showWrite() {
    const player = state.players[state.currentIdx];
    const part = PART_LABELS[state.currentIdx];
    document.getElementById('write-name').textContent = player;
    const storyDisplay = document.getElementById('story-display');
    storyDisplay.innerHTML = `<p style="color:#999;">「${part}」を入力してください</p>`;
    document.getElementById('write-input').value = '';
    document.getElementById('write-input').placeholder = `${part}を入力してください`;
    document.getElementById('write-input').focus();
    show('write');
  }

  function handleSubmit() {
    const input = document.getElementById('write-input');
    const sentence = input.value.trim();
    if (!sentence) {
      alert('1文を入力してください');
      return;
    }
    state.story.push(sentence);
    state.currentIdx++;
    if (state.currentIdx >= state.players.length) {
      document.body.classList.remove(...PART_CLASSES);
      show('view');
      let storyHtml = '';
      state.story.forEach((s, i) => {
        storyHtml += `<div class="${TEXT_CLASSES[i]}"><span class="part-badge ${BADGE_CLASSES[i]}">${PART_LABELS[i]}</span>${s}</div>`;
      });
      document.getElementById('final-story').innerHTML = storyHtml;
    } else {
      setPartColor(state.currentIdx);
      show('pass');
      updatePass();
    }
  }

  document.getElementById('btn-start').addEventListener('click', initGame);
  document.getElementById('btn-pass-next').addEventListener('click', showWrite);
  document.getElementById('write-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit();
  });
  document.getElementById('btn-again').addEventListener('click', initGame);

  const setupPlayers = document.getElementById('setup-players');
  const players = loadPlayers();
  if (players.length >= 4) {
    setupPlayers.innerHTML = `<p>${players.join(', ')}</p><p>${players.length}人で作成</p>`;
  } else {
    setupPlayers.innerHTML = '<p>プレイヤーが足りません（最低4人必要）</p>';
  }

  show('setup');
})();
