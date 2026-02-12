import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import {
  getAliasType,
  formatEmail,
  truncateRecipients,
  formatDate,
  friendlyError,
  splitLines,
  splitCommas,
  resolveDomain,
} from '../lib/utils.js';

/* ====== getAliasType ====== */
describe('getAliasType', () => {
  it('returns catchall for "*"', () => {
    const result = getAliasType('*');
    assert.equal(result.type, 'catchall');
    assert.ok(result.label.includes('Catch-all'));
    assert.equal(result.color, '#f59e0b');
  });

  it('returns regex for "/pattern/"', () => {
    const result = getAliasType('/^test.*/');
    assert.equal(result.type, 'regex');
    assert.equal(result.label, 'Regex');
    assert.equal(result.color, '#8b5cf6');
  });

  it('returns regex for "/pattern/i"', () => {
    const result = getAliasType('/^test.*/i');
    assert.equal(result.type, 'regex');
  });

  it('returns direct for normal names', () => {
    const result = getAliasType('hello');
    assert.equal(result.type, 'direct');
    assert.equal(result.label, 'Direct');
    assert.equal(result.color, '#10b981');
  });

  it('returns direct for empty string', () => {
    const result = getAliasType('');
    assert.equal(result.type, 'direct');
  });
});

/* ====== formatEmail ====== */
describe('formatEmail', () => {
  it('combines name and domain', () => {
    assert.equal(formatEmail('user', 'example.com'), 'user@example.com');
  });

  it('handles catch-all', () => {
    assert.equal(formatEmail('*', 'example.com'), '*@example.com');
  });
});

/* ====== truncateRecipients ====== */
describe('truncateRecipients', () => {
  it('returns all recipients when under max', () => {
    const result = truncateRecipients(['a@x.com', 'b@x.com']);
    assert.deepEqual(result.visible, ['a@x.com', 'b@x.com']);
    assert.equal(result.extra, 0);
  });

  it('truncates when over max', () => {
    const result = truncateRecipients(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'], 2);
    assert.deepEqual(result.visible, ['a@x.com', 'b@x.com']);
    assert.equal(result.extra, 2);
  });

  it('handles non-array input', () => {
    const result = truncateRecipients(null as any);
    assert.deepEqual(result.visible, []);
    assert.equal(result.extra, 0);
  });

  it('handles empty array', () => {
    const result = truncateRecipients([]);
    assert.deepEqual(result.visible, []);
    assert.equal(result.extra, 0);
  });

  it('respects custom max', () => {
    const result = truncateRecipients(['a', 'b', 'c'], 1);
    assert.deepEqual(result.visible, ['a']);
    assert.equal(result.extra, 2);
  });
});

/* ====== formatDate ====== */
describe('formatDate', () => {
  it('returns empty string for falsy input', () => {
    assert.equal(formatDate(''), '');
    assert.equal(formatDate(null as any), '');
    assert.equal(formatDate(undefined as any), '');
  });

  it('returns formatted date for valid ISO string', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
    // Should contain "2024" and "Jan" or locale equivalent
    assert.ok(result.includes('2024'));
  });
});

/* ====== friendlyError ====== */
describe('friendlyError', () => {
  beforeEach(() => {
    (globalThis as any).browser.i18n._clearMessages();
    (globalThis as any).browser.i18n._setMessages({
      errorInvalidToken: 'Invalid token',
      errorRateLimited: 'Rate limited',
      errorNotFound: 'Not found',
      errorNetwork: 'Network error',
      errorUnknown: 'Unknown error',
    });
    (globalThis as any).navigator.onLine = true;
  });

  it('returns invalid token message for 401', () => {
    assert.equal(friendlyError({ status: 401 }), 'Invalid token');
  });

  it('returns rate limited message for 429', () => {
    assert.equal(friendlyError({ status: 429 }), 'Rate limited');
  });

  it('returns not found message for 404', () => {
    assert.equal(friendlyError({ status: 404 }), 'Not found');
  });

  it('returns network error when offline', () => {
    (globalThis as any).navigator.onLine = false;
    assert.equal(friendlyError({ status: 500 }), 'Network error');
  });

  it('returns error message when available', () => {
    assert.equal(friendlyError({ message: 'Custom error', status: 500 }), 'Custom error');
  });

  it('returns unknown error as fallback', () => {
    assert.equal(friendlyError({ status: 500 }), 'Unknown error');
  });
});

/* ====== splitLines ====== */
describe('splitLines', () => {
  it('splits newline-separated string', () => {
    assert.deepEqual(splitLines('a@x.com\nb@x.com'), ['a@x.com', 'b@x.com']);
  });

  it('trims whitespace', () => {
    assert.deepEqual(splitLines('  a@x.com \n  b@x.com  '), ['a@x.com', 'b@x.com']);
  });

  it('filters empty lines', () => {
    assert.deepEqual(splitLines('a@x.com\n\n\nb@x.com\n'), ['a@x.com', 'b@x.com']);
  });

  it('handles empty/null input', () => {
    assert.deepEqual(splitLines(''), []);
    assert.deepEqual(splitLines(null as any), []);
    assert.deepEqual(splitLines(undefined as any), []);
  });
});

/* ====== splitCommas ====== */
describe('splitCommas', () => {
  it('splits comma-separated string', () => {
    assert.deepEqual(splitCommas('tag1, tag2, tag3'), ['tag1', 'tag2', 'tag3']);
  });

  it('trims whitespace', () => {
    assert.deepEqual(splitCommas(' a , b , c '), ['a', 'b', 'c']);
  });

  it('filters empty segments', () => {
    assert.deepEqual(splitCommas('a,,b,'), ['a', 'b']);
  });

  it('handles empty/null input', () => {
    assert.deepEqual(splitCommas(''), []);
    assert.deepEqual(splitCommas(null as any), []);
  });
});

/* ====== resolveDomain ====== */
describe('resolveDomain', () => {
  it('returns domain.name from alias object', () => {
    assert.equal(resolveDomain({ domain: { name: 'example.com' } } as any, 'fallback.com'), 'example.com');
  });

  it('returns string domain from alias object', () => {
    assert.equal(resolveDomain({ domain: 'example.com' } as any, 'fallback.com'), 'example.com');
  });

  it('returns fallback when alias has no domain', () => {
    assert.equal(resolveDomain({} as any, 'fallback.com'), 'fallback.com');
  });

  it('returns fallback when alias is null', () => {
    assert.equal(resolveDomain(null as any, 'fallback.com'), 'fallback.com');
  });

  it('returns empty string when no fallback', () => {
    assert.equal(resolveDomain(null as any), '');
  });
});
