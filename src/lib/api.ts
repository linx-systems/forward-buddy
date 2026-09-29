/**
 * ForwardEmail REST API client.
 * Auth: HTTP Basic with API token as username, empty password.
 * Base URL: https://api.forwardemail.net/v1
 */

import type { Account, Alias, Domain, PasswordResult, SieveScript } from '../types/forward-email.js';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const BASE_URL = 'https://api.forwardemail.net/v1';
const LIST_LIMIT = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 100;

function authHeader(token: string): string {
  return 'Basic ' + btoa(token + ':');
}

interface JsonResponse<T> {
  data: T;
  headers: Headers;
}

async function requestJson<T>(token: string, method: string, path: string, body?: unknown): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const opts: RequestInit = {
    method,
    signal: controller.signal,
    headers: {
      'Authorization': authHeader(token),
      'Accept': 'application/json',
    },
  };

  if (body !== undefined) {
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(BASE_URL + path, opts);
    if (response.status === 204) {
      return { data: null as T, headers: response.headers };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) {
        throw new ApiError(response.statusText, response.status);
      }
      throw new ApiError('Invalid JSON response', response.status);
    }

    if (!response.ok) {
      const message = typeof payload === 'object' && payload !== null && 'message' in payload
        && typeof payload.message === 'string'
        ? payload.message
        : response.statusText;
      throw new ApiError(message, response.status);
    }

    return { data: payload as T, headers: response.headers };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new ApiError('Request timed out', 0);
    }
    throw new ApiError('Network request failed', 0);
  } finally {
    clearTimeout(timeout);
  }
}

async function request<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  return (await requestJson<T>(token, method, path, body)).data;
}

async function requestAllPages<T>(token: string, path: string): Promise<T[]> {
  const items: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const joiner = path.includes('?') ? '&' : '?';
    const { data, headers } = await requestJson<T[]>(
      token,
      'GET',
      `${path}${joiner}page=${page}&limit=${LIST_LIMIT}`,
    );
    items.push(...data);

    const pageCountHeader = headers.get('X-Page-Count');
    if (pageCountHeader) {
      const pageCount = Number.parseInt(pageCountHeader, 10);
      if (Number.isFinite(pageCount) && page >= pageCount) return items;
      if (Number.isFinite(pageCount) && page === MAX_PAGES && pageCount > MAX_PAGES) {
        throw new ApiError('Pagination limit reached', 0);
      }
    } else if (data.length < LIST_LIMIT) {
      return items;
    }
  }

  throw new ApiError('Pagination limit reached', 0);
}

/**
 * Validate token and get account info.
 * GET /v1/account
 */
export function getAccount(token: string): Promise<Account> {
  return request(token, 'GET', '/account');
}

/**
 * List user's domains.
 * GET /v1/domains?page=1&limit=1000
 */
export function getDomains(token: string): Promise<Domain[]> {
  return requestAllPages<Domain>(token, '/domains');
}

/**
 * List aliases for a domain.
 * GET /v1/domains/:domain/aliases?page=1&limit=1000
 */
export function getAliases(token: string, domain: string): Promise<Alias[]> {
  return requestAllPages<Alias>(token, `/domains/${encodeURIComponent(domain)}/aliases`);
}

/**
 * Create a new alias.
 * POST /v1/domains/:domain/aliases
 */
export function createAlias(token: string, domain: string, data: Partial<Alias>): Promise<Alias> {
  return request(token, 'POST', `/domains/${encodeURIComponent(domain)}/aliases`, data);
}

/**
 * Update an alias. Uses alias id (MongoDB ObjectId), NOT the name.
 * PUT /v1/domains/:domain/aliases/:id
 */
export function updateAlias(token: string, domain: string, id: string, data: Partial<Alias>): Promise<Alias> {
  return request(
    token,
    'PUT',
    `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(id)}`,
    data,
  );
}

/**
 * Delete an alias. Uses alias id (MongoDB ObjectId), NOT the name.
 * DELETE /v1/domains/:domain/aliases/:id
 */
export function deleteAlias(token: string, domain: string, id: string): Promise<null> {
  return request(
    token,
    'DELETE',
    `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(id)}`,
  );
}

/**
 * Generate IMAP/SMTP password for an alias.
 * POST /v1/domains/:domain/aliases/:id/generate-password
 */
export function generatePassword(token: string, domain: string, id: string): Promise<PasswordResult> {
  return request(
    token,
    'POST',
    `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(id)}/generate-password`,
  );
}

/* ---- Sieve scripts ---- */

function sievePath(domain: string, aliasId: string): string {
  return `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(aliasId)}/sieve`;
}

export function getSieveScripts(token: string, domain: string, aliasId: string): Promise<SieveScript[]> {
  return requestAllPages<SieveScript>(token, sievePath(domain, aliasId));
}

export function getSieveScript(token: string, domain: string, aliasId: string, scriptId: string): Promise<SieveScript> {
  return request(token, 'GET', `${sievePath(domain, aliasId)}/${encodeURIComponent(scriptId)}`);
}

export function createSieveScript(token: string, domain: string, aliasId: string, data: Partial<SieveScript>): Promise<SieveScript> {
  return request(token, 'POST', sievePath(domain, aliasId), data);
}

export function updateSieveScript(token: string, domain: string, aliasId: string, scriptId: string, data: Partial<SieveScript>): Promise<SieveScript> {
  return request(token, 'PUT', `${sievePath(domain, aliasId)}/${encodeURIComponent(scriptId)}`, data);
}

export function deleteSieveScript(token: string, domain: string, aliasId: string, scriptId: string): Promise<null> {
  return request(token, 'DELETE', `${sievePath(domain, aliasId)}/${encodeURIComponent(scriptId)}`);
}

export function activateSieveScript(token: string, domain: string, aliasId: string, scriptId: string): Promise<SieveScript> {
  return request(token, 'POST', `${sievePath(domain, aliasId)}/${encodeURIComponent(scriptId)}/activate`);
}
