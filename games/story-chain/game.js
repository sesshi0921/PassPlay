(() => {
  'use strict';

  const STORAGE_KEY = 'passplay.players';

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
    show('pass');
    updatePass();
  }

  function updatePass() {
    const player = state.players[state.currentIdx];
    document.getElementById('pass-name').textContent = player;
  }

  function showWrite() {
    const player = state.players[state.currentIdx];
    const parts = ['起', '承', '転', '結'];
    const part = parts[state.currentIdx];
    document.getElementById('write-name').textContent = player;
    const storyDisplay = document.getElementById('story-display');
    storyDisplay.innerHTML = `<strong>${part}:</strong> ${state.story.map((s, i) => `<p>${s}</p>`).join('')}` || '<p style="color: #999;">（まだ何も書かれていません）</p>';
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
      show('view');
      const parts = ['起', '承', '転', '結'];
      let storyHtml = '';
      state.story.forEach((s, i) => {
        storyHtml += `<p><strong>${parts[i]}:</strong> ${s}</p>`;
      });
      document.getElementById('final-story').innerHTML = storyHtml;
    } else {
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
  if (players.length >= 2) {
    setupPlayers.innerHTML = `<p>${players.join(', ')}</p><p>${players.length}人で作成</p>`;
  } else {
    setupPlayers.innerHTML = '<p>プレイヤーが足りません（最低2人必要）</p>';
  }

  show('setup');
})();
