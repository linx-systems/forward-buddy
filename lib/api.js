/**
 * ForwardEmail REST API client.
 * Auth: HTTP Basic with API token as username, empty password.
 * Base URL: https://api.forwardemail.net/v1
 */
export class ApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}
const BASE_URL = 'https://api.forwardemail.net/v1';
function authHeader(token) {
    return 'Basic ' + btoa(token + ':');
}
async function request(token, method, path, body) {
    const opts = {
        method,
        headers: {
            'Authorization': authHeader(token),
            'Accept': 'application/json',
        },
    };
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(BASE_URL + path, opts);
    if (!res.ok) {
        let message;
        try {
            const json = await res.json();
            message = json.message || res.statusText;
        }
        catch {
            message = res.statusText;
        }
        throw new ApiError(message, res.status);
    }
    if (res.status === 204)
        return null;
    return res.json();
}
/**
 * Validate token and get account info.
 * GET /v1/account
 */
export function getAccount(token) {
    return request(token, 'GET', '/account');
}
/**
 * List user's domains.
 * GET /v1/domains?page=1&limit=100
 */
export function getDomains(token) {
    return request(token, 'GET', '/domains?page=1&limit=100');
}
/**
 * List aliases for a domain.
 * GET /v1/domains/:domain/aliases?page=1&limit=100
 */
export function getAliases(token, domain) {
    return request(token, 'GET', `/domains/${encodeURIComponent(domain)}/aliases?page=1&limit=100`);
}
/**
 * Create a new alias.
 * POST /v1/domains/:domain/aliases
 */
export function createAlias(token, domain, data) {
    return request(token, 'POST', `/domains/${encodeURIComponent(domain)}/aliases`, data);
}
/**
 * Update an alias. Uses alias id (MongoDB ObjectId), NOT the name.
 * PUT /v1/domains/:domain/aliases/:id
 */
export function updateAlias(token, domain, id, data) {
    return request(token, 'PUT', `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(id)}`, data);
}
/**
 * Delete an alias. Uses alias id (MongoDB ObjectId), NOT the name.
 * DELETE /v1/domains/:domain/aliases/:id
 */
export function deleteAlias(token, domain, id) {
    return request(token, 'DELETE', `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(id)}`);
}
/**
 * Generate IMAP/SMTP password for an alias.
 * POST /v1/domains/:domain/aliases/:id/generate-password
 */
export function generatePassword(token, domain, id) {
    return request(token, 'POST', `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(id)}/generate-password`);
}
