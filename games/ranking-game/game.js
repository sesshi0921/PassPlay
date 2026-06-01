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
    judgeOrder: [],
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
    distReveal.classList.remove('revealed');
    distValue.textContent = state.scores[player];
    distReveal.onclick = () => {
      distReveal.classList.add('revealed');
    };
  }

  function showPropose() {
    if (state.currentProposeIdx >= state.players.length) {
      showJudge();
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

  function showJudge() {
    state.judgeOrder = [];
    const shuffled = [...state.players].sort(() => Math.random() - 0.5);
    const btnsEl = document.getElementById('judge-btns');
    const orderEl = document.getElementById('judge-order');
    const confirmBtn = document.getElementById('btn-judge-confirm');
    btnsEl.innerHTML = '';
    orderEl.innerHTML = '';
    confirmBtn.hidden = true;
    shuffled.forEach(player => {
      const btn = document.createElement('button');
      btn.className = 'judge-player-btn';
      btn.textContent = `${player}：${state.proposals[player] || '?'}`;
      btn.dataset.player = player;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.classList.add('selected');
        state.judgeOrder.push(player);
        const num = document.createElement('span');
        num.className = 'judge-num';
        num.textContent = `${state.judgeOrder.length}位: ${player}`;
        orderEl.appendChild(num);
        if (state.judgeOrder.length === state.players.length) {
          confirmBtn.hidden = false;
        }
      });
      btnsEl.appendChild(btn);
    });
    show('judge');
  }

  function judgeResults() {
    const correct = [...state.players].sort((a, b) => state.scores[b] - state.scores[a]);
    const isCorrect = state.judgeOrder.every((p, i) => p === correct[i]);
    const scoreLines = correct.map((p, i) => {
      const marked = state.judgeOrder[i] === p ? '✅' : '❌';
      return `<div class="score-line">${marked} ${i + 1}位: ${state.proposals[p] || '?'} (${p} / ${state.scores[p]}点)</div>`;
    }).join('');
    const verdict = `<div class="judge-verdict ${isCorrect ? 'success' : 'fail'}">${isCorrect ? '成功！🎉' : '失敗...'}</div>`;
    document.getElementById('result-body').innerHTML = verdict + scoreLines;
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

  document.getElementById('btn-judge-confirm').addEventListener('click', judgeResults);

  document.getElementById('propose-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('propose-input');
    const proposal = input.value.trim();
    if (proposal) {
      const player = state.players[state.currentProposeIdx];
      state.proposals[player] = proposal;
      state.currentProposeIdx++;
      if (state.currentProposeIdx >= state.players.length) {
        showJudge();
      } else {
        showPropose();
      }
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
