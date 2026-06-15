(() => {
  'use strict';

  const STORAGE_KEY = 'passplay.players';
  const MODE_STORAGE_KEY = 'passplay.mode';
  const DEFAULT_MODE = 'single';
  const VALID_MODES = new Set(['single', 'multi']);
  const MAX_PLAYERS = 16;
  const MAX_NAME_LEN = 16;

  const $grid = document.getElementById('games-grid');
  const $list = document.getElementById('players-list');
  const $count = document.getElementById('players-count');
  const $form = document.getElementById('player-form');
  const $input = document.getElementById('player-input');
  const $playersSheet = document.getElementById('players-sheet');
  const $playersToggle = document.getElementById('players-toggle');
  const $playersBackdrop = document.getElementById('players-backdrop');
  const $playersSheetContent = document.getElementById('players-sheet-content');
  const $marqueeRows = [
    document.getElementById('icon-marquee-row-1'),
    document.getElementById('icon-marquee-row-2'),
  ];
  const $modeButtons = [...document.querySelectorAll('[data-mode]')];
  const $modePanels = [...document.querySelectorAll('[data-mode-panel]')];

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    const bottomInset = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    document.documentElement.style.setProperty('--visual-bottom', `${bottomInset}px`);
  }

  function initialMode() {
    const queryMode = new URLSearchParams(window.location.search).get('mode');
    if (VALID_MODES.has(queryMode)) return queryMode;
    const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
    return VALID_MODES.has(savedMode) ? savedMode : DEFAULT_MODE;
  }

  function selectMode(mode, updateUrl = true) {
    const selectedMode = VALID_MODES.has(mode) ? mode : DEFAULT_MODE;
    if (selectedMode !== 'single') setPlayersSheetOpen(false);
    for (const button of $modeButtons) {
      const selected = button.dataset.mode === selectedMode;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const panel of $modePanels) {
      const selected = panel.dataset.modePanel === selectedMode;
      panel.hidden = !selected;
      panel.classList.toggle('is-active', selected);
    }
    localStorage.setItem(MODE_STORAGE_KEY, selectedMode);

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', selectedMode);
      history.replaceState(null, '', url);
    }
  }

  function setPlayersSheetOpen(open) {
    $playersSheet.classList.toggle('is-open', open);
    $playersToggle.setAttribute('aria-expanded', String(open));
    $playersBackdrop.hidden = !open;
    $playersSheetContent.inert = !open;
    $playersSheetContent.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('players-sheet-open', open);
  }

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
  function renderMarquee(games) {
    for (const [rowIndex, row] of $marqueeRows.entries()) {
      row.innerHTML = '';
      const sequence = rowIndex === 0 ? games : games.slice().reverse();
      for (let repeat = 0; repeat < 4; repeat++) {
        for (const game of sequence) {
          const img = document.createElement('img');
          img.src = `./games/${game.id}/${game.icon || 'icon.png'}`;
          img.alt = '';
          row.appendChild(img);
        }
      }
    }
  }

  function sortGamesByMinimumPlayers(games) {
    return games
      .map((game, index) => ({ game, index }))
      .sort((a, b) => {
        const aMin = Number.isFinite(Number(a.game.min)) ? Number(a.game.min) : Infinity;
        const bMin = Number.isFinite(Number(b.game.min)) ? Number(b.game.min) : Infinity;
        return aMin - bMin || a.index - b.index;
      })
      .map(({ game }) => game);
  }

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

    renderMarquee(games);
    const sortedGames = sortGamesByMinimumPlayers(games);
    $grid.innerHTML = '';
    if (sortedGames.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'game-card empty';
      empty.textContent = 'ゲーム未登録';
      $grid.appendChild(empty);
      return;
    }
    for (const g of sortedGames) {
      const a = document.createElement('a');
      a.className = 'game-card';
      a.href = `./play.html?game=${encodeURIComponent(g.id)}`;
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

  $playersToggle.addEventListener('click', () => {
    const open = !$playersSheet.classList.contains('is-open');
    setPlayersSheetOpen(open);
  });
  $playersBackdrop.addEventListener('click', () => setPlayersSheetOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $playersSheet.classList.contains('is-open')) {
      setPlayersSheetOpen(false);
      $playersToggle.focus();
    }
  });

  for (const button of $modeButtons) {
    button.addEventListener('click', () => selectMode(button.dataset.mode));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const nextMode = button.dataset.mode === 'single' ? 'multi' : 'single';
      selectMode(nextMode);
      document.querySelector(`[data-mode="${nextMode}"]`)?.focus();
    });
  }

  syncVisualViewport();
  window.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);
  selectMode(initialMode(), false);
  renderGames();
  renderPlayers();
})();
