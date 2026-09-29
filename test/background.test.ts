import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import {
  getCachedAliases,
  getCachedDomains,
  getCachedSieveScripts,
  invalidateAll,
  setCachedAliases,
  setCachedDomains,
  setCachedSieveScripts,
} from '../src/lib/cache.js';

/**
 * The background script registers a message listener on import.
 * We import it once, then use browser.runtime.sendMessage to test handlers.
 */
let fetchMock: ReturnType<typeof mock.fn>;

beforeEach(() => {
  fetchMock = mock.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  invalidateAll();
  (globalThis as any).browser.storage.local._clear();
});

afterEach(() => {
  mock.restoreAll();
});

function mockResponse(
  status: number,
  body: unknown,
  ok?: boolean,
  headers?: Record<string, string>,
) {
  return {
    ok: ok !== undefined ? ok : status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: {
      get(name: string): string | null {
        return headers?.[name] ?? null;
      },
    },
    json: async () => body,
  };
}

// Import background script to register its message listener
await import('../src/background/background.js');

function send(msg: Record<string, unknown>): Promise<any> {
  return (globalThis as any).browser.runtime.sendMessage(msg);
}

function getMessageDisplayListener(): (tab: any, messages: any) => Promise<void> {
  const listeners = (globalThis as any).browser.messageDisplay._listeners;
  return listeners[listeners.length - 1];
}

/* ====== testConnection ====== */
describe('testConnection handler', () => {
  it('returns account data on success', async () => {
    const account = { email: 'user@example.com', plan: 'Free' };
    fetchMock.mock.mockImplementation(async () => mockResponse(200, account));

    const res = await send({ type: 'testConnection', token: 'test-token' });

    assert.ok(res.data);
    assert.equal(res.data.email, 'user@example.com');
  });

  it('returns error on API failure', async () => {
    fetchMock.mock.mockImplementation(async () =>
      mockResponse(401, { message: 'Invalid' }, false),
    );

    const res = await send({ type: 'testConnection', token: 'bad-token' });

    assert.ok(res.error);
    assert.equal(res.status, 401);
  });
});

/* ====== getDomains ====== */
describe('getDomains handler', () => {
  it('fetches domains and caches them', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    const domains = [{ name: 'example.com' }];
    fetchMock.mock.mockImplementation(async () => mockResponse(200, domains));

    const res = await send({ type: 'getDomains' });

    assert.deepEqual(res.data, domains);

    // Second call should use cache (no additional fetch)
    const res2 = await send({ type: 'getDomains' });
    assert.deepEqual(res2.data, domains);
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  it('errors when no token configured', async () => {
    const res = await send({ type: 'getDomains' });
    assert.ok(res.error);
    assert.ok(res.error.includes('No API token'));
  });
});

/* ====== getAliases ====== */
describe('getAliases handler', () => {
  it('fetches aliases and caches them', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    const aliases = [{ id: '1', name: 'test' }];
    fetchMock.mock.mockImplementation(async () => mockResponse(200, aliases));

    const res = await send({ type: 'getAliases', domain: 'example.com' });

    assert.deepEqual(res.data, aliases);

    // Second call uses cache
    const res2 = await send({ type: 'getAliases', domain: 'example.com' });
    assert.deepEqual(res2.data, aliases);
    assert.equal(fetchMock.mock.calls.length, 1);
  });
});

/* ====== createAlias ====== */
describe('createAlias handler', () => {
  it('creates alias and invalidates cache', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });

    // Pre-populate cache
    setCachedAliases('example.com', [{ id: '1', name: 'old' }]);

    const newAlias = { id: '2', name: 'new' };
    fetchMock.mock.mockImplementation(async () => mockResponse(200, newAlias));

    const res = await send({
      type: 'createAlias',
      domain: 'example.com',
      data: { name: 'new', recipients: ['a@x.com'] },
    });

    assert.deepEqual(res.data, newAlias);
    // Cache should be invalidated after create
    assert.equal(getCachedAliases('example.com'), null);
  });
});

