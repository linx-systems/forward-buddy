/**
 * Utility helpers: alias type detection, formatting.
 */

/**
 * Detect alias type from the name field.
 * - "*" → catch-all
 * - "/pattern/" or "/pattern/i" → regex
 * - everything else → direct
 */
export function getAliasType(name) {
  if (name === '*') {
    return { type: 'catchall', label: 'Catch-all \u2731', color: '#f59e0b' };
  }
  if (/^\/.*\/$|^\/.*\/i$/.test(name)) {
    return { type: 'regex', label: 'Regex', color: '#8b5cf6' };
  }
  return { type: 'direct', label: 'Direct', color: '#10b981' };
}

/**
 * Format a full email address from alias name + domain.
 */
export function formatEmail(name, domain) {
  return `${name}@${domain}`;
}

/**
 * Truncate a recipient list for display.
 * Returns { visible: string[], extra: number }.
 */
export function truncateRecipients(recipients, max = 2) {
  if (!Array.isArray(recipients)) return { visible: [], extra: 0 };
  return {
    visible: recipients.slice(0, max),
    extra: Math.max(0, recipients.length - max),
  };
}

/**
 * Format a date string for display.
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Return a user-friendly error message from an API error.
 */
export function friendlyError(err) {
  if (err.status === 401) return browser.i18n.getMessage('errorInvalidToken');
  if (err.status === 429) return browser.i18n.getMessage('errorRateLimited');
  if (err.status === 404) return browser.i18n.getMessage('errorNotFound');
  if (!navigator.onLine) return browser.i18n.getMessage('errorNetwork');
  return err.message || browser.i18n.getMessage('errorUnknown');
}

/**
 * Split a newline-separated string into a trimmed, non-empty array.
 * Used for recipient lists.
 */
export function splitLines(str) {
  return (str || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * Split a comma-separated string into a trimmed, non-empty array.
 * Used for label lists.
 */
export function splitCommas(str) {
  return (str || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Resolve the domain name from an alias object or fallback.
 */
export function resolveDomain(alias, fallback) {
  return alias?.domain?.name || alias?.domain || fallback || '';
}
