/**
 * ForwardEmail REST API client.
 * Auth: HTTP Basic with API token as username, empty password.
 * Base URL: https://api.forwardemail.net/v1
 */

import type { Account, Alias, Domain, PasswordResult } from '../types/forward-email.js';

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

function authHeader(token: string): string {
  return 'Basic ' + btoa(token + ':');
}

async function requestResponse(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': authHeader(token),
      'Accept': 'application/json',
    },
  };

  if (body !== undefined) {
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(BASE_URL + path, opts);

  if (!res.ok) {
    let message: string;
    try {
      const json = await res.json();
      message = json.message || res.statusText;
    } catch {
      message = res.statusText;
    }
    throw new ApiError(message, res.status);
  }

  return res;
}

async function request(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await requestResponse(token, method, path, body);

  if (res.status === 204) return null;

  return res.json();
}

async function requestAllPages<T>(token: string, path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;

  while (true) {
    const joiner = path.includes('?') ? '&' : '?';
    const res = await requestResponse(token, 'GET', `${path}${joiner}page=${page}&limit=${LIST_LIMIT}`);
    const data = await res.json() as T[];
    items.push(...data);

    const pageCountHeader = res.headers.get('X-Page-Count');
    if (pageCountHeader) {
      const pageCount = Number.parseInt(pageCountHeader, 10);
      if (Number.isFinite(pageCount) && page >= pageCount) break;
    } else if (data.length < LIST_LIMIT) {
      break;
    }

    page += 1;
  }

  return items;
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
