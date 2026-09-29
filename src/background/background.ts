/**
 * Background script — handles messages from popup/options,
 * dispatches API calls, manages cache.
 */

import * as api from '../lib/api.js';
import * as audit from '../lib/audit.js';
import * as cache from '../lib/cache.js';
import { aliasPriority, parseEmailAddress } from '../lib/utils.js';
import { matchesAliasSafely } from '../lib/safe-regex.js';
import type { Alias, AliasMatch, AliasMatchResult, AuditAction, SieveScript } from '../types/forward-email.js';
import type { MessageType } from '../types/messages.js';
import { DEMO_DOMAINS, DEMO_ALIASES, DEMO_SIEVE_SCRIPTS } from '../lib/demo-data.js';

const demoHandlers: Record<string, (msg: any) => Promise<unknown>> = {
  async testConnection() {
    return { email: 'john@example.com', plan: 'Enhanced Protection' };
  },
  async getDomains() { return DEMO_DOMAINS; },
  async getAliases({ domain }: { domain: string }) {
    return DEMO_ALIASES[domain] ?? [];
  },
  async createAlias({ domain, data }: { domain: string; data: Record<string, unknown> }) {
    const alias: Alias = {
      id: `demo-${Date.now()}`, name: data.name as string,
      recipients: data.recipients as string[], description: (data.description as string) ?? '',
      labels: [], is_enabled: true, has_imap: false, has_pgp: false,
      has_recipient_verification: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    (DEMO_ALIASES[domain] ??= []).push(alias);
    return alias;
  },
  async updateAlias({ domain, id, data }: { domain: string; id: string; data: Record<string, unknown> }) {
    const aliases = DEMO_ALIASES[domain] ?? [];
    const alias = aliases.find((a) => a.id === id);
    if (!alias) throw new Error('Alias not found');
    const safeData = Object.fromEntries(
      Object.entries(data).filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k)),
    );
    Object.assign(alias, safeData, { updated_at: new Date().toISOString() });
    return alias;
  },
  async deleteAlias({ domain, id }: { domain: string; id: string }) {
    const aliases = DEMO_ALIASES[domain];
    if (aliases) DEMO_ALIASES[domain] = aliases.filter((a) => a.id !== id);
    return { ok: true };
  },
  async generatePassword() {
    return { generated_password: 'demo-p4ssw0rd-x7k9m2' };
  },
  async matchAliases() { return { matches: [], failedDomains: [] }; },
  async getSieveScripts({ domain, aliasId }: { domain: string; aliasId: string }) {
    return DEMO_SIEVE_SCRIPTS[`${domain}:${aliasId}`] ?? [];
  },
  async getSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const scripts = DEMO_SIEVE_SCRIPTS[`${domain}:${aliasId}`] ?? [];
    const script = scripts.find((s) => s.id === scriptId);
    if (!script) throw new Error('Script not found');
    return script;
  },
  async createSieveScript({ domain, aliasId, data }: { domain: string; aliasId: string; data: Partial<SieveScript> }) {
    const script: SieveScript = {
      id: `sieve-${Date.now()}`, name: (data.name as string) || 'Untitled',
      content: (data.content as string) || '', description: (data.description as string) ?? '',
      is_active: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const key = `${domain}:${aliasId}`;
    (DEMO_SIEVE_SCRIPTS[key] ??= []).push(script);
    return script;
  },
  async updateSieveScript({ domain, aliasId, scriptId, data }: { domain: string; aliasId: string; scriptId: string; data: Partial<SieveScript> }) {
    const scripts = DEMO_SIEVE_SCRIPTS[`${domain}:${aliasId}`] ?? [];
    const script = scripts.find((s) => s.id === scriptId);
    if (!script) throw new Error('Script not found');
    const safeData = Object.fromEntries(
      Object.entries(data).filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k)),
    );
    Object.assign(script, safeData, { updated_at: new Date().toISOString() });
    return script;
  },
  async deleteSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const key = `${domain}:${aliasId}`;
    const scripts = DEMO_SIEVE_SCRIPTS[key];
    if (scripts) DEMO_SIEVE_SCRIPTS[key] = scripts.filter((s) => s.id !== scriptId);
    return { ok: true };
  },
  async activateSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const scripts = DEMO_SIEVE_SCRIPTS[`${domain}:${aliasId}`] ?? [];
    for (const s of scripts) s.is_active = s.id === scriptId;
    const script = scripts.find((s) => s.id === scriptId);
    if (!script) throw new Error('Script not found');
    return script;
  },
};

interface ActiveAuth {
  token: string;
  generation: number;
}

