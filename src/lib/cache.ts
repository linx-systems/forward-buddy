/**
 * Simple TTL cache.
 * Domain list: 5 min TTL. Alias list per domain: 2 min TTL.
 */

import type { Alias, Domain, SieveScript } from '../types/forward-email.js';

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const DOMAIN_TTL = 5 * 60 * 1000;
const ALIAS_TTL = 2 * 60 * 1000;

const store = new Map<string, CacheEntry<unknown>>();
const revisions = new Map<string, number>();

function makeKey(...parts: string[]): string {
  return parts.join(':');
}

function revision(key: string): number {
  return revisions.get(key) ?? 0;
}

function advanceRevision(key: string): number {
  const next = revision(key) + 1;
  revisions.set(key, next);
  return next;
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

export function getAliasesRevision(domain: string): number {
  return revision(makeKey('aliases', domain));
}

export function setCachedAliasesIfCurrent(domain: string, data: Alias[], expectedRevision: number): boolean {
  const key = makeKey('aliases', domain);
  if (revision(key) !== expectedRevision) return false;
  setCachedAliases(domain, data);
  return true;
}

/** Invalidate alias cache for a domain (after create/update/delete). */
export function invalidateAliases(domain: string): void {
  const key = makeKey('aliases', domain);
  advanceRevision(key);
  invalidate(key);
}

/**
 * Update a single alias in the cache by id.
 * Returns true if the cache was updated, false if alias not found in cache.
 */
export function updateCachedAlias(domain: string, id: string, updatedAlias: Alias): boolean {
  const key = makeKey('aliases', domain);
  advanceRevision(key);
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
  advanceRevision(key);
  const entry = store.get(key) as CacheEntry<Alias[]> | undefined;
  if (!entry || Date.now() > entry.expires) return false;
  const list = entry.data;
  if (!Array.isArray(list)) return false;
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

/* ---- Sieve script cache ---- */

export function getCachedSieveScripts(domain: string, aliasId: string): SieveScript[] | null {
  return get<SieveScript[]>(makeKey('sieve', domain, aliasId));
}

export function setCachedSieveScripts(domain: string, aliasId: string, data: SieveScript[]): void {
  set(makeKey('sieve', domain, aliasId), data, ALIAS_TTL);
}

export function getSieveScriptsRevision(domain: string, aliasId: string): number {
  return revision(makeKey('sieve', domain, aliasId));
}

export function setCachedSieveScriptsIfCurrent(
  domain: string,
  aliasId: string,
  data: SieveScript[],
  expectedRevision: number,
): boolean {
  const key = makeKey('sieve', domain, aliasId);
  if (revision(key) !== expectedRevision) return false;
  setCachedSieveScripts(domain, aliasId, data);
  return true;
}

export function invalidateSieveScripts(domain: string, aliasId: string): void {
  const key = makeKey('sieve', domain, aliasId);
  advanceRevision(key);
  invalidate(key);
}

/** Invalidate all caches. */
export function invalidateAll(): void {
  for (const key of store.keys()) {
    advanceRevision(key);
  }
  store.clear();
}
