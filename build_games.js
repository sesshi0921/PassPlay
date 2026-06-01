#!/usr/bin/env node
// games/ 直下のサブディレクトリを走査し、各 meta.json を集約して games.json を生成
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const GAMES_DIR = path.join(ROOT, 'games');
const OUT = path.join(ROOT, 'games.json');

function listGameDirs(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map(e => e.name)
    .sort();
}

function readMeta(dir) {
  const metaPath = path.join(GAMES_DIR, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const meta = JSON.parse(raw);
    return meta && typeof meta === 'object' ? meta : null;
  } catch (err) {
    console.warn(`[skip] ${dir}: meta.json parse error: ${err.message}`);
    return null;
  }
}

function main() {
  const dirs = listGameDirs(GAMES_DIR);
  const games = [];
  for (const id of dirs) {
    const meta = readMeta(id);
    if (!meta) {
      console.warn(`[skip] ${id}: meta.json なし`);
      continue;
    }
    games.push({ id, name: meta.name || id, icon: meta.icon || 'icon.png', ...(meta.min !== undefined && { min: meta.min }) });
  }
  fs.writeFileSync(OUT, JSON.stringify(games, null, 2) + '\n', 'utf-8');
  console.log(`games.json 更新: ${games.length} 件`);
  for (const g of games) console.log(`  - ${g.id}: ${g.name}`);
}

main();
