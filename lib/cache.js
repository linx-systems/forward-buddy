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

/**
 * Update a single alias in the cache by id.
 * Returns true if the cache was updated, false if alias not found in cache.
 */
export function updateCachedAlias(domain, id, updatedAlias) {
  const key = makeKey('aliases', domain);
  const entry = store.get(key);
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
export function removeCachedAlias(domain, id) {
  const key = makeKey('aliases', domain);
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expires) return false;
  const list = entry.data;
  if (!Array.isArray(list)) return false;
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

/** Invalidate all caches. */
export function invalidateAll() {
  store.clear();
}
