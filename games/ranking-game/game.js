window.PassPlay.register(async api => {
  'use strict';

  const sharedPlayers = await api.players.list();
  const THEMES = [
    '嬉しい夜ご飯',
    '家の向かいに欲しい商業施設',
    'かっこいいひらがな',
    'テンションが上がる朝のイベント',
    '好きなお菓子',
    '最高に居心地の良い場所',
    '思わず笑顔になる瞬間',
    '夢の職業',
    '旅行先にしたい都市',
    '一番幸せを感じる季節のイベント',
  ];

  const state = {
    players: [],
    scores: {},
    currentDistributeIdx: 0,
    theme: '',
    judgeOrder: [],
  };

  const phases = Array.from(document.querySelectorAll('[data-phase]'));
  function show(name) {
    for (const el of phases) el.hidden = (el.dataset.phase !== name);
  }

  function randInt(n) { return Math.floor(Math.random() * n); }

  function loadPlayers() {
    return sharedPlayers.slice();
  }

  function generateScores(n) {
    const pool = Array.from({ length: 101 }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  }

  function initGame() {
    const players = loadPlayers();
    if (players.length < 3) { alert('3人以上のプレイヤーが必要です'); return; }
    state.players = players;
    state.scores = {};
    state.judgeOrder = [];
    state.currentDistributeIdx = 0;
    state.theme = THEMES[randInt(THEMES.length)];
    const playerScores = generateScores(state.players.length);
    state.players.forEach((p, i) => { state.scores[p] = playerScores[i]; });
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
    distReveal.onclick = () => distReveal.classList.add('revealed');
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
      btn.textContent = player;
      btn.dataset.player = player;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.classList.add('selected');
        state.judgeOrder.push(player);
        const num = document.createElement('div');
        num.className = 'judge-num';
        num.textContent = `${state.judgeOrder.length}位: ${player}`;
        orderEl.appendChild(num);
        if (state.judgeOrder.length === state.players.length) confirmBtn.hidden = false;
      });
      btnsEl.appendChild(btn);
    });
    show('judge');
  }

  function judgeResults() {
    const correct = [...state.players].sort((a, b) => state.scores[b] - state.scores[a]);
    const isCorrect = state.judgeOrder.every((p, i) => p === correct[i]);
    const scoreLines = correct.map((p, i) => {
      const mark = state.judgeOrder[i] === p ? '✅' : '❌';
      return `<div class="score-line">${mark} ${i + 1}位: ${p} (${state.scores[p]}点)</div>`;
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

  document.getElementById('btn-to-judge').addEventListener('click', showJudge);
  document.getElementById('btn-judge-confirm').addEventListener('click', judgeResults);
  document.getElementById('btn-again').addEventListener('click', initGame);

  const players = loadPlayers();
  document.getElementById('setup-players').innerHTML = players.length >= 3
    ? `<p>${players.join(', ')}</p><p>${players.length}人でプレイ</p>`
    : '<p>プレイヤーが足りません（最低3人必要）</p>';

  show('setup');
});