async function getToken(): Promise<string> {
  const { apiToken } = await browser.storage.local.get('apiToken');
  if (!apiToken) throw new Error('No API token configured');
  return apiToken as string;
}

let currentToken: string | null = null;
let authGeneration = 0;

function resetAccountCaches(): void {
  currentToken = null;
  authGeneration += 1;
  cache.invalidateAll();
}

async function getActiveAuth(): Promise<ActiveAuth> {
  const token = await getToken();
  if (currentToken !== token) {
    currentToken = token;
    authGeneration += 1;
    cache.invalidateAll();
  }
  return { token, generation: authGeneration };
}

function isCurrentAuth(auth: ActiveAuth): boolean {
  return currentToken === auth.token && authGeneration === auth.generation;
}

function aliasTarget(domain: string, id: string): string {
  return `domain/${domain}/alias/${id}`;
}

function sieveTarget(domain: string, aliasId: string, scriptId?: string): string {
  const base = `${aliasTarget(domain, aliasId)}/sieve`;
  return scriptId ? `${base}/${scriptId}` : base;
}

const handlers: Record<string, (msg: any) => Promise<unknown>> = {
  async testConnection({ token }: { token: string }) {
    return api.getAccount(token);
  },

  async getDomains() {
    const auth = await getActiveAuth();
    const cached = cache.getCachedDomains();
    if (cached) return cached;
    const data = await api.getDomains(auth.token);
    if (isCurrentAuth(auth)) cache.setCachedDomains(data);
    return data;
  },

  async getAliases({ domain }: { domain: string }) {
    const auth = await getActiveAuth();
    const cached = cache.getCachedAliases(domain);
    if (cached) return cached;
    const revision = cache.getAliasesRevision(domain);
    const data = await api.getAliases(auth.token, domain);
    if (isCurrentAuth(auth)) cache.setCachedAliasesIfCurrent(domain, data, revision);
    return data;
  },

  async createAlias({ domain, data }: { domain: string; data: Record<string, unknown> }) {
    const auth = await getActiveAuth();
    const result = await api.createAlias(auth.token, domain, data);
    if (isCurrentAuth(auth)) cache.invalidateAliases(domain);
    return result;
  },

  async updateAlias({ domain, id, data }: { domain: string; id: string; data: Record<string, unknown> }) {
    const auth = await getActiveAuth();
    const result = await api.updateAlias(auth.token, domain, id, data);
    if (!isCurrentAuth(auth)) return result;
    if (!cache.updateCachedAlias(domain, id, result)) {
      const revision = cache.getAliasesRevision(domain);
      try {
        const fresh = await api.getAliases(auth.token, domain);
        if (isCurrentAuth(auth)) cache.setCachedAliasesIfCurrent(domain, fresh, revision);
      } catch {
        if (isCurrentAuth(auth)) cache.invalidateAliases(domain);
      }
    }
    return result;
  },

  async deleteAlias({ domain, id }: { domain: string; id: string }) {
    const auth = await getActiveAuth();
    await api.deleteAlias(auth.token, domain, id);
    if (isCurrentAuth(auth) && !cache.removeCachedAlias(domain, id)) {
      cache.invalidateAliases(domain);
    }
    return { ok: true };
  },

  async generatePassword({ domain, id }: { domain: string; id: string }) {
    const auth = await getActiveAuth();
    return api.generatePassword(auth.token, domain, id);
  },

  async getSieveScripts({ domain, aliasId }: { domain: string; aliasId: string }) {
    const auth = await getActiveAuth();
    const cached = cache.getCachedSieveScripts(domain, aliasId);
    if (cached) return cached;
    const revision = cache.getSieveScriptsRevision(domain, aliasId);
    const data = await api.getSieveScripts(auth.token, domain, aliasId);
    if (isCurrentAuth(auth)) cache.setCachedSieveScriptsIfCurrent(domain, aliasId, data, revision);
    return data;
  },

  async getSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const auth = await getActiveAuth();
    return api.getSieveScript(auth.token, domain, aliasId, scriptId);
  },

  async createSieveScript({ domain, aliasId, data }: { domain: string; aliasId: string; data: Partial<SieveScript> }) {
    const auth = await getActiveAuth();
    const result = await api.createSieveScript(auth.token, domain, aliasId, data);
    if (isCurrentAuth(auth)) cache.invalidateSieveScripts(domain, aliasId);
    return result;
  },

  async updateSieveScript({ domain, aliasId, scriptId, data }: { domain: string; aliasId: string; scriptId: string; data: Partial<SieveScript> }) {
    const auth = await getActiveAuth();
    const result = await api.updateSieveScript(auth.token, domain, aliasId, scriptId, data);
    if (isCurrentAuth(auth)) cache.invalidateSieveScripts(domain, aliasId);
    return result;
  },

  async deleteSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const auth = await getActiveAuth();
    await api.deleteSieveScript(auth.token, domain, aliasId, scriptId);
    if (isCurrentAuth(auth)) cache.invalidateSieveScripts(domain, aliasId);
    return { ok: true };
  },

  async activateSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const auth = await getActiveAuth();
    const result = await api.activateSieveScript(auth.token, domain, aliasId, scriptId);
    if (isCurrentAuth(auth)) cache.invalidateSieveScripts(domain, aliasId);
    return result;
  },

  async matchAliases({ addresses }: { addresses: string[] }): Promise<AliasMatchResult> {
    const auth = await getActiveAuth();
    let domains = cache.getCachedDomains();
    if (!domains) {
      domains = await api.getDomains(auth.token);
      if (isCurrentAuth(auth)) cache.setCachedDomains(domains);
    }

    const ownedDomains = new Set(domains.map((domain) => domain.name.toLowerCase()));
    const matches: AliasMatch[] = [];
    const parsedAddresses = addresses
      .map((address) => ({ address, parsed: parseEmailAddress(address) }))
      .filter((entry): entry is { address: string; parsed: { local: string; domain: string } } =>
        entry.parsed !== null && ownedDomains.has(entry.parsed.domain));
    const relevantDomains = [...new Set(parsedAddresses.map((entry) => entry.parsed.domain))];
    const aliasesByDomain = new Map<string, Alias[]>();
    const failedDomains: string[] = [];

    for (const domainName of relevantDomains) {
      try {
        let aliases = cache.getCachedAliases(domainName);
        if (!aliases) {
          const revision = cache.getAliasesRevision(domainName);
          aliases = await api.getAliases(auth.token, domainName);
          if (isCurrentAuth(auth)) cache.setCachedAliasesIfCurrent(domainName, aliases, revision);
        }
        aliasesByDomain.set(domainName, aliases);
      } catch {
        failedDomains.push(domainName);
      }
    }

    for (const { address, parsed } of parsedAddresses) {
      const aliases = aliasesByDomain.get(parsed.domain);
      if (!aliases) continue;
      const sorted = [...aliases].sort((a, b) => aliasPriority(a.name) - aliasPriority(b.name));
      for (const alias of sorted) {
        if (await matchesAliasSafely(parsed.local, parsed.domain, alias, parsed.domain)) {
          matches.push({ address, alias, domain: parsed.domain });
          break;
        }
      }
    }

    return { matches, failedDomains };
  },
};
// Update badge when a message is displayed
const badgeRequestIds = new Map<number, number>();