/* ====== updateAlias ====== */
describe('updateAlias handler', () => {
  it('updates alias and patches cache when alias exists', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });

    // Pre-populate cache with the alias
    setCachedAliases('example.com', [
      { id: '1', name: 'test', is_enabled: true },
    ]);

    const updated = { id: '1', name: 'test', is_enabled: false };
    fetchMock.mock.mockImplementation(async () => mockResponse(200, updated));

    const res = await send({
      type: 'updateAlias',
      domain: 'example.com',
      id: '1',
      data: { is_enabled: false },
    });

    assert.deepEqual(res.data, updated);
    // Cache should be patched, not invalidated
    const cached = getCachedAliases('example.com');
    assert.notEqual(cached, null);
    assert.equal(cached![0].is_enabled, false);
  });
});

/* ====== deleteAlias ====== */
describe('deleteAlias handler', () => {
  it('deletes alias and removes from cache', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });

    // Pre-populate cache
    setCachedAliases('example.com', [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ]);

    fetchMock.mock.mockImplementation(async () => ({
      ok: true,
      status: 204,
      statusText: 'No Content',
      json: async () => null,
    }));

    const res = await send({
      type: 'deleteAlias',
      domain: 'example.com',
      id: '1',
    });

    assert.deepEqual(res.data, { ok: true });
    // Cache should still exist but with alias removed
    const cached = getCachedAliases('example.com');
    assert.notEqual(cached, null);
    assert.equal(cached!.length, 1);
    assert.equal(cached![0].id, '2');
  });
});

/* ====== generatePassword ====== */
describe('generatePassword handler', () => {
  it('returns generated password', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    const pwData = { password: 'secret123' };
    fetchMock.mock.mockImplementation(async () => mockResponse(200, pwData));

    const res = await send({
      type: 'generatePassword',
      domain: 'example.com',
      id: 'abc123',
    });

    assert.deepEqual(res.data, pwData);
  });
});

/* ====== matchAliases ====== */
describe('matchAliases handler', () => {
  it('matches aliases even when the alias payload omits domain', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    setCachedDomains([{ name: 'example.com' } as any]);
    setCachedAliases('example.com', [{ id: '1', name: 'sales' } as any]);

    const res = await send({
      type: 'matchAliases',
      addresses: ['Sales Team <sales@example.com>'],
    });

    assert.equal(res.error, undefined);
    assert.equal(res.data.matches.length, 1);
    assert.equal(res.data.matches[0].alias.id, '1');
  });

  it('only fetches aliases for domains present in the message', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    setCachedDomains([{ name: 'example.com' } as any, { name: 'other.com' } as any]);

    fetchMock.mock.mockImplementation(async () => mockResponse(200, [{ id: '1', name: 'sales' }]));

    const res = await send({
      type: 'matchAliases',
      addresses: ['Sales <sales@example.com>'],
    });

    assert.equal(res.error, undefined);
    assert.equal(fetchMock.mock.calls.length, 1);
    const [url] = fetchMock.mock.calls[0].arguments as [string];
    assert.ok(url.includes('/domains/example.com/aliases'));
  });
});

/* ====== token changes ====== */
describe('token changes', () => {
  it('invalidates cached domains when the configured token changes', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'token-a' });
    const oldDomains = [{ name: 'old.example' }];
    fetchMock.mock.mockImplementationOnce(async () => mockResponse(200, oldDomains));

    const first = await send({ type: 'getDomains' });
    assert.deepEqual(first.data, oldDomains);

    await (globalThis as any).browser.storage.local.set({ apiToken: 'token-b' });
    const freshDomains = [{ name: 'new.example' }];
    fetchMock.mock.mockImplementationOnce(async () => mockResponse(200, freshDomains));

    const second = await send({ type: 'getDomains' });
    assert.deepEqual(second.data, freshDomains);
    assert.equal(fetchMock.mock.calls.length, 2);
  });
});

