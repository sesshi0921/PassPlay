(() => {
  'use strict';

  const STORAGE_KEY = 'passplay.players';
  const THEMES = [
    '嬉しい夜ご飯',
    '家の向かいに欲しい商業施設',
    'かっこいいひらがな',
    'テンションが上がる朝のイベント',
    '好きなお菓子',
    '最高に居心地の良い場所',
    '思わず笑顔になる瞬間',
    '夢の職業',
  ];

  const state = {
    players: [],
    scores: {},
    currentDistributeIdx: 0,
    currentProposeIdx: 0,
    theme: '',
    proposals: {},
  };

  const phases = Array.from(document.querySelectorAll('[data-phase]'));
  function show(name) {
    for (const el of phases) {
      el.hidden = (el.dataset.phase !== name);
    }
  }

  function randInt(n) { return Math.floor(Math.random() * n); }

  function loadPlayers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(s => typeof s === 'string' && s.length > 0) : [];
    } catch {
      return [];
    }
  }

  function generateScores(n) {
    const scores = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [scores[i], scores[j]] = [scores[j], scores[i]];
    }
    return scores.map((_, i) => Math.floor((i / (n - 1)) * 100));
  }

  function initGame() {
    const players = loadPlayers();
    if (players.length < 3) {
      alert('3人以上のプレイヤーが必要です');
      return;
    }
    state.players = players;
    state.scores = {};
    state.proposals = {};
    state.currentDistributeIdx = 0;
    state.currentProposeIdx = 0;
    state.theme = THEMES[randInt(THEMES.length)];
    const playerScores = generateScores(state.players.length);
    state.players.forEach((p, i) => {
      state.scores[p] = playerScores[i];
    });
    show('distribute');
    showDistribute();
  }

  function showDistribute() {
    if (state.currentDistributeIdx >= state.players.length) {
      show('theme');
      document.getElementById('theme-box').textContent = state.theme;
      return;
    }
    const player = state.players[state.currentDistributeIdx];
    document.getElementById('dist-name').textContent = player;
    const distReveal = document.getElementById('dist-reveal');
    const distValue = document.getElementById('dist-value');
    const distPrompt = distReveal.querySelector('.dist-prompt');
    distReveal.classList.remove('revealed');
    distPrompt.hidden = false;
    distValue.hidden = true;
    distReveal.onclick = () => {
      distPrompt.hidden = true;
      distValue.hidden = false;
      distReveal.classList.add('revealed');
    };
  }

  function showPropose() {
    if (state.currentProposeIdx >= state.players.length) {
      judgeResults();
      return;
    }
    const player = state.players[state.currentProposeIdx];
    document.querySelector('.propose-sub').textContent = player + ' の提案を入力してください';
    document.getElementById('propose-input').value = '';
    document.getElementById('propose-input').focus();
    renderProposals();
  }

  function renderProposals() {
    const list = document.getElementById('propose-list');
    list.innerHTML = '';
    state.players.slice(0, state.currentProposeIdx).forEach(p => {
      const item = document.createElement('div');
      item.className = 'propose-item';
      item.innerHTML = `<strong>${p}</strong>: ${state.proposals[p] || '未定'}`;
      list.appendChild(item);
    });
  }

  function judgeResults() {
    const sorted = [...state.players].sort((a, b) => state.scores[b] - state.scores[a]);
    const scoreOrder = sorted.map(p => ({ name: p, score: state.scores[p], proposal: state.proposals[p] || '?' }));
    const resultHtml = scoreOrder.map(item => {
      return `<div class="score-line"><strong>${item.score}</strong>: ${item.proposal} (${item.name})</div>`;
    }).join('');
    document.getElementById('result-body').innerHTML = resultHtml;
    show('result');
  }

  document.getElementById('btn-start').addEventListener('click', initGame);

  document.getElementById('btn-dist-next').addEventListener('click', () => {
    state.currentDistributeIdx++;
    if (state.currentDistributeIdx >= state.players.length) {
      show('theme');
      document.getElementById('theme-box').textContent = state.theme;
    } else {
      showDistribute();
    }
  });

  document.getElementById('btn-to-propose').addEventListener('click', () => {
    show('propose');
    showPropose();
  });

  document.getElementById('propose-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('propose-input');
    const proposal = input.value.trim();
    if (proposal) {
      const player = state.players[state.currentProposeIdx];
      state.proposals[player] = proposal;
      state.currentProposeIdx++;
      showPropose();
    }
  });

  document.getElementById('btn-again').addEventListener('click', initGame);

  const setupPlayers = document.getElementById('setup-players');
  const players = loadPlayers();
  if (players.length >= 3) {
    setupPlayers.innerHTML = `<p>${players.join(', ')}</p><p>${players.length}人でプレイ</p>`;
  } else {
    setupPlayers.innerHTML = '<p>プレイヤーが足りません（最低3人必要）</p>';
  }

  show('setup');
})();
