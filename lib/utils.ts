/**
 * Utility helpers: alias type detection, formatting.
 */

import type { AliasTypeInfo, TruncateResult } from '../types/forward-email.js';

/**
 * Detect alias type from the name field.
 * - "*" -> catch-all
 * - "/pattern/" or "/pattern/i" -> regex
 * - everything else -> direct
 */
export function getAliasType(name: string): AliasTypeInfo {
  if (name === '*') {
    return { type: 'catchall', label: 'Catch-all \u2731', color: '#f59e0b', canDisable: false };
  }
  if (/^\/.*\/$|^\/.*\/i$/.test(name)) {
    return { type: 'regex', label: 'Regex', color: '#8b5cf6', canDisable: false };
  }
  return { type: 'direct', label: 'Direct', color: '#10b981', canDisable: true };
}

/**
 * Format a full email address from alias name + domain.
 */
export function formatEmail(name: string, domain: string): string {
  return `${name}@${domain}`;
}

/**
 * Truncate a recipient list for display.
 * Returns { visible: string[], extra: number }.
 */
export function truncateRecipients(recipients: string[] | null | undefined, max: number = 2): TruncateResult {
  if (!Array.isArray(recipients)) return { visible: [], extra: 0 };
  return {
    visible: recipients.slice(0, max),
    extra: Math.max(0, recipients.length - max),
  };
}

/**
 * Format a date string for display.
 */
export function formatDate(dateStr: string | null | undefined): string {
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
export function friendlyError(err: { status?: number; message?: string }): string {
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
export function splitLines(str: string | null | undefined): string[] {
  return (str || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * Split a comma-separated string into a trimmed, non-empty array.
 * Used for label lists.
 */
export function splitCommas(str: string | null | undefined): string[] {
  return (str || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Resolve the domain name from an alias object or fallback.
 */
export function resolveDomain(alias: { domain?: string | { name: string } } | null | undefined, fallback?: string): string {
  const domain = alias?.domain;
  if (typeof domain === 'object' && domain !== null) return domain.name;
  if (typeof domain === 'string') return domain;
  return fallback || '';
}
