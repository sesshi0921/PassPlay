window.PassPlay.register(async api => {
  'use strict';

  const WIN_SCORE = 7;
  const sharedPlayers = await api.players.list();

  let W = 0, H = 0;
  let PUCK_R, PADDLE_R, GOAL_W;

  const state = {
    players: ['プレイヤー1', 'プレイヤー2'],
    score: [0, 0],
    puck: { x: 0, y: 0, vx: 0, vy: 0 },
    paddles: [
      { x: 0, y: 0, px: 0, py: 0, pvx: 0, pvy: 0 }, // player 0: bottom (red)
      { x: 0, y: 0, px: 0, py: 0, pvx: 0, pvy: 0 }, // player 1: top (blue)
    ],
    running: false,
    animFrame: null,
  };

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;
    PUCK_R   = W * 0.055;
    PADDLE_R = W * 0.09;
    GOAL_W   = W * 0.42;
  }

  function goalLeft()  { return (W - GOAL_W) / 2; }
  function goalRight() { return (W + GOAL_W) / 2; }

  function resetPuck() {
    state.puck.x = W / 2;
    state.puck.y = H / 2;
    const angle = (Math.random() < 0.5 ? Math.PI * 0.25 : Math.PI * 0.75)
                + (Math.random() - 0.5) * Math.PI * 0.4
                + (Math.random() < 0.5 ? 0 : Math.PI);
    const spd = Math.max(W, H) * 0.011;
    state.puck.vx = Math.cos(angle) * spd;
    state.puck.vy = Math.sin(angle) * spd;
  }

  function resetPaddles() {
    state.paddles[0].x = state.paddles[0].px = W / 2;
    state.paddles[0].y = state.paddles[0].py = H * 0.78;
    state.paddles[0].pvx = state.paddles[0].pvy = 0;
    state.paddles[1].x = state.paddles[1].px = W / 2;
    state.paddles[1].y = state.paddles[1].py = H * 0.22;
    state.paddles[1].pvx = state.paddles[1].pvy = 0;
  }

  function circleCollide(p, cx, cy, cr) {
    const dx = p.x - cx, dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minD = PUCK_R + cr;
    if (dist < minD && dist > 0.001) {
      const nx = dx / dist, ny = dy / dist;
      p.x = cx + nx * minD;
      p.y = cy + ny * minD;
      const dot = p.vx * nx + p.vy * ny;
      if (dot < 0) {
        p.vx -= 2 * dot * nx * 0.85;
        p.vy -= 2 * dot * ny * 0.85;
      }
    }
  }

  function clampSpeed(p) {
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const maxSpd = Math.max(W, H) * 0.022;
    const minSpd = Math.max(W, H) * 0.004;
    if (spd > maxSpd) { p.vx = p.vx / spd * maxSpd; p.vy = p.vy / spd * maxSpd; }
    else if (spd > 0 && spd < minSpd) { p.vx = p.vx / spd * minSpd; p.vy = p.vy / spd * minSpd; }
  }

  function update() {
    const p = state.puck;

    // Paddle velocity tracking
    for (const pad of state.paddles) {
      pad.pvx = pad.x - pad.px;
      pad.pvy = pad.y - pad.py;
      pad.px = pad.x;
      pad.py = pad.y;
    }

    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.9995;
    p.vy *= 0.9995;

    const gl = goalLeft(), gr = goalRight();
    const POST_R = 7;

    // Left / right walls
    if (p.x - PUCK_R < 0) { p.x = PUCK_R; p.vx =  Math.abs(p.vx) * 0.92; }
    if (p.x + PUCK_R > W) { p.x = W - PUCK_R; p.vx = -Math.abs(p.vx) * 0.92; }

    // Top wall & goal
    if (p.y - PUCK_R < 0) {
      if (p.x > gl && p.x < gr) { onScore(0); return; }
      p.y = PUCK_R;
      p.vy = Math.abs(p.vy) * 0.92;
    }
    circleCollide(p, gl, 0, POST_R);
    circleCollide(p, gr, 0, POST_R);

    // Bottom wall & goal
    if (p.y + PUCK_R > H) {
      if (p.x > gl && p.x < gr) { onScore(1); return; }
      p.y = H - PUCK_R;
      p.vy = -Math.abs(p.vy) * 0.92;
    }
    circleCollide(p, gl, H, POST_R);
    circleCollide(p, gr, H, POST_R);

    // Paddle collisions
    for (let i = 0; i < 2; i++) {
      const pad = state.paddles[i];
      const dx = p.x - pad.x, dy = p.y - pad.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = PUCK_R + PADDLE_R;
      if (dist < minD && dist > 0.001) {
        const nx = dx / dist, ny = dy / dist;
        p.x = pad.x + nx * minD;
        p.y = pad.y + ny * minD;
        const relVx = p.vx - pad.pvx * 0.9;
        const relVy = p.vy - pad.pvy * 0.9;
        const relVn = relVx * nx + relVy * ny;
        if (relVn < 0) {
          const impulse = -relVn * 1.85;
          p.vx += nx * impulse;
          p.vy += ny * impulse;
        }
        clampSpeed(p);
      }
    }

    clampSpeed(p);
  }

  function onScore(scorer) {
    state.running = false;
    cancelAnimationFrame(state.animFrame);
    state.score[scorer]++;
    drawGoalFlash(scorer);
    setTimeout(() => {
      if (state.score[scorer] >= WIN_SCORE) { endGame(scorer); return; }
      resetPuck();
      resetPaddles();
      touchMap.clear();
      state.running = true;
      state.animFrame = requestAnimationFrame(gameLoop);
    }, 1300);
  }

  function drawGoalFlash(scorer) {
    draw();
    ctx.fillStyle = scorer === 0 ? 'rgba(164,55,48,0.42)' : 'rgba(48,83,123,0.42)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = `bold ${W * 0.14}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff9ea';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText('GOAL!', W / 2, H / 2);
    ctx.shadowBlur = 0;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Wooden table surface
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#e4c18f');
    bg.addColorStop(0.48, '#d4a96f');
    bg.addColorStop(1, '#c8955d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle, deterministic wood grain
    ctx.save();
    ctx.globalAlpha = 0.17;
    ctx.strokeStyle = '#7b4c27';
    ctx.lineWidth = 1.2;
    for (let y = 22; y < H; y += 46) {
      const bend = Math.sin(y * 0.035) * 13;
      ctx.beginPath();
      ctx.moveTo(-12, y);
      ctx.bezierCurveTo(W * 0.25, y + bend, W * 0.7, y - bend, W + 12, y + bend * 0.35);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 3;
    for (let y = 8; y < H; y += 138) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + 5);
      ctx.stroke();
    }
    ctx.restore();

    const gl = goalLeft(), gr = goalRight();
    const goalDepth = H * 0.045;
    const POST_R = 7;

    // Goal zones
    const goalShade = ctx.createLinearGradient(0, 0, 0, goalDepth);
    goalShade.addColorStop(0, 'rgba(72,39,18,0.48)');
    goalShade.addColorStop(1, 'rgba(72,39,18,0.08)');
    ctx.fillStyle = goalShade;
    ctx.fillRect(gl, 0, GOAL_W, goalDepth);
    ctx.save();
    ctx.translate(0, H);
    ctx.scale(1, -1);
    ctx.fillRect(gl, 0, GOAL_W, goalDepth);
    ctx.restore();

    // Goal lines
    ctx.strokeStyle = '#5e351b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gl, 0);   ctx.lineTo(gl, goalDepth);
    ctx.moveTo(gr, 0);   ctx.lineTo(gr, goalDepth);
    ctx.moveTo(gl, H);   ctx.lineTo(gl, H - goalDepth);
    ctx.moveTo(gr, H);   ctx.lineTo(gr, H - goalDepth);
    ctx.stroke();

    // Goal posts
    ctx.fillStyle = '#70401f';
    for (const px of [gl, gr]) {
      ctx.beginPath(); ctx.arc(px, 0, POST_R, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px, H, POST_R, 0, Math.PI * 2); ctx.fill();
    }

    // Dark wooden rails
    const rail = Math.max(6, W * 0.018);
    ctx.fillStyle = '#70421f';
    ctx.fillRect(0, 0, rail, H);
    ctx.fillRect(W - rail, 0, rail, H);
    ctx.fillRect(0, 0, gl, rail);
    ctx.fillRect(gr, 0, W - gr, rail);
    ctx.fillRect(0, H - rail, gl, rail);
    ctx.fillRect(gr, H - rail, W - gr, rail);
    ctx.strokeStyle = 'rgba(255,244,218,.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rail, rail, W - rail * 2, H - rail * 2);

    // Center line (dashed)
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(93,52,26,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center circle
    ctx.strokeStyle = 'rgba(93,52,26,0.42)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.15, 0, Math.PI * 2);
    ctx.stroke();

    // Paddles
    const padColors = [
      ['#ef8c79', '#b84c42', '#7f2f2a'],
      ['#84acd0', '#4d78a5', '#294b70'],
    ];
    for (let i = 0; i < 2; i++) {
      const pad = state.paddles[i];
      ctx.save();
      ctx.shadowColor = 'rgba(72,39,18,.35)';
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 6;
      const g = ctx.createRadialGradient(pad.x - PADDLE_R * 0.3, pad.y - PADDLE_R * 0.3, PADDLE_R * 0.1,
                                          pad.x, pad.y, PADDLE_R);
      g.addColorStop(0, padColors[i][0]);
      g.addColorStop(0.62, padColors[i][1]);
      g.addColorStop(1, padColors[i][2]);
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, PADDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#5a321d';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // Wooden concentric rings and grain
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, PADDLE_R * 0.48, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,242,214,.48)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, PADDLE_R * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,242,214,.72)';
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, PADDLE_R * 0.78, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = 'rgba(80,40,22,.24)';
      ctx.lineWidth = 1.2;
      for (let offset = -0.45; offset <= 0.45; offset += 0.3) {
        ctx.beginPath();
        ctx.arc(
          pad.x + PADDLE_R * offset,
          pad.y,
          PADDLE_R * (0.42 + Math.abs(offset) * 0.22),
          -1.15,
          1.15,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // Pale wooden puck
    const p = state.puck;
    ctx.save();
    ctx.shadowColor = 'rgba(72,39,18,.35)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 5;
    const pg = ctx.createRadialGradient(p.x - PUCK_R * 0.3, p.y - PUCK_R * 0.3, PUCK_R * 0.05,
                                         p.x, p.y, PUCK_R);
    pg.addColorStop(0, '#fff8e7');
    pg.addColorStop(0.65, '#e8d4ad');
    pg.addColorStop(1, '#b98c58');
    ctx.beginPath();
    ctx.arc(p.x, p.y, PUCK_R, 0, Math.PI * 2);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#6f431f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, PUCK_R * 0.58, -0.8, 2.4);
    ctx.strokeStyle = 'rgba(111,67,31,.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // Scores & names
    drawHUD();
  }

  function drawHUD() {
    const scoreSize = Math.min(W * 0.11, 40);
    const nameSize  = Math.min(W * 0.052, 18);
    const margin = W * 0.05;
    ctx.textBaseline = 'alphabetic';

    // Player 0 (bottom, red) — normal orientation, bottom-left
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = `bold ${scoreSize}px -apple-system, sans-serif`;
    ctx.fillStyle = '#9e332d';
    ctx.fillText(state.score[0], margin, H - H * 0.025);
    ctx.font = `${nameSize}px -apple-system, sans-serif`;
    ctx.fillStyle = '#57341e';
    const n0 = state.players[0].length > 7 ? state.players[0].slice(0, 7) + '…' : state.players[0];
    ctx.fillText(n0, margin + scoreSize + 8, H - H * 0.025);
    ctx.restore();

    // Player 1 (top, blue) — rotated 180°, same position from their perspective
    ctx.save();
    ctx.translate(W, H);
    ctx.rotate(Math.PI);
    ctx.textAlign = 'left';
    ctx.font = `bold ${scoreSize}px -apple-system, sans-serif`;
    ctx.fillStyle = '#315d8b';
    ctx.fillText(state.score[1], margin, H - H * 0.025);
    ctx.font = `${nameSize}px -apple-system, sans-serif`;
    ctx.fillStyle = '#57341e';
    const n1 = state.players[1].length > 7 ? state.players[1].slice(0, 7) + '…' : state.players[1];
    ctx.fillText(n1, margin + scoreSize + 8, H - H * 0.025);
    ctx.restore();
  }

  function gameLoop() {
    if (!state.running) return;
    update();
    draw();
    state.animFrame = requestAnimationFrame(gameLoop);
  }

  function endGame(winner) {
    state.running = false;
    cancelAnimationFrame(state.animFrame);
    document.getElementById('result-winner').textContent = `${state.players[winner]} の勝利！`;
    document.getElementById('result-score').textContent = `${state.score[0]} - ${state.score[1]}`;
    show('result');
  }

  // Multi-touch
  const touchMap = new Map();

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const y = t.clientY - rect.top;
      const idx = y > H / 2 ? 0 : 1;
      if (!Array.from(touchMap.values()).includes(idx)) {
        touchMap.set(t.identifier, idx);
        applyTouch(idx, t, rect);
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const idx = touchMap.get(t.identifier);
      if (idx !== undefined) applyTouch(idx, t, rect);
    }
  }, { passive: false });

  canvas.addEventListener('touchend',   e => { for (const t of e.changedTouches) touchMap.delete(t.identifier); }, { passive: false });
  canvas.addEventListener('touchcancel',e => { for (const t of e.changedTouches) touchMap.delete(t.identifier); }, { passive: false });

  function applyTouch(idx, touch, rect) {
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const pad = state.paddles[idx];
    pad.x = Math.max(PADDLE_R, Math.min(W - PADDLE_R, x));
    if (idx === 0) {
      pad.y = Math.max(H / 2 + PADDLE_R, Math.min(H - PADDLE_R, y));
    } else {
      pad.y = Math.max(PADDLE_R, Math.min(H / 2 - PADDLE_R, y));
    }
  }

  // Phases
  const phaseEls = Array.from(document.querySelectorAll('[data-phase]'));
  function show(name) {
    for (const el of phaseEls) el.hidden = el.dataset.phase !== name;
  }

  function loadPlayers() {
    return sharedPlayers.slice();
  }

  function startGame() {
    state.score = [0, 0];
    show('play');
    resize();
    resetPuck();
    resetPaddles();
    touchMap.clear();
    state.running = true;
    state.animFrame = requestAnimationFrame(gameLoop);
  }

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-again').addEventListener('click', () => {
    state.score = [0, 0];
    show('play');
    resize();
    resetPuck();
    resetPaddles();
    touchMap.clear();
    state.running = true;
    state.animFrame = requestAnimationFrame(gameLoop);
  });

  const players = loadPlayers();
  if (players.length >= 2) state.players = players.slice(0, 2);
  document.getElementById('setup-players').innerHTML =
    `<p style="margin:0;font-size:15px">${state.players[0]} <span style="color:rgba(255,255,255,0.4)">vs</span> ${state.players[1]}</p>`;
  api.lifecycle.on('deactivate', () => {
    state.running = false;
    cancelAnimationFrame(state.animFrame);
  });
  show('setup');
});
