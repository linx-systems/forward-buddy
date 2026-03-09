/**
 * Simple TTL cache.
 * Domain list: 5 min TTL. Alias list per domain: 2 min TTL.
 */

import type { Alias, Domain } from '../types/forward-email.js';

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const DOMAIN_TTL = 5 * 60 * 1000;
const ALIAS_TTL = 2 * 60 * 1000;

const store = new Map<string, CacheEntry<unknown>>();

function makeKey(...parts: string[]): string {
  return parts.join(':');
}

function get<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

function set<T>(key: string, data: T, ttl: number): void {
  store.set(key, { data, expires: Date.now() + ttl });
}

function invalidate(key: string): void {
  store.delete(key);
}

/* ---- Public API ---- */

export function getCachedDomains(): Domain[] | null {
  return get<Domain[]>('domains');
}

export function setCachedDomains(data: Domain[]): void {
  set('domains', data, DOMAIN_TTL);
}

export function getCachedAliases(domain: string): Alias[] | null {
  return get<Alias[]>(makeKey('aliases', domain));
}

export function setCachedAliases(domain: string, data: Alias[]): void {
  set(makeKey('aliases', domain), data, ALIAS_TTL);
}

/** Invalidate alias cache for a domain (after create/update/delete). */
export function invalidateAliases(domain: string): void {
  invalidate(makeKey('aliases', domain));
}

/**
 * Update a single alias in the cache by id.
 * Returns true if the cache was updated, false if alias not found in cache.
 */
export function updateCachedAlias(domain: string, id: string, updatedAlias: Alias): boolean {
  const key = makeKey('aliases', domain);
  const entry = store.get(key) as CacheEntry<Alias[]> | undefined;
  if (!entry || Date.now() > entry.expires) return false;
  const list = entry.data;
  if (!Array.isArray(list)) return false;
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  list[idx] = updatedAlias;
  return true;
}

/**
 * Remove a single alias from the cache by id.
 * Returns true if removed, false if not found.
 */
export function removeCachedAlias(domain: string, id: string): boolean {
  const key = makeKey('aliases', domain);
  const entry = store.get(key) as CacheEntry<Alias[]> | undefined;
  if (!entry || Date.now() > entry.expires) return false;
  const list = entry.data;
  if (!Array.isArray(list)) return false;
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

/** Invalidate all caches. */
export function invalidateAll(): void {
  store.clear();
}