/* ====== badge updates ====== */
describe('message display badge updates', () => {
  it('counts BCC matches and deduplicates the same alias', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    fetchMock.mock.mockImplementationOnce(async () => mockResponse(200, [{ name: 'example.com' }]));
    await send({ type: 'getDomains' });
    setCachedAliases('example.com', [{ id: '1', name: '*', domain: 'example.com' } as any]);

    const setBadgeText = mock.fn(async () => {});
    const setBadgeBackgroundColor = mock.fn(async () => {});
    const setTitle = mock.fn(async () => {});
    (globalThis as any).browser.messageDisplayAction.setBadgeText = setBadgeText;
    (globalThis as any).browser.messageDisplayAction.setBadgeBackgroundColor = setBadgeBackgroundColor;
    (globalThis as any).browser.messageDisplayAction.setTitle = setTitle;

    const listener = getMessageDisplayListener();
    await listener(
      { id: 9, windowId: 1, active: true },
      [{ bccList: ['sales@example.com', 'info@example.com'] }],
    );

    assert.equal(setBadgeText.mock.calls.length, 1);
    const badgeTextCall = setBadgeText.mock.calls[0] as unknown as {
      arguments: [{ text: string; tabId: number }];
    };
    assert.deepEqual(badgeTextCall.arguments[0], { text: '1', tabId: 9 });
    assert.equal(setBadgeBackgroundColor.mock.calls.length, 1);
    assert.equal(setTitle.mock.calls.length, 1);
  });
});

/* ====== getSieveScripts handler ====== */
describe('getSieveScripts handler', () => {
  it('fetches sieve scripts and caches them', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    const scripts = [{ id: 's1', name: 'test', content: 'keep;' }];
    fetchMock.mock.mockImplementation(async () => mockResponse(200, scripts));

    const res = await send({ type: 'getSieveScripts', domain: 'example.com', aliasId: 'a1' });

    assert.deepEqual(res.data, scripts);

    // Second call should use cache
    const res2 = await send({ type: 'getSieveScripts', domain: 'example.com', aliasId: 'a1' });
    assert.deepEqual(res2.data, scripts);
    assert.equal(fetchMock.mock.calls.length, 1);
  });
});

/* ====== createSieveScript handler ====== */
describe('createSieveScript handler', () => {
  it('creates script and invalidates cache', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    setCachedSieveScripts('example.com', 'a1', [{ id: 's1' }] as any);

    const newScript = { id: 's2', name: 'new' };
    fetchMock.mock.mockImplementation(async () => mockResponse(200, newScript));

    const res = await send({
      type: 'createSieveScript',
      domain: 'example.com',
      aliasId: 'a1',
      data: { name: 'new', content: 'keep;' },
    });

    assert.deepEqual(res.data, newScript);
    assert.equal(getCachedSieveScripts('example.com', 'a1'), null);
  });
});

/* ====== deleteSieveScript handler ====== */
describe('deleteSieveScript handler', () => {
  it('deletes script and invalidates cache', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    setCachedSieveScripts('example.com', 'a1', [{ id: 's1' }] as any);

    fetchMock.mock.mockImplementation(async () => ({
      ok: true, status: 204, statusText: 'No Content', json: async () => null,
    }));

    const res = await send({
      type: 'deleteSieveScript',
      domain: 'example.com',
      aliasId: 'a1',
      scriptId: 's1',
    });

    assert.deepEqual(res.data, { ok: true });
    assert.equal(getCachedSieveScripts('example.com', 'a1'), null);
  });
});

/* ====== activateSieveScript handler ====== */
describe('activateSieveScript handler', () => {
  it('activates script and invalidates cache', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    setCachedSieveScripts('example.com', 'a1', [{ id: 's1' }] as any);

    const activated = { id: 's1', name: 'test', is_active: true };
    fetchMock.mock.mockImplementation(async () => mockResponse(200, activated));

    const res = await send({
      type: 'activateSieveScript',
      domain: 'example.com',
      aliasId: 'a1',
      scriptId: 's1',
    });

    assert.deepEqual(res.data, activated);
    assert.equal(getCachedSieveScripts('example.com', 'a1'), null);
  });
});

/* ====== Unknown message type ====== */
describe('unknown message type', () => {
  it('returns error for unknown type', async () => {
    const res = await send({ type: 'nonexistent' });
    assert.ok(res.error);
    assert.ok(res.error.includes('Unknown'));
  });
});

interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe('cache race protection', () => {
  it('does not let a late old-account domain response overwrite the active account cache', async () => {
    const deferredA = deferred<MockResponse>();
    const started = deferred<void>();
    await (globalThis as any).browser.storage.local.set({ apiToken: 'token-a' });
    fetchMock.mock.mockImplementation(async (_url: string, options: RequestInit) => {
      const authorization = (options.headers as Record<string, string>).Authorization;
      if (authorization === `Basic ${btoa('token-a:')}`) {
        started.resolve();
        return deferredA.promise;
      }
      return mockResponse(200, [{ name: 'b.example' }]);
    });

    const requestA = send({ type: 'getDomains' });
    await started.promise;
    await (globalThis as any).browser.storage.local.set({ apiToken: 'token-b' });
    assert.deepEqual((await send({ type: 'getDomains' })).data, [{ name: 'b.example' }]);
    deferredA.resolve(mockResponse(200, [{ name: 'a.example' }]));
    await requestA;

    const finalResult = await send({ type: 'getDomains' });
    assert.deepEqual(finalResult.data, [{ name: 'b.example' }]);
    assert.equal(fetchMock.mock.calls.length, 2);
  });

  it('does not resurrect aliases from a list read that predates deletion', async () => {
    const staleList = deferred<MockResponse>();
    const started = deferred<void>();
    let getRequests = 0;
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    fetchMock.mock.mockImplementation(async (_url: string, options: RequestInit) => {
      if (options.method === 'DELETE') return mockResponse(204, null);
      getRequests += 1;
      if (getRequests === 1) {
        started.resolve();
        return staleList.promise;
      }
      return mockResponse(200, []);
    });

    const pendingList = send({ type: 'getAliases', domain: 'example.com' });
    await started.promise;
    await send({ type: 'deleteAlias', domain: 'example.com', id: '1' });
    staleList.resolve(mockResponse(200, [{ id: '1', name: 'stale' }]));
    await pendingList;

    assert.deepEqual((await send({ type: 'getAliases', domain: 'example.com' })).data, []);
  });

  it('does not resurrect Sieve scripts from a list read that predates deletion', async () => {
    const staleList = deferred<MockResponse>();
    const started = deferred<void>();
    let getRequests = 0;
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    fetchMock.mock.mockImplementation(async (_url: string, options: RequestInit) => {
      if (options.method === 'DELETE') return mockResponse(204, null);
      getRequests += 1;
      if (getRequests === 1) {
        started.resolve();
        return staleList.promise;
      }
      return mockResponse(200, []);
    });

    const pendingList = send({ type: 'getSieveScripts', domain: 'example.com', aliasId: 'a1' });
    await started.promise;
    await send({ type: 'deleteSieveScript', domain: 'example.com', aliasId: 'a1', scriptId: 's1' });
    staleList.resolve(mockResponse(200, [{ id: 's1', name: 'stale', content: 'keep;' }]));
    await pendingList;

    assert.deepEqual(
      (await send({ type: 'getSieveScripts', domain: 'example.com', aliasId: 'a1' })).data,
      [],
    );
  });
});

describe('mutation result accuracy', () => {
  it('returns an alias update success when the best-effort cache refresh fails', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    const updated = { id: '1', name: 'sales', is_enabled: false };
    fetchMock.mock.mockImplementationOnce(async () => mockResponse(200, updated), 0);
    fetchMock.mock.mockImplementationOnce(
      async () => mockResponse(503, { message: 'refresh unavailable' }, false),
      1,
    );

    const result = await send({
      type: 'updateAlias',
      domain: 'example.com',
      id: '1',
      data: { is_enabled: false },
    });

    assert.deepEqual(result.data, updated);
    assert.equal(result.error, undefined);
    assert.equal(getCachedAliases('example.com'), null);
  });
});

describe('partial alias matching', () => {
  it('reports failed domains without discarding matches from available domains', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    fetchMock.mock.mockImplementation(async (url: string) => {
      if (url.includes('/domains?page=1')) {
        return mockResponse(200, [{ name: 'a.example' }, { name: 'b.example' }]);
      }
      if (url.includes('/domains/a.example/aliases')) {
        return mockResponse(200, [{ id: '1', name: 'sales' }]);
      }
      return mockResponse(503, { message: 'unavailable' }, false);
    });
    await send({ type: 'getDomains' });

    const result = await send({
      type: 'matchAliases',
      addresses: ['sales@a.example', 'support@b.example'],
    });

    assert.equal(result.error, undefined);
    assert.equal(result.data.matches.length, 1);
    assert.deepEqual(result.data.failedDomains, ['b.example']);
  });
});

