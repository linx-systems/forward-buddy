import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import { clearAuditEvents, getAuditEvents, recordAuditEvent } from '../src/lib/audit.js';

beforeEach(async () => {
  await browser.storage.local.remove('auditEvents');
  await clearAuditEvents();
});

describe('audit event storage', () => {
  it('keeps the newest bounded history in persisted storage', async () => {
    for (let index = 0; index < 201; index += 1) {
      await recordAuditEvent('alias_updated', 'success', `domain/example.test/alias/${index}`);
    }

    const events = await getAuditEvents();

    assert.equal(events.length, 200);
    assert.equal(events[0].target, 'domain/example.test/alias/1');
    assert.equal(events[events.length - 1].target, 'domain/example.test/alias/200');
  });

  it('records only stable error metadata for failures', async () => {
    await recordAuditEvent(
      'password_generated',
      'failure',
      'domain/example.test/alias/1',
      Object.assign(new Error('raw provider response'), { status: 429 }),
    );

    const [event] = await getAuditEvents();

    assert.equal(event.errorCategory, 'rate_limited');
    assert.equal(event.statusCode, 429);
    assert.equal(JSON.stringify(event).includes('raw provider response'), false);
  });
});
