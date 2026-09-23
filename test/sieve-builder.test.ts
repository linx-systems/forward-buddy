import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSieveScript } from '../src/lib/sieve-builder.js';
import type { FilterRule } from '../src/lib/sieve-builder.js';

/* ====== Single condition with each operator ====== */
describe('buildSieveScript - single condition operators', () => {
  it('generates :contains test', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'from', operator: 'contains', value: 'newsletter' }],
      conditionLogic: 'allof',
      action: 'discard',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('header :contains "from" "newsletter"'));
    assert.ok(result.includes('discard;'));
  });

  it('generates :is test', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'from', operator: 'is', value: 'spam@junk.com' }],
      conditionLogic: 'allof',
      action: 'discard',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('header :is "from" "spam@junk.com"'));
  });

  it('generates :matches test', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'subject', operator: 'matches', value: '*sale*' }],
      conditionLogic: 'allof',
      action: 'discard',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('header :matches "subject" "*sale*"'));
  });

  it('generates :regex test with require', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'from', operator: 'regex', value: '.*@spam\\.com' }],
      conditionLogic: 'allof',
      action: 'discard',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('require "regex";'));
    assert.ok(result.includes('header :regex "from"'));
  });
});

/* ====== Multiple conditions with allof/anyof ====== */
describe('buildSieveScript - multiple conditions', () => {
  it('wraps multiple conditions with allof', () => {
    const rule: FilterRule = {
      conditions: [
        { header: 'from', operator: 'contains', value: 'bob' },
        { header: 'subject', operator: 'contains', value: 'urgent' },
      ],
      conditionLogic: 'allof',
      action: 'flag',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('allof ('));
    assert.ok(result.includes('header :contains "from" "bob"'));
    assert.ok(result.includes('header :contains "subject" "urgent"'));
  });

  it('wraps multiple conditions with anyof', () => {
    const rule: FilterRule = {
      conditions: [
        { header: 'from', operator: 'is', value: 'a@x.com' },
        { header: 'from', operator: 'is', value: 'b@x.com' },
      ],
      conditionLogic: 'anyof',
      action: 'discard',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('anyof ('));
  });
});

/* ====== Action types ====== */
describe('buildSieveScript - actions', () => {
  it('generates fileinto with require', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'subject', operator: 'contains', value: 'newsletter' }],
      conditionLogic: 'allof',
      action: 'fileinto',
      actionValue: 'Newsletters',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('require "fileinto";'));
    assert.ok(result.includes('fileinto "Newsletters";'));
  });

  it('generates reject action', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'from', operator: 'is', value: 'spammer@evil.com' }],
      conditionLogic: 'allof',
      action: 'reject',
      actionValue: 'Unwanted mail',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('reject "Unwanted mail";'));
  });

  it('generates flag action with imap4flags require', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'from', operator: 'contains', value: 'boss' }],
      conditionLogic: 'allof',
      action: 'flag',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('require "imap4flags";'));
    assert.ok(result.includes('addflag'));
  });

  it('generates redirect action', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'to', operator: 'contains', value: 'support' }],
      conditionLogic: 'allof',
      action: 'redirect',
      actionValue: 'team@company.com',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('redirect "team@company.com";'));
  });

  it('generates discard action', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'from', operator: 'is', value: 'junk@spam.com' }],
      conditionLogic: 'allof',
      action: 'discard',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('discard;'));
    // No require needed for discard
    assert.ok(!result.includes('require'));
  });
});

/* ====== String escaping ====== */
describe('buildSieveScript - string escaping', () => {
  it('escapes double quotes in values', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'subject', operator: 'contains', value: 'say "hello"' }],
      conditionLogic: 'allof',
      action: 'discard',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('say \\"hello\\"'));
  });

  it('escapes backslashes in values', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'from', operator: 'contains', value: 'path\\name' }],
      conditionLogic: 'allof',
      action: 'discard',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('path\\\\name'));
  });
});

/* ====== Combined requires ====== */
describe('buildSieveScript - combined requires', () => {
  it('generates both fileinto and regex requires', () => {
    const rule: FilterRule = {
      conditions: [{ header: 'from', operator: 'regex', value: '.*@news\\.com' }],
      conditionLogic: 'allof',
      action: 'fileinto',
      actionValue: 'News',
    };
    const result = buildSieveScript(rule);
    assert.ok(result.includes('require "fileinto";'));
    assert.ok(result.includes('require "regex";'));
  });
});
