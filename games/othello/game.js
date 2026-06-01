(() => {
  'use strict';

  const STORAGE_KEY = 'passplay.players';
  const BOARD_SIZE = 8;
  const BLACK = 1, WHITE = -1, EMPTY = 0;

  const state = {
    players: [],
    board: [],
    currentPlayer: BLACK,
    gameOver: false,
  };

  const phases = Array.from(document.querySelectorAll('[data-phase]'));
  function show(name) {
    for (const el of phases) {
      el.hidden = (el.dataset.phase !== name);
    }
  }

  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
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

  function initBoard() {
    const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
    board[3][3] = WHITE;
    board[3][4] = BLACK;
    board[4][3] = BLACK;
    board[4][4] = WHITE;
    return board;
  }

  function getScore(board) {
    let black = 0, white = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === BLACK) black++;
        else if (board[r][c] === WHITE) white++;
      }
    }
    return { black, white };
  }

  function canPlace(board, player, r, c) {
    if (board[r][c] !== EMPTY) return false;
    const opponent = -player;
    const dirs = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      let found = false;
      while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
        if (board[nr][nc] === EMPTY) break;
        if (board[nr][nc] === opponent) {
          found = true;
        } else if (board[nr][nc] === player) {
          if (found) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return false;
  }

  function getValidMoves(board, player) {
    const moves = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (canPlace(board, player, r, c)) {
          moves.push([r, c]);
        }
      }
    }
    return moves;
  }

  function placeAndFlip(board, player, r, c) {
    const newBoard = board.map(row => row.slice());
    newBoard[r][c] = player;
    const opponent = -player;
    const dirs = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      const toFlip = [];
      while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
        if (newBoard[nr][nc] === EMPTY) break;
        if (newBoard[nr][nc] === opponent) {
          toFlip.push([nr, nc]);
        } else if (newBoard[nr][nc] === player) {
          for (const [fr, fc] of toFlip) newBoard[fr][fc] = player;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return newBoard;
  }

  function renderBoard() {
    const boardEl = document.getElementById('board');
    const { black: blackScore, white: whiteScore } = getScore(state.board);
    document.getElementById('score-top-black').querySelector('.count').textContent = blackScore;
    document.getElementById('score-top-white').querySelector('.count').textContent = whiteScore;
    document.getElementById('score-bottom-black').querySelector('.count').textContent = blackScore;
    document.getElementById('score-bottom-white').querySelector('.count').textContent = whiteScore;

    const currentName = state.players[state.currentPlayer === BLACK ? 0 : 1];
    document.getElementById('turn-top').textContent = currentName + ' のターン';
    document.getElementById('turn-bottom').textContent = currentName + ' のターン';

    boardEl.innerHTML = '';
    const validMoves = getValidMoves(state.board, state.currentPlayer);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        const piece = state.board[r][c];
        if (piece === BLACK) { cell.classList.add('black'); cell.innerHTML = '⚫'; }
        else if (piece === WHITE) { cell.classList.add('white'); cell.innerHTML = '⚪'; }
        const isValid = validMoves.some(m => m[0] === r && m[1] === c);
        if (isValid) {
          cell.classList.add('valid');
          cell.addEventListener('click', () => handleMove(r, c));
        }
        boardEl.appendChild(cell);
      }
    }
  }

  function handleMove(r, c) {
    state.board = placeAndFlip(state.board, state.currentPlayer, r, c);
    state.currentPlayer = -state.currentPlayer;

    let skipped = false;
    if (getValidMoves(state.board, state.currentPlayer).length === 0) {
      const opponentName = state.players[state.currentPlayer === BLACK ? 0 : 1];
      state.currentPlayer = -state.currentPlayer;
      if (getValidMoves(state.board, state.currentPlayer).length === 0) {
        endGame();
        return;
      }
      skipped = true;
      toast(`${opponentName} は置ける場所がないためスキップ`);
    }

    renderBoard();
  }

  function endGame() {
    state.gameOver = true;
    const { black, white } = getScore(state.board);
    const blackName = state.players[0];
    const whiteName = state.players[1];
    let result = '';
    if (black > white) result = `${blackName} の勝利！<br>${black} - ${white}`;
    else if (white > black) result = `${whiteName} の勝利！<br>${white} - ${black}`;
    else result = `同点！<br>${black} - ${white}`;
    document.getElementById('result-body').innerHTML = result;
    show('result');
  }

  function initGame() {
    state.players = loadPlayers();
    if (state.players.length < 2) { alert('2人以上のプレイヤーが必要です'); return; }
    state.players = state.players.slice(0, 2);
    state.board = initBoard();
    state.currentPlayer = randInt(2) === 0 ? BLACK : WHITE;
    state.gameOver = false;
    show('play');
    renderBoard();
  }

  document.getElementById('btn-start').addEventListener('click', initGame);
  document.getElementById('btn-again').addEventListener('click', () => {
    state.board = initBoard();
    state.currentPlayer = randInt(2) === 0 ? BLACK : WHITE;
    state.gameOver = false;
    show('play');
    renderBoard();
  });

  const players = loadPlayers();
  document.getElementById('setup-players').innerHTML = players.length >= 2
    ? `<p>${players[0]} vs ${players[1]}</p>`
    : '<p>プレイヤーが足りません（最低2人必要）</p>';

  show('setup');
})();
