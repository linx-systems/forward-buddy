/**
 * Utility helpers: alias type detection, formatting.
 */

import type { Alias, AliasTypeInfo, TruncateResult } from '../types/forward-email.js';

const REGEX_ALIAS_PATTERN = /^\/(.+)\/([ig]{0,2})$/;
const MAX_REGEX_SOURCE_LENGTH = 200;

function parseAliasRegex(name: string): { source: string; flags: string } | null {
  const match = name.match(REGEX_ALIAS_PATTERN);
  if (!match) return null;

  const source = match[1];
  if (source.length > MAX_REGEX_SOURCE_LENGTH) return null;

  const flags = match[2] || '';
  if (new Set(flags).size !== flags.length) return null;

  return { source, flags };
}

/**
 * Detect alias type from the name field.
 * - "*" -> catch-all
 * - "/pattern/" or "/pattern/gi" -> regex
 * - everything else -> direct
 */
export function getAliasType(name: string): AliasTypeInfo {
  if (name === '*') {
    return { type: 'catchall', label: 'Catch-all \u2731', color: '#f59e0b', canDisable: true };
  }
  if (parseAliasRegex(name)) {
    return { type: 'regex', label: 'Regex', color: '#8b5cf6', canDisable: true };
  }
  return { type: 'direct', label: 'Direct', color: '#10b981', canDisable: true };
}

/**
 * Return match priority for an alias: lower = higher priority.
 * Direct (0) > Regex (1) > Catch-all (2).
 */
export function aliasPriority(name: string): number {
  if (name === '*') return 2;
  if (parseAliasRegex(name)) return 1;
  return 0;
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
  if (typeof domain === 'string' && domain.includes('.')) return domain;
  return fallback || '';
}

/**
 * Parse an email address string into local part and domain.
 * Handles formats: "user@domain", "<user@domain>", "Display Name <user@domain>"
 */
export function parseEmailAddress(email: string): { local: string; domain: string } | null {
  const match = email.match(/<([^@]+)@([^>]+)>/);
  if (match) return { local: match[1].toLowerCase(), domain: match[2].toLowerCase() };
  const simple = email.match(/^([^@\s]+)@([^\s]+)$/);
  if (simple) return { local: simple[1].toLowerCase(), domain: simple[2].toLowerCase() };
  return null;
}

/**
 * Check if an email's local part matches an alias on the same domain.
 * Handles direct, catch-all, and regex alias types.
 */
export function matchesAlias(localPart: string, domain: string, alias: Alias, fallbackDomain?: string): boolean {
  const aliasDomain = resolveDomain(alias, fallbackDomain);
  if (aliasDomain.toLowerCase() !== domain.toLowerCase()) return false;
  if (alias.name === '*') return true;
  const regexMatch = parseAliasRegex(alias.name);
  if (regexMatch) {
    try {
      const re = new RegExp(regexMatch.source, regexMatch.flags || undefined);
      // Quick sanity check with empty string to detect catastrophic backtracking patterns
      re.test('');
      return re.test(localPart);
    } catch {
      return false;
    }
  }
  return alias.name.toLowerCase() === localPart.toLowerCase();
}
