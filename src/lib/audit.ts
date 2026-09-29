import type { AuditAction, AuditErrorCategory, AuditEvent, AuditStatus } from '../types/forward-email.js';

const AUDIT_EVENTS_KEY = 'auditEvents';
const MAX_AUDIT_EVENTS = 200;
let sequence = 0;
let writes = Promise.resolve();

function errorDetails(error: unknown): Pick<AuditEvent, 'statusCode' | 'errorCategory'> {
  const status = typeof error === 'object' && error !== null && 'status' in error
    && typeof error.status === 'number'
    ? error.status
    : undefined;
  let errorCategory: AuditErrorCategory | undefined;
  if (status === 0) errorCategory = 'network';
  else if (status === 401 || status === 403) errorCategory = 'authentication';
  else if (status === 429) errorCategory = 'rate_limited';
  else if (status !== undefined && status >= 500) errorCategory = 'server';
  else if (status !== undefined) errorCategory = 'request';
  return { ...(status === undefined ? {} : { statusCode: status }), ...(errorCategory ? { errorCategory } : {}) };
}

function auditId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  sequence += 1;
  return `${Date.now()}-${sequence}`;
}

function isAuditAction(value: unknown): value is AuditAction {
  return value === 'credentials_saved'
    || value === 'credentials_removed'
    || value === 'alias_created'
    || value === 'alias_updated'
    || value === 'alias_deleted'
    || value === 'password_generated'
    || value === 'sieve_created'
    || value === 'sieve_updated'
    || value === 'sieve_deleted'
    || value === 'sieve_activated';
}

function isAuditErrorCategory(value: unknown): value is AuditErrorCategory {
  return value === 'authentication'
    || value === 'network'
    || value === 'rate_limited'
    || value === 'request'
    || value === 'server';
}

function parseAuditEvent(value: unknown): AuditEvent | null {
  if (typeof value !== 'object' || value === null
    || !('id' in value)
    || !('timestamp' in value)
    || !('action' in value)
    || !('status' in value)
    || !('target' in value)
    || typeof value.id !== 'string'
    || typeof value.timestamp !== 'string'
    || !isAuditAction(value.action)
    || (value.status !== 'success' && value.status !== 'failure')
    || typeof value.target !== 'string') {
    return null;
  }
  const event: AuditEvent = {
    id: value.id,
    timestamp: value.timestamp,
    action: value.action,
    status: value.status,
    target: value.target,
  };
  if ('statusCode' in value && typeof value.statusCode === 'number') {
    event.statusCode = value.statusCode;
  }
  if ('errorCategory' in value && isAuditErrorCategory(value.errorCategory)) {
    event.errorCategory = value.errorCategory;
  }
  return event;
}

export async function getAuditEvents(): Promise<AuditEvent[]> {
  const { auditEvents } = await browser.storage.local.get(AUDIT_EVENTS_KEY);
  if (!Array.isArray(auditEvents)) return [];
  const events = auditEvents.map(parseAuditEvent).filter((event): event is AuditEvent => event !== null);
  return events.slice(-MAX_AUDIT_EVENTS);
}

export function recordAuditEvent(
  action: AuditAction,
  status: AuditStatus,
  target: string,
  error?: unknown,
): Promise<void> {
  const event: AuditEvent = {
    id: auditId(),
    timestamp: new Date().toISOString(),
    action,
    status,
    target,
    ...(status === 'failure' ? errorDetails(error) : {}),
  };
  writes = writes.catch(() => {}).then(async () => {
    const existing = await getAuditEvents();
    await browser.storage.local.set({ auditEvents: [...existing, event].slice(-MAX_AUDIT_EVENTS) });
  });
  return writes;
}

export function clearAuditEvents(): Promise<void> {
  writes = writes.catch(() => {}).then(() => browser.storage.local.remove(AUDIT_EVENTS_KEY));
  return writes;
}
