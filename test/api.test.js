import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getAccount, getDomains, getAliases, createAlias, updateAlias, deleteAlias, generatePassword, } from '../src/lib/api.js';
const BASE_URL = 'https://api.forwardemail.net/v1';
const TOKEN = 'test-api-token';
let fetchMock;
beforeEach(() => {
    fetchMock = mock.fn();
    globalThis.fetch = fetchMock;
});
afterEach(() => {
    mock.restoreAll();
});
function mockResponse(status, body, ok, headers) {
    return {
        ok: ok !== undefined ? ok : status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers: {
            get(name) {
                return headers?.[name] ?? null;
            },
        },
        json: async () => body,
    };
}
/** Extract typed call arguments from a mock. */
function callArgs(index = 0) {
    return fetchMock.mock.calls[index].arguments;
}
/* ====== Auth header ====== */
describe('authentication', () => {
    it('sends correct Basic auth header', async () => {
        fetchMock.mock.mockImplementation(async () => mockResponse(200, { email: 'test@x.com' }));
        await getAccount(TOKEN);
        const [url, opts] = callArgs();
        assert.equal(url, `${BASE_URL}/account`);
        assert.equal(opts.headers.Authorization, 'Basic ' + btoa(TOKEN + ':'));
    });
});
/* ====== getAccount ====== */
describe('getAccount', () => {
    it('returns account data on success', async () => {
        const account = { email: 'user@example.com', plan: 'enhanced_protection' };
        fetchMock.mock.mockImplementation(async () => mockResponse(200, account));
        const result = await getAccount(TOKEN);
        assert.deepEqual(result, account);
    });
    it('throws on 401', async () => {
        fetchMock.mock.mockImplementation(async () => mockResponse(401, { message: 'Invalid token' }, false));
        await assert.rejects(() => getAccount(TOKEN), (err) => {
            assert.equal(err.status, 401);
            assert.equal(err.message, 'Invalid token');
            return true;
        });
    });
});
/* ====== getDomains ====== */
describe('getDomains', () => {
    it('fetches domains with pagination params', async () => {
        const domains = [{ name: 'example.com' }];
        fetchMock.mock.mockImplementation(async () => mockResponse(200, domains));
        const result = await getDomains(TOKEN);
        assert.deepEqual(result, domains);
        const [url] = callArgs();
        assert.ok(url.includes('/domains?page=1&limit=1000'));
    });
    it('fetches all pages when pagination headers indicate more results', async () => {
        const responses = [
            mockResponse(200, [{ name: 'page-one.example' }], true, { 'X-Page-Count': '2' }),
            mockResponse(200, [{ name: 'page-two.example' }], true, { 'X-Page-Count': '2' }),
        ];
        fetchMock.mock.mockImplementation(async () => responses.shift());
        const result = await getDomains(TOKEN);
        assert.deepEqual(result, [{ name: 'page-one.example' }, { name: 'page-two.example' }]);
        assert.equal(fetchMock.mock.calls.length, 2);
        const [firstUrl] = callArgs(0);
        const [secondUrl] = callArgs(1);
        assert.ok(firstUrl.includes('/domains?page=1&limit=1000'));
        assert.ok(secondUrl.includes('/domains?page=2&limit=1000'));
    });
});
/* ====== getAliases ====== */
describe('getAliases', () => {
    it('fetches aliases for a domain', async () => {
        const aliases = [{ id: '1', name: 'test' }];
        fetchMock.mock.mockImplementation(async () => mockResponse(200, aliases));
        const result = await getAliases(TOKEN, 'example.com');
        assert.deepEqual(result, aliases);
        const [url] = callArgs();
        assert.ok(url.includes('/domains/example.com/aliases?page=1&limit=1000'));
    });
    it('encodes special characters in domain', async () => {
        fetchMock.mock.mockImplementation(async () => mockResponse(200, []));
        await getAliases(TOKEN, 'test domain.com');
        const [url] = callArgs();
        assert.ok(url.includes(encodeURIComponent('test domain.com')));
    });
});
/* ====== createAlias ====== */
describe('createAlias', () => {
    it('sends POST with alias data', async () => {
        const alias = { id: '1', name: 'new' };
        fetchMock.mock.mockImplementation(async () => mockResponse(200, alias));
        const data = { name: 'new', recipients: ['a@x.com'] };
        const result = await createAlias(TOKEN, 'example.com', data);
        assert.deepEqual(result, alias);
        const [, opts] = callArgs();
        assert.equal(opts.method, 'POST');
        assert.equal(opts.headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(opts.body), data);
    });
});
/* ====== updateAlias ====== */
describe('updateAlias', () => {
    it('sends PUT to correct endpoint', async () => {
        const updated = { id: 'abc123', name: 'test', is_enabled: false };
        fetchMock.mock.mockImplementation(async () => mockResponse(200, updated));
        const result = await updateAlias(TOKEN, 'example.com', 'abc123', { is_enabled: false });
        assert.deepEqual(result, updated);
        const [url, opts] = callArgs();
        assert.ok(url.includes('/domains/example.com/aliases/abc123'));
        assert.equal(opts.method, 'PUT');
    });
});
/* ====== deleteAlias ====== */
describe('deleteAlias', () => {
    it('sends DELETE and returns null for 204', async () => {
        fetchMock.mock.mockImplementation(async () => ({
            ok: true,
            status: 204,
            statusText: 'No Content',
            json: async () => null,
        }));
        const result = await deleteAlias(TOKEN, 'example.com', 'abc123');
        assert.equal(result, null);
        const [url, opts] = callArgs();
        assert.ok(url.includes('/domains/example.com/aliases/abc123'));
        assert.equal(opts.method, 'DELETE');
    });
});
/* ====== generatePassword ====== */
describe('generatePassword', () => {
    it('sends POST to generate-password endpoint', async () => {
        const pwData = { password: 'secret123' };
        fetchMock.mock.mockImplementation(async () => mockResponse(200, pwData));
        const result = await generatePassword(TOKEN, 'example.com', 'abc123');
        assert.deepEqual(result, pwData);
        const [url, opts] = callArgs();
        assert.ok(url.includes('/aliases/abc123/generate-password'));
        assert.equal(opts.method, 'POST');
    });
});
/* ====== Error handling ====== */
describe('error handling', () => {
    it('includes status code in error', async () => {
        fetchMock.mock.mockImplementation(async () => mockResponse(422, { message: 'Validation failed' }, false));
        await assert.rejects(() => createAlias(TOKEN, 'example.com', {}), (err) => {
            assert.equal(err.status, 422);
            assert.equal(err.message, 'Validation failed');
            return true;
        });
    });
    it('falls back to statusText when JSON parsing fails', async () => {
        fetchMock.mock.mockImplementation(async () => ({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => { throw new Error('invalid json'); },
        }));
        await assert.rejects(() => getAccount(TOKEN), (err) => {
            assert.equal(err.status, 500);
            assert.equal(err.message, 'Internal Server Error');
            return true;
        });
    });
});