describe('credential and audit messages', () => {
  it('removes all account credentials and invalidates account caches', async () => {
    await send({
      type: 'saveCredentials',
      token: 'secret-token',
      email: 'user@example.test',
      plan: 'Enhanced',
    });
    setCachedDomains([{ name: 'example.com' }]);
    await (globalThis as any).browser.storage.local.set({ lastDomain: 'example.com' });

    const result = await send({ type: 'removeCredentials' });
    const storage = (globalThis as any).browser.storage.local._store;

    assert.deepEqual(result.data, { ok: true });
    assert.equal(storage.apiToken, undefined);
    assert.equal(storage.accountEmail, undefined);
    assert.equal(storage.accountPlan, undefined);
    assert.equal(storage.lastDomain, undefined);
    assert.equal(getCachedDomains(), null);
    assert.equal(getCachedAliases('example.com'), null);
    const events = (await send({ type: 'getAuditEvents' })).data;
    assert.equal(events[events.length - 1].action, 'credentials_removed');
    assert.equal(JSON.stringify(events).includes('secret-token'), false);
  });

  it('clears persisted audit history on request', async () => {
    await send({
      type: 'saveCredentials',
      token: 'secret-token',
      email: 'user@example.test',
      plan: 'Enhanced',
    });
    assert.equal((await send({ type: 'getAuditEvents' })).data.length, 1);

    await send({ type: 'clearAuditEvents' });
    assert.deepEqual((await send({ type: 'getAuditEvents' })).data, []);
  });
});

describe('Demo Mode persistence', () => {
  it('reads Demo Mode from persisted storage', async () => {
    await send({ type: 'setDemoMode', enabled: true });
    assert.equal((globalThis as any).browser.storage.local._store.demoMode, true);
    assert.deepEqual((await send({ type: 'getDemoMode' })).data, { demoMode: true });
  });

  it('uses persisted Demo Mode for badge checks without calling the API', async () => {
    await send({ type: 'setDemoMode', enabled: true });
    fetchMock.mock.mockImplementation(async () => {
      throw new Error('Demo badge must not call the API');
    });

    await getMessageDisplayListener()(
      { id: 17, windowId: 1, active: true },
      [{ recipients: ['sales@example.com'] }],
    );

    assert.equal(fetchMock.mock.calls.length, 0);
  });
});

describe('mutation audit events', () => {
  it('records password-generation outcomes without storing the generated password', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    fetchMock.mock.mockImplementation(async () =>
      mockResponse(200, { generated_password: 'sensitive-generated-value' }),
    );

    const result = await send({ type: 'generatePassword', domain: 'example.com', id: 'alias-1' });
    const events = (await send({ type: 'getAuditEvents' })).data;

    assert.equal(result.data.generated_password, 'sensitive-generated-value');
    assert.equal(events[events.length - 1].action, 'password_generated');
    assert.equal(events[events.length - 1].status, 'success');
    assert.equal(events[events.length - 1].target, 'domain/example.com/alias/alias-1');
    assert.equal(JSON.stringify(events).includes('sensitive-generated-value'), false);
  });

  it('records a stable failure category for rejected mutations', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    fetchMock.mock.mockImplementation(async () =>
      mockResponse(503, { message: 'provider unavailable' }, false),
    );

    const result = await send({
      type: 'deleteAlias',
      domain: 'example.com',
      id: 'alias-1',
    });
    const events = (await send({ type: 'getAuditEvents' })).data;

    assert.equal(result.status, 503);
    assert.equal(events[events.length - 1].action, 'alias_deleted');
    assert.equal(events[events.length - 1].status, 'failure');
    assert.equal(events[events.length - 1].statusCode, 503);
    assert.equal(events[events.length - 1].errorCategory, 'server');
  });

  it('records Sieve mutations without retaining Sieve content', async () => {
    await (globalThis as any).browser.storage.local.set({ apiToken: 'test-token' });
    fetchMock.mock.mockImplementation(async () =>
      mockResponse(200, { id: 'script-1', name: 'filter', content: 'keep;' }),
    );

    await send({
      type: 'updateSieveScript',
      domain: 'example.com',
      aliasId: 'alias-1',
      scriptId: 'script-1',
      data: { content: 'redirect \"private@example.test\";' },
    });
    const events = (await send({ type: 'getAuditEvents' })).data;

    assert.equal(events[events.length - 1].action, 'sieve_updated');
    assert.equal(events[events.length - 1].target, 'domain/example.com/alias/alias-1/sieve/script-1');
    assert.equal(JSON.stringify(events).includes('private@example.test'), false);
  });
});
