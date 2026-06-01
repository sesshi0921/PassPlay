(() => {
  'use strict';

  const STORAGE_KEY = 'passplay.players';

  const state = {
    allPlayers: [],
    selectedPlayers: [],
    selectedRoles: {},
    haiku: { line1: '', line2: '', line3: '' },
    currentInputIdx: 0,
    inputParts: ['上句（5音）', '中句（7音）', '下句（5音）'],
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

  function selectRandomPlayers(players, count) {
    const shuffled = players.slice().sort(() => randInt(3) - 1);
    return shuffled.slice(0, count);
  }

  function initGame() {
    state.allPlayers = loadPlayers();
    if (state.allPlayers.length < 3) {
      alert('3人以上のプレイヤーが必要です');
      return;
    }
    state.selectedPlayers = selectRandomPlayers(state.allPlayers, 3);
    const roles = ['上句', '中句', '下句'];
    const roleIndices = [0, 1, 2];
    for (let i = roleIndices.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [roleIndices[i], roleIndices[j]] = [roleIndices[j], roleIndices[i]];
    }
    state.selectedPlayers.forEach((p, i) => {
      state.selectedRoles[p] = roles[roleIndices[i]];
    });
    show('select');
    renderSelect();
  }

  function renderSelect() {
    const info = document.getElementById('select-info');
    let html = '<div style="font-size:16px; line-height:1.8;">';
    state.selectedPlayers.forEach(p => {
      html += `<p>${p}: <strong>${state.selectedRoles[p]}</strong></p>`;
    });
    html += '</div>';
    info.innerHTML = html;
  }

  function showInput() {
    if (state.currentInputIdx >= 3) {
      show('reveal');
      renderReveal();
      return;
    }
    const player = state.selectedPlayers[state.currentInputIdx];
    const part = state.inputParts[state.currentInputIdx];
    document.getElementById('input-player').textContent = player;
    document.getElementById('input-part').textContent = part;
    document.getElementById('input-text').value = '';
    document.getElementById('input-text').focus();
    show('input');
  }

  function handleInput() {
    const text = document.getElementById('input-text').value.trim();
    if (!text) return;
    const lineKey = `line${state.currentInputIdx + 1}`;
    state.haiku[lineKey] = text;
    state.currentInputIdx++;
    showInput();
  }

  function renderReveal() {
    document.getElementById('line1').textContent = state.haiku.line1;
    document.getElementById('line2').textContent = state.haiku.line2;
    document.getElementById('line3').textContent = state.haiku.line3;
  }

  function revealLine(idx) {
    const lineIds = ['line1', 'line2', 'line3'];
    const btnIds = ['btn-reveal-line1', 'btn-reveal-line2', 'btn-reveal-line3'];
    const lineEl = document.getElementById(lineIds[idx]);
    lineEl.classList.remove('fade-in-hidden');
    lineEl.classList.add('fade-in-visible');
    document.getElementById(btnIds[idx]).hidden = true;
    if (idx < 2) {
      document.getElementById(btnIds[idx + 1]).hidden = false;
    } else {
      document.getElementById('final-actions').hidden = false;
    }
  }

  document.getElementById('btn-start').addEventListener('click', initGame);

  document.getElementById('btn-to-input').addEventListener('click', () => {
    state.currentInputIdx = 0;
    state.haiku = { line1: '', line2: '', line3: '' };
    showInput();
  });

  document.getElementById('input-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleInput();
  });

  document.getElementById('btn-reveal-line1').addEventListener('click', () => revealLine(0));
  document.getElementById('btn-reveal-line2').addEventListener('click', () => revealLine(1));
  document.getElementById('btn-reveal-line3').addEventListener('click', () => revealLine(2));

  document.getElementById('btn-again').addEventListener('click', initGame);

  const setupPlayers = document.getElementById('setup-players');
  const players = loadPlayers();
  if (players.length >= 3) {
    setupPlayers.innerHTML = `<p>${players.join(', ')}</p><p>${players.length}人から3人をランダム選択</p>`;
  } else {
    setupPlayers.innerHTML = '<p>プレイヤーが足りません（最低3人必要）</p>';
  }

  show('setup');
})();
