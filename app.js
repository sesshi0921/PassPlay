(() => {
  'use strict';

  const STORAGE_KEY = 'passplay.players';
  const MAX_PLAYERS = 16;
  const MAX_NAME_LEN = 16;

  const $grid = document.getElementById('games-grid');
  const $list = document.getElementById('players-list');
  const $count = document.getElementById('players-count');
  const $form = document.getElementById('player-form');
  const $input = document.getElementById('player-input');

  // プレーヤー永続化
  function loadPlayers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(s => typeof s === 'string' && s.length > 0) : [];
    } catch {
      return [];
    }
  }
  function savePlayers(players) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  }

  // トースト
  let toastEl = null;
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  // ゲーム一覧描画
  async function renderGames() {
    let games = [];
    try {
      const res = await fetch('./games.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('fetch failed');
      games = await res.json();
      if (!Array.isArray(games)) games = [];
    } catch (e) {
      games = [];
    }

    $grid.innerHTML = '';
    if (games.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'game-card empty';
      empty.textContent = 'ゲーム未登録';
      $grid.appendChild(empty);
      return;
    }
    for (const g of games) {
      const a = document.createElement('a');
      a.className = 'game-card';
      a.href = `./games/${g.id}/index.html`;
      const img = document.createElement('img');
      img.src = `./games/${g.id}/${g.icon || 'icon.png'}`;
      img.alt = g.name || g.id;
      img.onerror = () => {
        img.replaceWith(Object.assign(document.createElement('div'), {
          className: 'icon-fallback',
          textContent: '🎮',
          style: 'font-size:42px;line-height:1'
        }));
      };
      const name = document.createElement('div');
      name.className = 'game-name';
      name.textContent = g.name || g.id;
      a.appendChild(img);
      a.appendChild(name);
      if (g.min !== undefined) {
        const min = document.createElement('div');
        min.className = 'game-min';
        min.textContent = `${g.min}人~`;
        a.appendChild(min);
      }
      $grid.appendChild(a);
    }
    // 奇数で末尾調整: グリッドが2列なので奇数時の見栄えは自然
  }

  // プレーヤー描画
  function renderPlayers() {
    const players = loadPlayers();
    $count.textContent = String(players.length);
    $list.innerHTML = '';
    if (players.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-list';
      li.textContent = 'プレーヤーを追加してください';
      $list.appendChild(li);
      return;
    }
    players.forEach((name, idx) => {
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.className = 'player-name';
      nameEl.textContent = name;
      const btn = document.createElement('button');
      btn.className = 'btn-remove';
      btn.type = 'button';
      btn.textContent = '×';
      btn.setAttribute('aria-label', `${name} を削除`);
      btn.addEventListener('click', () => removePlayer(idx));
      li.appendChild(nameEl);
      li.appendChild(btn);
      $list.appendChild(li);
    });
  }

  function addPlayer(name) {
    const trimmed = name.trim();
    if (!trimmed) {
      toast('名前を入力してください');
      return;
    }
    if (trimmed.length > MAX_NAME_LEN) {
      toast(`${MAX_NAME_LEN}文字以内で入力してください`);
      return;
    }
    const players = loadPlayers();
    if (players.length >= MAX_PLAYERS) {
      toast(`プレーヤーは最大${MAX_PLAYERS}人までです`);
      return;
    }
    if (players.includes(trimmed)) {
      toast('同じ名前は登録できません');
      return;
    }
    players.push(trimmed);
    savePlayers(players);
    renderPlayers();
  }

  function removePlayer(idx) {
    const players = loadPlayers();
    if (idx < 0 || idx >= players.length) return;
    players.splice(idx, 1);
    savePlayers(players);
    renderPlayers();
  }

  $form.addEventListener('submit', (e) => {
    e.preventDefault();
    addPlayer($input.value);
    $input.value = '';
    $input.focus();
  });

  renderGames();
  renderPlayers();
})();
