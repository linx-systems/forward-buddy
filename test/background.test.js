import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import { invalidateAll, setCachedAliases, setCachedDomains, getCachedAliases } from '../src/lib/cache.js';
/**
 * The background script registers a message listener on import.
 * We import it once, then use browser.runtime.sendMessage to test handlers.
 */
let fetchMock;
beforeEach(() => {
    fetchMock = mock.fn();
    globalThis.fetch = fetchMock;
    invalidateAll();
    globalThis.browser.storage.local._clear();
});
afterEach(() => {
    mock.restoreAll();
});
function mockResponse(status, body, ok, headers) {
    return {
        ok: ok !== undefined ? ok : status >= 200 && status < 300,
        status,
        statusText: 'OK',
        headers: {
            get(name) {
                return headers?.[name] ?? null;
            },
        },
        json: async () => body,
    };
}
// Import background script to register its message listener
await import('../src/background/background.js');
function send(msg) {
    return globalThis.browser.runtime.sendMessage(msg);
}
function getMessageDisplayListener() {
    const listeners = globalThis.browser.messageDisplay._listeners;
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
        fetchMock.mock.mockImplementation(async () => mockResponse(401, { message: 'Invalid' }, false));
        const res = await send({ type: 'testConnection', token: 'bad-token' });
        assert.ok(res.error);
        assert.equal(res.status, 401);
    });
});
/* ====== getDomains ====== */
describe('getDomains handler', () => {
    it('fetches domains and caches them', async () => {
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
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
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
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
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
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
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
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
        assert.equal(cached[0].is_enabled, false);
    });
});
/* ====== deleteAlias ====== */
describe('deleteAlias handler', () => {
    it('deletes alias and removes from cache', async () => {
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
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
        assert.equal(cached.length, 1);
        assert.equal(cached[0].id, '2');
    });
});
/* ====== generatePassword ====== */
describe('generatePassword handler', () => {
    it('returns generated password', async () => {
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
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
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
        setCachedDomains([{ name: 'example.com' }]);
        setCachedAliases('example.com', [{ id: '1', name: 'sales' }]);
        const res = await send({
            type: 'matchAliases',
            addresses: ['Sales Team <sales@example.com>'],
        });
        assert.equal(res.error, undefined);
        assert.equal(res.data.length, 1);
        assert.equal(res.data[0].alias.id, '1');
    });
    it('only fetches aliases for domains present in the message', async () => {
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
        setCachedDomains([{ name: 'example.com' }, { name: 'other.com' }]);
        fetchMock.mock.mockImplementation(async () => mockResponse(200, [{ id: '1', name: 'sales' }]));
        const res = await send({
            type: 'matchAliases',
            addresses: ['Sales <sales@example.com>'],
        });
        assert.equal(res.error, undefined);
        assert.equal(fetchMock.mock.calls.length, 1);
        const [url] = fetchMock.mock.calls[0].arguments;
        assert.ok(url.includes('/domains/example.com/aliases'));
    });
});
/* ====== token changes ====== */
describe('token changes', () => {
    it('invalidates cached domains when the configured token changes', async () => {
        await globalThis.browser.storage.local.set({ apiToken: 'token-a' });
        const oldDomains = [{ name: 'old.example' }];
        fetchMock.mock.mockImplementationOnce(async () => mockResponse(200, oldDomains));
        const first = await send({ type: 'getDomains' });
        assert.deepEqual(first.data, oldDomains);
        await globalThis.browser.storage.local.set({ apiToken: 'token-b' });
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
        await globalThis.browser.storage.local.set({ apiToken: 'test-token' });
        fetchMock.mock.mockImplementationOnce(async () => mockResponse(200, [{ name: 'example.com' }]));
        await send({ type: 'getDomains' });
        setCachedAliases('example.com', [{ id: '1', name: '*', domain: 'example.com' }]);
        const setBadgeText = mock.fn(async () => { });
        const setBadgeBackgroundColor = mock.fn(async () => { });
        const setTitle = mock.fn(async () => { });
        globalThis.browser.messageDisplayAction.setBadgeText = setBadgeText;
        globalThis.browser.messageDisplayAction.setBadgeBackgroundColor = setBadgeBackgroundColor;
        globalThis.browser.messageDisplayAction.setTitle = setTitle;
        const listener = getMessageDisplayListener();
        await listener({ id: 9, windowId: 1, active: true }, [{ bccList: ['sales@example.com', 'info@example.com'] }]);
        assert.equal(setBadgeText.mock.calls.length, 1);
        const badgeTextCall = setBadgeText.mock.calls[0];
        assert.deepEqual(badgeTextCall.arguments[0], { text: '1', tabId: 9 });
        assert.equal(setBadgeBackgroundColor.mock.calls.length, 1);
        assert.equal(setTitle.mock.calls.length, 1);
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
