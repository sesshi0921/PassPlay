(() => {
  'use strict';

  const STORAGE_KEY = 'passplay.players';
  const MIN_PLAYERS = 3;

  // 状態
  const state = {
    players: [],          // [string]
    pair: null,           // { majority, wolf }
    wolfIndex: -1,        // players の何番目が人狼か
    revealIndex: 0,       // reveal で次に見せるプレーヤー
    voteIndex: 0,         // vote で次に投票するプレーヤー
    votes: [],            // votes[i] = 投票先 index
    timerTotalSec: 0,
    timerRemainSec: 0,
    timerHandle: null,
    nextAfterPass: null,  // pass フェーズから戻る先のフェーズ名
  };

  // フェーズ切替
  const phases = Array.from(document.querySelectorAll('[data-phase]'));
  function show(name) {
    for (const el of phases) {
      el.hidden = (el.dataset.phase !== name);
    }
  }

  // ユーティリティ
  function randInt(n) { return Math.floor(Math.random() * n); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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

  // ===== setup =====
  function renderSetup() {
    state.players = loadPlayers();
    const $box = document.getElementById('setup-players');
    const $btn = document.getElementById('btn-start');
    if (state.players.length < MIN_PLAYERS) {
      $box.innerHTML = `
        <div>プレーヤー: <strong>${state.players.length}</strong> 人</div>
        <div class="warn">あと ${MIN_PLAYERS - state.players.length} 人以上、トップで追加してください</div>
      `;
      $btn.disabled = true;
    } else {
      $box.innerHTML = `
        <div>プレーヤー: <strong>${state.players.length}</strong> 人</div>
        <ul>${state.players.map(p => `<li>${escapeHTML(p)}</li>`).join('')}</ul>
      `;
      $btn.disabled = false;
    }
    show('setup');
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ===== ゲーム開始: 単語ペア・人狼決定 =====
  async function startGame() {
    if (state.players.length < MIN_PLAYERS) return;
    const res = await fetch('./words.json', { cache: 'no-cache' });
    const words = await res.json();
    if (!Array.isArray(words) || words.length === 0) {
      alert('単語データの読み込みに失敗しました');
      return;
    }
    const pair = words[randInt(words.length)];
    // 50%でmajority/wolfを入れ替え（多数派と少数派の単語のどちらが「お題」かは固定でなくランダム化）
    if (Math.random() < 0.5) {
      state.pair = { majority: pair.wolf, wolf: pair.majority };
    } else {
      state.pair = { majority: pair.majority, wolf: pair.wolf };
    }
    state.wolfIndex = randInt(state.players.length);
    state.revealIndex = 0;
    state.voteIndex = 0;
    state.votes = new Array(state.players.length).fill(-1);
    goPass(state.players[state.revealIndex], 'reveal');
  }

  // ===== pass: 次のプレーヤーに端末を渡す =====
  function goPass(nextName, nextPhase) {
    document.getElementById('pass-name').textContent = nextName;
    state.nextAfterPass = nextPhase;
    show('pass');
  }

  // ===== reveal =====
  function renderReveal() {
    const name = state.players[state.revealIndex];
    document.getElementById('reveal-name').textContent = name;
    const $show = document.getElementById('btn-reveal-show');
    const $wordBox = document.getElementById('reveal-word-box');
    const $done = document.getElementById('btn-reveal-done');
    $show.hidden = false;
    $wordBox.hidden = true;
    $done.hidden = true;
    show('reveal');
  }

  function revealShow() {
    const word = state.revealIndex === state.wolfIndex ? state.pair.wolf : state.pair.majority;
    document.getElementById('reveal-word').textContent = word;
    document.getElementById('btn-reveal-show').hidden = true;
    document.getElementById('reveal-word-box').hidden = false;
    document.getElementById('btn-reveal-done').hidden = false;
  }

  function revealNext() {
    state.revealIndex++;
    if (state.revealIndex >= state.players.length) {
      // 全員見終わった → 議論タイム設定
      show('timer-setup');
      return;
    }
    goPass(state.players[state.revealIndex], 'reveal');
  }

  // ===== timer / discuss =====
  function startDiscuss(minutes) {
    const min = Number(minutes);
    if (!Number.isFinite(min) || min < 1 || min > 30) {
      alert('1〜30分の範囲で指定してください');
      return;
    }
    state.timerTotalSec = Math.floor(min * 60);
    state.timerRemainSec = state.timerTotalSec;
    const $t = document.getElementById('timer-display');
    $t.textContent = formatTime(state.timerRemainSec);
    $t.classList.remove('warning');
    show('discuss');
    clearInterval(state.timerHandle);
    state.timerHandle = setInterval(() => {
      state.timerRemainSec--;
      if (state.timerRemainSec <= 10) $t.classList.add('warning');
      if (state.timerRemainSec <= 0) {
        clearInterval(state.timerHandle);
        state.timerHandle = null;
        $t.textContent = '00:00';
        goVoteStart();
        return;
      }
      $t.textContent = formatTime(state.timerRemainSec);
    }, 1000);
  }

  function stopTimer() {
    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
  }

  // ===== vote =====
  function goVoteStart() {
    stopTimer();
    state.voteIndex = 0;
    state.votes = new Array(state.players.length).fill(-1);
    goPass(state.players[state.voteIndex], 'vote');
  }

  function renderVote() {
    const voter = state.players[state.voteIndex];
    document.getElementById('vote-name').textContent = voter;
    const $list = document.getElementById('vote-list');
    $list.innerHTML = '';
    state.players.forEach((p, i) => {
      if (i === state.voteIndex) return; // 自己投票禁止
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = p;
      btn.addEventListener('click', () => {
        state.votes[state.voteIndex] = i;
        state.voteIndex++;
        if (state.voteIndex >= state.players.length) {
          renderResult();
        } else {
          goPass(state.players[state.voteIndex], 'vote');
        }
      });
      li.appendChild(btn);
      $list.appendChild(li);
    });
    show('vote');
  }

  // ===== result =====
  function renderResult() {
    // 集計
    const tally = new Array(state.players.length).fill(0);
    for (const v of state.votes) {
      if (v >= 0) tally[v]++;
    }
    const maxVotes = Math.max(...tally);
    const topIndexes = [];
    tally.forEach((n, i) => { if (n === maxVotes) topIndexes.push(i); });

    const wolfName = state.players[state.wolfIndex];
    const wolfCaught = topIndexes.length === 1 && topIndexes[0] === state.wolfIndex;
    const tie = topIndexes.length > 1;
    const wolfInTie = tie && topIndexes.includes(state.wolfIndex);

    let verdict;
    let verdictClass;
    if (wolfCaught) {
      verdict = '村人の勝利！';
      verdictClass = 'win';
    } else if (wolfInTie) {
      verdict = '同票 → 村人の勝利（人狼含む）';
      verdictClass = 'win';
    } else {
      verdict = '人狼の勝利！';
      verdictClass = 'lose';
    }

    const topNames = topIndexes.map(i => state.players[i]).join('、');
    const tallyRows = state.players.map((p, i) => {
      const mark = (i === state.wolfIndex) ? ' 🐺' : '';
      return `<div class="row"><span>${escapeHTML(p)}${mark}</span><span class="v">${tally[i]} 票</span></div>`;
    }).join('');

    document.getElementById('result-body').innerHTML = `
      <div class="verdict ${verdictClass}">${verdict}</div>
      <h3>最多得票</h3>
      <p class="big">${escapeHTML(topNames)}（${maxVotes} 票）</p>
      <h3>人狼の正体</h3>
      <p class="big">${escapeHTML(wolfName)}</p>
      <h3>単語</h3>
      <div class="row"><span>多数派</span><span class="v">${escapeHTML(state.pair.majority)}</span></div>
      <div class="row"><span>人狼</span><span class="v">${escapeHTML(state.pair.wolf)}</span></div>
      <h3 style="margin-top:14px">投票内訳</h3>
      ${tallyRows}
    `;
    show('result');
  }

  // ===== イベント登録 =====
  function bind() {
    document.getElementById('btn-start').addEventListener('click', startGame);

    document.getElementById('btn-pass-next').addEventListener('click', () => {
      const next = state.nextAfterPass;
      if (next === 'reveal') renderReveal();
      else if (next === 'vote') renderVote();
      else show(next);
    });

    document.getElementById('btn-reveal-show').addEventListener('click', revealShow);
    document.getElementById('btn-reveal-done').addEventListener('click', revealNext);

    document.querySelectorAll('.time-btn').forEach(b => {
      b.addEventListener('click', () => startDiscuss(b.dataset.min));
    });
    document.getElementById('btn-custom-start').addEventListener('click', () => {
      const v = document.getElementById('custom-min').value;
      startDiscuss(v);
    });

    document.getElementById('btn-to-vote').addEventListener('click', goVoteStart);

    document.getElementById('btn-again').addEventListener('click', () => {
      // 同じプレーヤーで再戦
      startGame();
    });

    // ページ離脱時のタイマー停止
    window.addEventListener('pagehide', stopTimer);
  }

  // 起動
  bind();
  renderSetup();
})();
