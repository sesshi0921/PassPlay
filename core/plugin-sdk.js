(() => {
  'use strict';

  const PROTOCOL = 'passplay:plugin';
  const API_VERSION = '1.0';
  const PLAYER_STORAGE_KEY = 'passplay.players';
  const PLUGIN_STORAGE_PREFIX = 'passplay.plugin.';
  const pluginId = document.querySelector('meta[name="passplay-plugin-id"]')?.content || '';
  const declaredVersion = document.querySelector('meta[name="passplay-api-version"]')?.content || '';
  const embedded = window.parent !== window;
  const pending = new Map();
  const lifecycleListeners = new Map();
  const roomListeners = new Set();
  let resolveHostReady = null;
  const hostReady = embedded
    ? new Promise(resolve => { resolveHostReady = resolve; })
    : Promise.resolve();
  let requestSequence = 0;
  let lifecycleActive = false;
  let registered = false;
  let hostReadyReceived = !embedded;
  let helloTimer = null;

  function validateDocumentContract() {
    if (!pluginId || !/^[a-z0-9-]+$/.test(pluginId)) {
      throw new Error('PassPlay plugin ID is missing or invalid');
    }
    if (declaredVersion !== API_VERSION) {
      throw new Error(`Unsupported PassPlay API version: ${declaredVersion || 'missing'}`);
    }
    if (!document.querySelector('[data-passplay-plugin-root]')) {
      throw new Error('PassPlay plugin root is missing');
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

  function directStorageKey(key) {
    return `${PLUGIN_STORAGE_PREFIX}${pluginId}.${key}`;
  }

  const directHandlers = {
    'context.get': () => ({
      apiVersion: API_VERSION,
      plugin: { id: pluginId, name: document.title, version: 'direct', permissions: [], modes: ['single'] },
      environment: { locale: document.documentElement.lang || 'ja', standalone: false, mode: 'single' },
    }),
    'players.list': () => parsePlayers(),
    'storage.get': ({ key }) => {
      const raw = localStorage.getItem(directStorageKey(key));
      return raw === null ? null : JSON.parse(raw);
    },
    'storage.set': ({ key, value }) => {
      localStorage.setItem(directStorageKey(key), JSON.stringify(value));
      return true;
    },
    'storage.remove': ({ key }) => {
      localStorage.removeItem(directStorageKey(key));
      return true;
    },
    'navigation.home': () => {
      window.location.href = '../../index.html';
      return true;
    },
    'room.getSession': () => null,
    'room.create': () => {
      throw new Error('Room API is not available outside PassPlay host');
    },
    'room.join': () => {
      throw new Error('Room API is not available outside PassPlay host');
    },
    'room.sync': () => {
      throw new Error('Room API is not available outside PassPlay host');
    },
    'room.start': () => {
      throw new Error('Room API is not available outside PassPlay host');
    },
    'room.action': () => {
      throw new Error('Room API is not available outside PassPlay host');
    },
    'room.leave': () => true,
  };

  async function request(method, args = {}) {
    if (!embedded) {
      const handler = directHandlers[method];
      return handler
        ? Promise.resolve().then(() => handler(args))
        : Promise.reject(new Error(`Unsupported PassPlay API: ${method}`));
    }

    await hostReady;
    return new Promise((resolve, reject) => {
      const requestId = `${pluginId}:${++requestSequence}`;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`PassPlay API request timed out: ${method}`));
      }, 10000);
      pending.set(requestId, {
        resolve: value => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: error => {
          clearTimeout(timer);
          reject(error);
        },
      });
      window.parent.postMessage({
        protocol: PROTOCOL,
        pluginId,
        type: 'request',
        requestId,
        method,
        args,
      }, window.location.origin);
    });
  }

  function emitLifecycle(eventName) {
    if (eventName === 'activate') lifecycleActive = true;
    if (eventName === 'deactivate') lifecycleActive = false;
    const listeners = lifecycleListeners.get(eventName) || [];
    for (const listener of listeners) listener();
  }

  function onLifecycle(eventName, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const listeners = lifecycleListeners.get(eventName) || [];
    listeners.push(listener);
    lifecycleListeners.set(eventName, listeners);
    if (eventName === 'activate' && lifecycleActive) queueMicrotask(listener);
    return () => {
      const current = lifecycleListeners.get(eventName) || [];
      lifecycleListeners.set(eventName, current.filter(item => item !== listener));
    };
  }

  window.addEventListener('message', event => {
    if (!embedded || event.source !== window.parent || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.protocol !== PROTOCOL) return;

    if (message.type === 'host-ready') {
      if (!hostReadyReceived) {
        hostReadyReceived = true;
        clearInterval(helloTimer);
        resolveHostReady();
      }
      return;
    }
    if (message.type === 'response') {
      const callback = pending.get(message.requestId);
      if (!callback) return;
      pending.delete(message.requestId);
      if (message.ok) callback.resolve(message.result);
      else callback.reject(new Error(message.error || 'PassPlay API request failed'));
      return;
    }
    if (message.type === 'room-state') {
      for (const listener of roomListeners) listener(message.snapshot || null);
      return;
    }
    if (message.type === 'lifecycle') emitLifecycle(message.event);
  });

  validateDocumentContract();

  if (embedded) {
    const sendHello = () => {
      window.parent.postMessage({
        protocol: PROTOCOL,
        pluginId,
        type: 'hello',
      }, window.location.origin);
    };
    sendHello();
    helloTimer = setInterval(sendHello, 250);
    window.parent.postMessage({
      protocol: PROTOCOL,
      pluginId,
      type: 'room-subscribe',
    }, window.location.origin);
  }

  async function register(initializer) {
    if (registered) throw new Error('PassPlay plugin is already registered');
    if (typeof initializer !== 'function') throw new TypeError('plugin initializer must be a function');
    registered = true;

    try {
      await initializer(api);
      if (embedded) {
        window.parent.postMessage({
          protocol: PROTOCOL,
          pluginId,
          type: 'ready',
        }, window.location.origin);
      } else {
        emitLifecycle('activate');
      }
    } catch (error) {
      registered = false;
      const message = error instanceof Error ? error.message : String(error);
      if (embedded) {
        window.parent.postMessage({
          protocol: PROTOCOL,
          pluginId,
          type: 'error',
          error: message,
        }, window.location.origin);
      }
      throw error;
    }
  }

  const api = Object.freeze({
    apiVersion: API_VERSION,
    pluginId,
    register,
    context: Object.freeze({
      get: () => request('context.get'),
    }),
    players: Object.freeze({
      list: () => request('players.list'),
    }),
    storage: Object.freeze({
      get: key => request('storage.get', { key }),
      set: (key, value) => request('storage.set', { key, value }),
      remove: key => request('storage.remove', { key }),
    }),
    navigation: Object.freeze({
      home: () => request('navigation.home'),
    }),
    room: Object.freeze({
      getApiBase: () => request('room.getApiBase'),
      setApiBase: apiBase => request('room.setApiBase', { apiBase }),
      getSession: () => request('room.getSession'),
      create: options => request('room.create', options),
      join: options => request('room.join', options),
      sync: () => request('room.sync'),
      start: () => request('room.start'),
      action: action => request('room.action', { action }),
      leave: () => request('room.leave'),
      onStateChange: listener => {
        if (typeof listener !== 'function') throw new TypeError('listener must be a function');
        roomListeners.add(listener);
        return () => roomListeners.delete(listener);
      },
    }),
    lifecycle: Object.freeze({
      on: onLifecycle,
    }),
    assets: Object.freeze({
      url: path => new URL(path, document.baseURI).href,
      fetchJSON: async path => {
        const response = await fetch(new URL(path, document.baseURI));
        if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
        return response.json();
      },
    }),
  });

  window.PassPlay = api;

  document.addEventListener('click', event => {
    const homeLink = event.target.closest('[data-passplay-home]');
    if (!homeLink) return;
    event.preventDefault();
    api.navigation.home();
  });

})();
