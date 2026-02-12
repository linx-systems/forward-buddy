import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import { invalidateAll, setCachedAliases, getCachedAliases } from '../lib/cache.js';

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

function mockResponse(status: number, body: unknown, ok?: boolean) {
  return {
    ok: ok !== undefined ? ok : status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  };
}

// Import background script to register its message listener
await import('../background/background.js');

function send(msg: Record<string, unknown>): Promise<any> {
  return (globalThis as any).browser.runtime.sendMessage(msg);
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

/* ====== Unknown message type ====== */
describe('unknown message type', () => {
  it('returns error for unknown type', async () => {
    const res = await send({ type: 'nonexistent' });
    assert.ok(res.error);
    assert.ok(res.error.includes('Unknown'));
  });
});
