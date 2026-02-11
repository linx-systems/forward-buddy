/**
 * Simple TTL cache.
 * Domain list: 5 min TTL. Alias list per domain: 2 min TTL.
 */

const DOMAIN_TTL = 5 * 60 * 1000;
const ALIAS_TTL = 2 * 60 * 1000;

const store = new Map();

function makeKey(...parts) {
  return parts.join(':');
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

function set(key, data, ttl) {
  store.set(key, { data, expires: Date.now() + ttl });
}

function invalidate(key) {
  store.delete(key);
}

function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/* ---- Public API ---- */

export function getCachedDomains() {
  return get('domains');
}

export function setCachedDomains(data) {
  set('domains', data, DOMAIN_TTL);
}

export function getCachedAliases(domain) {
  return get(makeKey('aliases', domain));
}

export function setCachedAliases(domain, data) {
  set(makeKey('aliases', domain), data, ALIAS_TTL);
}

/** Invalidate alias cache for a domain (after create/update/delete). */
export function invalidateAliases(domain) {
  invalidate(makeKey('aliases', domain));
}

/** Invalidate all caches. */
export function invalidateAll() {
  store.clear();
}