browser.messageDisplay.onMessagesDisplayed.addListener(
  async (tab: browser.tabs.Tab, rawMessages: any) => {
    const tabId = tab.id;
    const requestId = (badgeRequestIds.get(tabId) ?? 0) + 1;
    badgeRequestIds.set(tabId, requestId);

    try {
      const messages: any[] = Array.isArray(rawMessages) ? rawMessages : rawMessages?.messages ?? [];
      const addresses: string[] = [];
      for (const msg of messages) {
        if (msg.recipients) addresses.push(...msg.recipients);
        if (msg.ccList) addresses.push(...msg.ccList);
        if (msg.bccList) addresses.push(...msg.bccList);
      }

      if (addresses.length === 0) {
        await browser.messageDisplayAction.setBadgeText({ text: null, tabId });
        await browser.messageDisplayAction.setTitle({ title: null, tabId });
        return;
      }

      const { demoMode } = await browser.storage.local.get('demoMode');
      const matcher = demoMode === true ? demoHandlers.matchAliases : handlers.matchAliases;
      const result = await matcher({ addresses }) as AliasMatchResult;

      // Discard stale result if a newer request arrived for this tab
      if (badgeRequestIds.get(tabId) !== requestId) return;

      const { matches, failedDomains } = result;
      const incomplete = failedDomains.length > 0;
      if (matches.length > 0) {
        const uniqueMatches = new Map(matches.map((match) => [`${match.domain}:${match.alias.id}`, match]));
        await browser.messageDisplayAction.setBadgeText({
          text: String(uniqueMatches.size), tabId,
        });
        await browser.messageDisplayAction.setBadgeBackgroundColor({
          color: incomplete ? '#f59e0b' : '#10b981', tabId,
        });
        const firstMatch = uniqueMatches.values().next().value as AliasMatch;
        const title = uniqueMatches.size === 1
          ? `Alias: ${firstMatch.alias.name}@${firstMatch.domain}`
          : `${uniqueMatches.size} aliases matched`;
        const incompleteTitle = browser.i18n.getMessage('badgeIncomplete');
        await browser.messageDisplayAction.setTitle({
          title: incomplete ? `${title} — ${incompleteTitle}` : title,
          tabId,
        });
      } else if (incomplete) {
        await browser.messageDisplayAction.setBadgeText({ text: '?', tabId });
        await browser.messageDisplayAction.setBadgeBackgroundColor({ color: '#f59e0b', tabId });
        await browser.messageDisplayAction.setTitle({
          title: browser.i18n.getMessage('badgeIncomplete'),
          tabId,
        });
      } else {
        await browser.messageDisplayAction.setBadgeText({ text: null, tabId });
        await browser.messageDisplayAction.setTitle({ title: null, tabId });
      }
    } catch (err) {
      console.warn('ForwardEmail: badge update failed', err);
      await browser.messageDisplayAction.setBadgeText({ text: null, tabId }).catch(() => {});
      await browser.messageDisplayAction.setTitle({ title: null, tabId }).catch(() => {});
    }
  }
);

