#!/usr/bin/env node
// games/ 直下のサブディレクトリを走査し、各 meta.json を集約して games.json を生成
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const GAMES_DIR = path.join(ROOT, 'games');
const OUT = path.join(ROOT, 'games.json');
const API_VERSION = '1.0';
const ALLOWED_PERMISSIONS = new Set([
  'players:read',
  'storage:read',
  'storage:write',
  'navigation',
]);
const ALLOWED_META_KEYS = new Set([
  'name',
  'version',
  'apiVersion',
  'entry',
  'icon',
  'description',
  'min',
  'max',
  'permissions',
  'assets',
]);

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateRelativePath(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} は必須です`);
  assert(!value.startsWith('/') && !value.includes('..'), `${label} はゲーム内の相対パスにしてください`);
  return value;
}

function validateHtmlContract(id, entryPath) {
  const html = fs.readFileSync(entryPath, 'utf-8');
  const tags = tagName => (
    [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, 'gi'))].map(match => {
      const attributes = {};
      for (const attribute of match[1].matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g)) {
        attributes[attribute[1].toLowerCase()] = attribute[3];
      }
      return attributes;
    })
  );
  const metas = tags('meta');
  const links = tags('link');
  const scripts = tags('script');
  const pluginIdMeta = metas.find(attributes => attributes.name === 'passplay-plugin-id');
  const apiVersionMeta = metas.find(attributes => attributes.name === 'passplay-api-version');
  const gameStyle = links.find(attributes => attributes.rel === 'stylesheet' && attributes.href === './style.css');
  const sharedTheme = links.find(attributes => attributes.rel === 'stylesheet' && attributes.href === '../../core/game-theme.css');
  const sdkScript = scripts.find(attributes => attributes.src === '../../core/plugin-sdk.js');
  const gameScript = scripts.find(attributes => attributes.src === './game.js');

  assert(pluginIdMeta?.content === id, `${id}: HTMLのpassplay-plugin-idが不正です`);
  assert(apiVersionMeta?.content === API_VERSION, `${id}: HTMLのpassplay-api-versionが不正です`);
  assert(/\sdata-passplay-plugin-root(?:\s|>)/.test(html), `${id}: HTMLにdata-passplay-plugin-rootがありません`);
  assert(gameStyle, `${id}: HTMLにstyle.cssの読み込みがありません`);
  if (id !== 'othello') {
    assert(sharedTheme, `${id}: HTMLにgame-theme.cssの読み込みがありません`);
    assert(
      html.indexOf('./style.css') < html.indexOf('../../core/game-theme.css'),
      `${id}: game-theme.cssはゲーム固有style.cssより後に読み込んでください`,
    );
  }
  assert(sdkScript, `${id}: HTMLにplugin-sdk.jsの読み込みがありません`);
  assert(gameScript, `${id}: HTMLにgame.jsの読み込みがありません`);
  assert(
    html.indexOf('../../core/plugin-sdk.js') < html.indexOf('./game.js'),
    `${id}: plugin-sdk.jsはgame.jsより先に読み込んでください`,
  );

  const gameScriptPath = path.join(GAMES_DIR, id, 'game.js');
  const gameScriptSource = fs.readFileSync(gameScriptPath, 'utf-8');
  assert(
    /\bPassPlay\.register\s*\(/.test(gameScriptSource),
    `${id}: game.jsはPassPlay.register()で登録してください`,
  );
  assert(
    !/\bPassPlay\.register\s*\([\s\S]*\)\s*\(\s*\)\s*;?\s*$/.test(gameScriptSource),
    `${id}: PassPlay.register()の戻り値を関数として呼び出さないでください`,
  );
}

function validateMeta(id, meta) {
  for (const key of Object.keys(meta)) {
    assert(ALLOWED_META_KEYS.has(key), `${id}: 未対応のマニフェスト項目です: ${key}`);
  }
  assert(typeof meta.name === 'string' && meta.name.length > 0, `${id}: name は必須です`);
  assert(typeof meta.version === 'string' && /^\d+\.\d+\.\d+$/.test(meta.version), `${id}: version はsemver形式で指定してください`);
  assert(meta.apiVersion === API_VERSION, `${id}: apiVersion は ${API_VERSION} である必要があります`);
  assert(typeof meta.description === 'string' && meta.description.length > 0, `${id}: description は必須です`);
  assert(Number.isInteger(meta.min) && meta.min >= 1, `${id}: min は1以上の整数で指定してください`);
  if (meta.max !== undefined) {
    assert(Number.isInteger(meta.max) && meta.max >= meta.min, `${id}: max はmin以上の整数で指定してください`);
  }

  const entry = validateRelativePath(meta.entry, `${id}: entry`);
  const icon = validateRelativePath(meta.icon || 'icon.png', `${id}: icon`);
  const permissions = meta.permissions;
  const assets = meta.assets;

  assert(Array.isArray(permissions), `${id}: permissions は配列で指定してください`);
  assert(new Set(permissions).size === permissions.length, `${id}: permissions に重複があります`);
  for (const permission of permissions) {
    assert(ALLOWED_PERMISSIONS.has(permission), `${id}: 未対応の権限です: ${permission}`);
  }
  assert(Array.isArray(assets) && assets.length > 0, `${id}: assets は1件以上必要です`);
  assert(new Set(assets).size === assets.length, `${id}: assets に重複があります`);

  const requiredAssets = new Set([entry, icon]);
  for (const asset of assets) {
    validateRelativePath(asset, `${id}: asset`);
    const assetPath = path.join(GAMES_DIR, id, asset);
    assert(fs.existsSync(assetPath) && fs.statSync(assetPath).isFile(), `${id}: asset が存在しません: ${asset}`);
    requiredAssets.delete(asset);
  }
  assert(requiredAssets.size === 0, `${id}: entryとiconをassetsに含めてください`);
  validateHtmlContract(id, path.join(GAMES_DIR, id, entry));
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
    validateMeta(id, meta);
    games.push({
      id,
      name: meta.name,
      description: meta.description || '',
      version: meta.version,
      apiVersion: meta.apiVersion,
      entry: meta.entry,
      icon: meta.icon || 'icon.png',
      permissions: [...new Set(meta.permissions)],
      assets: [...new Set(meta.assets)],
      ...(meta.min !== undefined && { min: meta.min }),
      ...(meta.max !== undefined && { max: meta.max }),
    });
  }
  fs.writeFileSync(OUT, JSON.stringify(games, null, 2) + '\n', 'utf-8');
  console.log(`games.json 更新: ${games.length} 件`);
  for (const g of games) console.log(`  - ${g.id}: ${g.name}`);
}

main();
