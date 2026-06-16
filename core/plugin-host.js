(() => {
  'use strict';

  const PROTOCOL = 'passplay:plugin';
  const API_VERSION = '1.0';
  const PLAYER_STORAGE_KEY = 'passplay.players';
  const PLUGIN_STORAGE_PREFIX = 'passplay.plugin.';
  const VALID_MODES = new Set(['single', 'multi']);
  const ALLOWED_PERMISSIONS = new Set([
    'players:read',
    'storage:read',
    'storage:write',
    'navigation',
    'room:read',
    'room:write',
  ]);

  const host = document.getElementById('plugin-host');
  const loading = document.getElementById('plugin-loading');
  const errorBox = document.getElementById('plugin-error');
  const errorMessage = document.getElementById('plugin-error-message');
  const exitButton = document.getElementById('plugin-exit-button');
  const exitDialog = document.getElementById('plugin-exit-dialog');
  const exitCancel = document.getElementById('plugin-exit-cancel');
  const exitConfirm = document.getElementById('plugin-exit-confirm');

  let activePlugin = null;
  let frame = null;
  let loadTimer = null;
  let activeMode = 'single';
  let roomClient = null;

  function fail(message) {
    loading.hidden = true;
    errorMessage.textContent = message;
    errorBox.hidden = false;
  }

  function openExitDialog() {
    exitDialog.hidden = false;
    exitConfirm.focus();
  }

  function closeExitDialog() {
    exitDialog.hidden = true;
    exitButton.focus();
  }

  async function exitToHome() {
    exitConfirm.disabled = true;
    exitCancel.disabled = true;
    try {
      send({ type: 'lifecycle', event: 'deactivate' });
      if (roomClient) await roomClient.leave();
    } catch (error) {
      console.warn('[PassPlay] failed to leave room:', error);
    } finally {
      window.location.href = './index.html';
    }
  }

  function parsePlayers() {
    try {
      const value = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) || '[]');
      return Array.isArray(value)
        ? value.filter(name => typeof name === 'string' && name.length > 0)
        : [];
    } catch {
      return [];
    }
  }

  function validatePlugin(plugin, requestedId) {
    if (!plugin || typeof plugin !== 'object') throw new Error('プラグイン定義が不正です');
    if (plugin.id !== requestedId) throw new Error('プラグインIDが一致しません');
    if (plugin.apiVersion !== API_VERSION) {
      throw new Error(`未対応のAPIバージョンです: ${plugin.apiVersion || '未指定'}`);
    }
    if (typeof plugin.entry !== 'string' || !/^[a-zA-Z0-9._/-]+\.html$/.test(plugin.entry)) {
      throw new Error('エントリポイントが不正です');
    }
    if (!Array.isArray(plugin.permissions)) throw new Error('権限定義が不正です');
    for (const permission of plugin.permissions) {
      if (!ALLOWED_PERMISSIONS.has(permission)) throw new Error(`未対応の権限です: ${permission}`);
    }
    if (plugin.modes !== undefined) {
      if (!Array.isArray(plugin.modes) || plugin.modes.length === 0) throw new Error('対応モードが不正です');
      for (const mode of plugin.modes) {
        if (!VALID_MODES.has(mode)) throw new Error(`未対応のモードです: ${mode}`);
      }
    }
  }

  function hasPermission(permission) {
    return activePlugin.permissions.includes(permission);
  }

  function requirePermission(permission) {
    if (!hasPermission(permission)) {
      throw new Error(`権限がありません: ${permission}`);
    }
  }

  function pluginStorageKey(key) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 100) {
      throw new Error('ストレージキーが不正です');
    }
    return `${PLUGIN_STORAGE_PREFIX}${activePlugin.id}.${key}`;
  }

  function assertSerializableValue(value) {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || encoded.length > 100000) {
      throw new Error('保存できない値、またはサイズ上限を超えています');
    }
  }

  const handlers = {
    'context.get'() {
      return {
        apiVersion: API_VERSION,
        plugin: {
          id: activePlugin.id,
          name: activePlugin.name,
          version: activePlugin.version,
          permissions: activePlugin.permissions.slice(),
          modes: (activePlugin.modes || ['single']).slice(),
        },
        environment: {
          locale: document.documentElement.lang || 'ja',
          standalone: window.matchMedia('(display-mode: standalone)').matches,
          mode: activeMode,
        },
      };
    },
    'players.list'() {
      requirePermission('players:read');
      return parsePlayers();
    },
    'storage.get'({ key }) {
      requirePermission('storage:read');
      const raw = localStorage.getItem(pluginStorageKey(key));
      return raw === null ? null : JSON.parse(raw);
    },
    'storage.set'({ key, value }) {
      requirePermission('storage:write');
      assertSerializableValue(value);
      localStorage.setItem(pluginStorageKey(key), JSON.stringify(value));
      return true;
    },
    'storage.remove'({ key }) {
      requirePermission('storage:write');
      localStorage.removeItem(pluginStorageKey(key));
      return true;
    },
    'navigation.home'() {
      requirePermission('navigation');
      window.location.href = './index.html';
      return true;
    },
    'room.getSession'() {
      requirePermission('room:read');
      return roomClient ? roomClient.getSession() : null;
    },
    'room.getApiBase'() {
      requirePermission('room:read');
      return roomClient ? roomClient.getApiBase() : '';
    },
    'room.setApiBase'({ apiBase }) {
      requirePermission('room:write');
      if (!roomClient) throw new Error('room client is not available');
      roomClient.setApiBase(apiBase);
      return roomClient.getApiBase();
    },
    async 'room.create'({ playerName, transport, roomLabel }) {
      requirePermission('room:write');
      if (activeMode !== 'multi') throw new Error('multi モードでのみ使用できます');
      return roomClient.createRoom({ playerName, transport, roomLabel });
    },
    async 'room.join'({ roomId, playerName, transport }) {
      requirePermission('room:write');
      if (activeMode !== 'multi') throw new Error('multi モードでのみ使用できます');
      return roomClient.joinRoom({ roomId, playerName, transport });
    },
    async 'room.sync'() {
      requirePermission('room:read');
      if (activeMode !== 'multi') throw new Error('multi モードでのみ使用できます');
      return roomClient.sync();
    },
    async 'room.start'() {
      requirePermission('room:write');
      if (activeMode !== 'multi') throw new Error('multi モードでのみ使用できます');
      return roomClient.start();
    },
    async 'room.action'({ action }) {
      requirePermission('room:write');
      if (activeMode !== 'multi') throw new Error('multi モードでのみ使用できます');
      return roomClient.sendAction(action);
    },
    async 'room.leave'() {
      requirePermission('room:write');
      if (!roomClient) return true;
      return roomClient.leave();
    },
  };

  function send(message) {
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ protocol: PROTOCOL, ...message }, window.location.origin);
    }
  }

  async function handleRequest(message) {
    const response = { type: 'response', requestId: message.requestId };
    try {
      const handler = handlers[message.method];
      if (!handler) throw new Error(`未対応のAPIです: ${message.method}`);
      response.result = await handler(message.args || {});
      response.ok = true;
    } catch (error) {
      response.ok = false;
      response.error = error instanceof Error ? error.message : String(error);
    }
    send(response);
  }

  function handleMessage(event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.protocol !== PROTOCOL || message.pluginId !== activePlugin.id) return;

    if (message.type === 'hello') {
      send({ type: 'host-ready' });
      return;
    }
    if (message.type === 'ready') {
      clearTimeout(loadTimer);
      loading.hidden = true;
      frame.hidden = false;
      send({ type: 'lifecycle', event: 'activate' });
      return;
    }
    if (message.type === 'error') {
      clearTimeout(loadTimer);
      frame.remove();
      frame = null;
      fail(message.error || 'プラグインの初期化に失敗しました');
      return;
    }
    if (message.type === 'request') {
      handleRequest(message);
      return;
    }
    if (message.type === 'room-subscribe') {
      if (!roomClient) return;
      if (handleMessage.roomUnsubscribe) handleMessage.roomUnsubscribe();
      handleMessage.roomUnsubscribe = roomClient.subscribe(currentSnapshot => {
        send({ type: 'room-state', snapshot: currentSnapshot });
      });
    }
  }

  async function start() {
    const pluginId = new URLSearchParams(window.location.search).get('game');
    const requestedMode = new URLSearchParams(window.location.search).get('mode');
    activeMode = VALID_MODES.has(requestedMode) ? requestedMode : 'single';
    if (!pluginId || !/^[a-z0-9-]+$/.test(pluginId)) {
      fail('ゲームIDが指定されていません');
      return;
    }

    try {
      const response = await fetch('./games.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('ゲーム一覧を取得できません');
      const plugins = await response.json();
      activePlugin = Array.isArray(plugins) ? plugins.find(plugin => plugin.id === pluginId) : null;
      validatePlugin(activePlugin, pluginId);
      const pluginModes = activePlugin.modes || ['single'];
      if (!pluginModes.includes(activeMode)) {
        throw new Error(`このゲームは ${activeMode} モードに対応していません`);
      }
      if (activeMode === 'multi') {
        if (!window.PassPlayRoomRuntime) throw new Error('room runtime を読み込めません');
        roomClient = window.PassPlayRoomRuntime.createClient({
          gameId: activePlugin.id,
          roomId: new URLSearchParams(window.location.search).get('room'),
          apiBase: new URLSearchParams(window.location.search).get('api'),
        });
      }

      document.title = `${activePlugin.name} | PassPlay`;
      frame = document.createElement('iframe');
      frame.className = 'plugin-frame';
      frame.title = activePlugin.name;
      frame.hidden = true;
      frame.sandbox = 'allow-scripts allow-same-origin allow-forms allow-pointer-lock';
      frame.allow = 'fullscreen';
      window.addEventListener('message', handleMessage);
      const frameUrl = new URL(`./games/${activePlugin.id}/${activePlugin.entry}`, window.location.href);
      const pageParams = new URLSearchParams(window.location.search);
      const roomParam = pageParams.get('room');
      const apiParam = pageParams.get('api');
      if (roomParam) frameUrl.searchParams.set('room', roomParam);
      if (apiParam) frameUrl.searchParams.set('api', apiParam);
      frame.src = frameUrl.toString();
      host.appendChild(frame);
      loadTimer = setTimeout(() => {
        if (frame && frame.hidden) {
          frame.remove();
          frame = null;
          fail('プラグインの初期化がタイムアウトしました');
        }
      }, 10000);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  window.addEventListener('pagehide', () => {
    send({ type: 'lifecycle', event: 'deactivate' });
    roomClient?.dispose();
  });

  exitButton.addEventListener('click', openExitDialog);
  exitCancel.addEventListener('click', closeExitDialog);
  exitConfirm.addEventListener('click', exitToHome);
  exitDialog.addEventListener('click', event => {
    if (event.target === exitDialog) closeExitDialog();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !exitDialog.hidden) closeExitDialog();
  });

  start();
})();