function auditDetails(msg: MessageType): { action: AuditAction; target: string } | null {
  switch (msg.type) {
    case 'createAlias':
      return { action: 'alias_created', target: `domain/${msg.domain}/aliases` };
    case 'updateAlias':
      return { action: 'alias_updated', target: aliasTarget(msg.domain, msg.id) };
    case 'deleteAlias':
      return { action: 'alias_deleted', target: aliasTarget(msg.domain, msg.id) };
    case 'generatePassword':
      return { action: 'password_generated', target: aliasTarget(msg.domain, msg.id) };
    case 'createSieveScript':
      return { action: 'sieve_created', target: sieveTarget(msg.domain, msg.aliasId) };
    case 'updateSieveScript':
      return { action: 'sieve_updated', target: sieveTarget(msg.domain, msg.aliasId, msg.scriptId) };
    case 'deleteSieveScript':
      return { action: 'sieve_deleted', target: sieveTarget(msg.domain, msg.aliasId, msg.scriptId) };
    case 'activateSieveScript':
      return { action: 'sieve_activated', target: sieveTarget(msg.domain, msg.aliasId, msg.scriptId) };
    default:
      return null;
  }
}

function errorResponse(error: unknown): { error: string; status?: number } {
  if (error instanceof Error) {
    const status = typeof error === 'object' && 'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined;
    return { error: error.message, ...(status === undefined ? {} : { status }) };
  }
  return { error: browser.i18n.getMessage('unexpectedError') };
}

browser.runtime.onMessage.addListener(async (msg: MessageType, _sender: unknown) => {
  if (msg.type === 'setDemoMode') {
    await browser.storage.local.set({ demoMode: msg.enabled });
    return { data: { demoMode: msg.enabled } };
  }
  if (msg.type === 'getDemoMode') {
    const { demoMode } = await browser.storage.local.get('demoMode');
    return { data: { demoMode: demoMode === true } };
  }
  if (msg.type === 'saveCredentials') {
    try {
      await browser.storage.local.set({
        apiToken: msg.token,
        accountEmail: msg.email,
        accountPlan: msg.plan,
      });
      resetAccountCaches();
      await audit.recordAuditEvent('credentials_saved', 'success', 'credentials').catch(() => {});
      return { data: { ok: true } };
    } catch (error) {
      await audit.recordAuditEvent('credentials_saved', 'failure', 'credentials', error).catch(() => {});
      return errorResponse(error);
    }
  }
  if (msg.type === 'removeCredentials') {
    try {
      await browser.storage.local.remove(['apiToken', 'accountEmail', 'accountPlan', 'lastDomain']);
      resetAccountCaches();
      await audit.recordAuditEvent('credentials_removed', 'success', 'credentials').catch(() => {});
      return { data: { ok: true } };
    } catch (error) {
      await audit.recordAuditEvent('credentials_removed', 'failure', 'credentials', error).catch(() => {});
      return errorResponse(error);
    }
  }
  if (msg.type === 'getAuditEvents') return { data: await audit.getAuditEvents() };
  if (msg.type === 'clearAuditEvents') {
    await audit.clearAuditEvents();
    return { data: { ok: true } };
  }

  const { demoMode } = await browser.storage.local.get('demoMode');
  const source = demoMode === true ? demoHandlers : handlers;
  const handler = source[msg.type];
  if (!handler) return { error: 'Unknown message type' };
  const details = auditDetails(msg);
  try {
    const data = await handler(msg);
    if (details) await audit.recordAuditEvent(details.action, 'success', details.target).catch(() => {});
    return { data };
  } catch (error) {
    if (details) await audit.recordAuditEvent(details.action, 'failure', details.target, error).catch(() => {});
    return errorResponse(error);
  }
});
