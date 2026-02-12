/**
 * Test setup: mock browser APIs that the extension code depends on.
 * Import this before importing any extension modules.
 */

const i18nMessages = {};

/** Minimal mock of the Thunderbird `browser` WebExtension API. */
globalThis.browser = {
  i18n: {
    getMessage(key) {
      return i18nMessages[key] || '';
    },
    /** Test helper: register fake i18n messages. */
    _setMessages(msgs) {
      Object.assign(i18nMessages, msgs);
    },
    _clearMessages() {
      for (const key of Object.keys(i18nMessages)) {
        delete i18nMessages[key];
      }
    },
  },
  storage: {
    local: {
      _store: {},
      async get(keys) {
        if (typeof keys === 'string') keys = [keys];
        const result = {};
        for (const k of keys) {
          if (k in this._store) result[k] = this._store[k];
        }
        return result;
      },
      async set(obj) {
        Object.assign(this._store, obj);
      },
      _clear() {
        this._store = {};
      },
    },
  },
  runtime: {
    _listeners: [],
    onMessage: {
      addListener(fn) {
        browser.runtime._listeners.push(fn);
      },
    },
    sendMessage(msg) {
      const handler = browser.runtime._listeners[browser.runtime._listeners.length - 1];
      if (!handler) return Promise.resolve({ error: 'No handler' });
      return handler(msg, {});
    },
    openOptionsPage() {},
  },
};

/** Mock navigator.onLine (default: online) */
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {};
}
globalThis.navigator.onLine = true;

export { };
