/**
 * Test setup: mock browser APIs that the extension code depends on.
 * Import this before importing any extension modules.
 */

const i18nMessages: Record<string, string> = {};

/** Test-only extensions for the mock browser API. */
interface MockI18n {
  getMessage(key: string): string;
  _setMessages(msgs: Record<string, string>): void;
  _clearMessages(): void;
}

interface MockStorageLocal {
  _store: Record<string, unknown>;
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(obj: Record<string, unknown>): Promise<void>;
  _clear(): void;
}

interface MockRuntime {
  _listeners: Array<(message: any, sender: any) => Promise<any> | void>;
  onMessage: {
    addListener(fn: (message: any, sender: any) => Promise<any> | void): void;
  };
  sendMessage(msg: any): Promise<any>;
  openOptionsPage(): void;
}

interface MockMessageDisplay {
  _listeners: Array<(tab: any, messages: any) => Promise<void> | void>;
  onMessagesDisplayed: {
    addListener(fn: (tab: any, messages: any) => Promise<void> | void): void;
  };
  getDisplayedMessages(tabId: number): Promise<unknown[]>;
}

interface MockMessageDisplayAction {
  setBadgeText(details: Record<string, unknown>): Promise<void>;
  setBadgeBackgroundColor(details: Record<string, unknown>): Promise<void>;
  setTitle(details: Record<string, unknown>): Promise<void>;
}

interface MockTabs {
  getCurrent(): Promise<{ id: number; windowId: number; active: boolean }>;
  query(queryInfo: Record<string, unknown>): Promise<Array<{ id: number; windowId: number; active: boolean }>>;
}

interface MockBrowser {
  i18n: MockI18n;
  storage: { local: MockStorageLocal };
  runtime: MockRuntime;
  messageDisplay: MockMessageDisplay;
  messageDisplayAction: MockMessageDisplayAction;
  tabs: MockTabs;
}

/** Minimal mock of the Thunderbird `browser` WebExtension API. */
(globalThis as any).browser = {
  i18n: {
    getMessage(key: string): string {
      return i18nMessages[key] || '';
    },
    /** Test helper: register fake i18n messages. */
    _setMessages(msgs: Record<string, string>): void {
      Object.assign(i18nMessages, msgs);
    },
    _clearMessages(): void {
      for (const key of Object.keys(i18nMessages)) {
        delete i18nMessages[key];
      }
    },
  },
  storage: {
    local: {
      _store: {} as Record<string, unknown>,
      async get(keys: string | string[]): Promise<Record<string, unknown>> {
        if (typeof keys === 'string') keys = [keys];
        const result: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in this._store) result[k] = this._store[k];
        }
        return result;
      },
      async set(obj: Record<string, unknown>): Promise<void> {
        Object.assign(this._store, obj);
      },
      _clear(): void {
        this._store = {};
      },
    },
  },
  runtime: {
    _listeners: [] as Array<(message: any, sender: any) => Promise<any> | void>,
    onMessage: {
      addListener(fn: (message: any, sender: any) => Promise<any> | void): void {
        (globalThis as any).browser.runtime._listeners.push(fn);
      },
    },
    sendMessage(msg: any): Promise<any> {
      const rt = (globalThis as any).browser.runtime;
      const handler = rt._listeners[rt._listeners.length - 1];
      if (!handler) return Promise.resolve({ error: 'No handler' });
      return handler(msg, {}) as Promise<any>;
    },
    openOptionsPage(): void {},
  },
  messageDisplay: {
    _listeners: [] as Array<(tab: any, messages: any) => Promise<void> | void>,
    onMessagesDisplayed: {
      addListener(fn: (tab: any, messages: any) => Promise<void> | void): void {
        (globalThis as any).browser.messageDisplay._listeners.push(fn);
      },
    },
    async getDisplayedMessages(): Promise<unknown[]> {
      return [];
    },
  },
  messageDisplayAction: {
    async setBadgeText(): Promise<void> {},
    async setBadgeBackgroundColor(): Promise<void> {},
    async setTitle(): Promise<void> {},
  },
  tabs: {
    async getCurrent(): Promise<{ id: number; windowId: number; active: boolean }> {
      return { id: 1, windowId: 1, active: true };
    },
    async query(): Promise<Array<{ id: number; windowId: number; active: boolean }>> {
      return [{ id: 1, windowId: 1, active: true }];
    },
  },
} satisfies MockBrowser;

/** Mock navigator.onLine (default: online) */
if (typeof globalThis.navigator === 'undefined') {
  (globalThis as any).navigator = {};
}
(globalThis as any).navigator.onLine = true;

export {};
