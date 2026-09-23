/**
 * Background script — handles messages from popup/options,
 * dispatches API calls, manages cache.
 */

import * as api from '../lib/api.js';
import * as cache from '../lib/cache.js';
import { parseEmailAddress, matchesAlias, aliasPriority } from '../lib/utils.js';
import type { Alias } from '../types/forward-email.js';
import type { MessageType } from '../types/messages.js';
import type { SieveScript } from '../types/forward-email.js';
import { DEMO_DOMAINS, DEMO_ALIASES, DEMO_SIEVE_SCRIPTS } from '../lib/demo-data.js';

let demoMode = false;

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
  async matchAliases() { return []; },
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

async function getToken(): Promise<string> {
  const { apiToken } = await browser.storage.local.get('apiToken');
  if (!apiToken) throw new Error('No API token configured');
  return apiToken as string;
}

let currentToken: string | null = null;

async function getActiveToken(): Promise<string> {
  const token = await getToken();
  if (currentToken !== token) {
    cache.invalidateAll();
    currentToken = token;
  }
  return token;
}

const handlers: Record<string, (msg: any) => Promise<unknown>> = {
  async testConnection({ token }: { token: string }) {
    const account = await api.getAccount(token);
    return account;
  },

  async getDomains() {
    const token = await getActiveToken();
    const cached = cache.getCachedDomains();
    if (cached) return cached;
    const data = await api.getDomains(token);
    cache.setCachedDomains(data);
    return data;
  },

  async getAliases({ domain }: { domain: string }) {
    const token = await getActiveToken();
    const cached = cache.getCachedAliases(domain);
    if (cached) return cached;
    const data = await api.getAliases(token, domain);
    cache.setCachedAliases(domain, data);
    return data;
  },

  async createAlias({ domain, data }: { domain: string; data: Record<string, unknown> }) {
    const token = await getActiveToken();
    const result = await api.createAlias(token, domain, data);
    cache.invalidateAliases(domain);
    return result;
  },

  async updateAlias({ domain, id, data }: { domain: string; id: string; data: Record<string, unknown> }) {
    const token = await getActiveToken();
    const result = await api.updateAlias(token, domain, id, data);
    if (!cache.updateCachedAlias(domain, id, result)) {
      // Cache expired or alias not found — refetch and cache fresh data
      // so the next popup open sees the correct state
      const fresh = await api.getAliases(token, domain);
      cache.setCachedAliases(domain, fresh);
    }
    return result;
  },

  async deleteAlias({ domain, id }: { domain: string; id: string }) {
    const token = await getActiveToken();
    await api.deleteAlias(token, domain, id);
    if (!cache.removeCachedAlias(domain, id)) {
      cache.invalidateAliases(domain);
    }
    return { ok: true };
  },

  async generatePassword({ domain, id }: { domain: string; id: string }) {
    const token = await getActiveToken();
    return api.generatePassword(token, domain, id);
  },

  async getSieveScripts({ domain, aliasId }: { domain: string; aliasId: string }) {
    const token = await getActiveToken();
    const cached = cache.getCachedSieveScripts(domain, aliasId);
    if (cached) return cached;
    const data = await api.getSieveScripts(token, domain, aliasId);
    cache.setCachedSieveScripts(domain, aliasId, data);
    return data;
  },

  async getSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const token = await getActiveToken();
    return api.getSieveScript(token, domain, aliasId, scriptId);
  },

  async createSieveScript({ domain, aliasId, data }: { domain: string; aliasId: string; data: Partial<SieveScript> }) {
    const token = await getActiveToken();
    const result = await api.createSieveScript(token, domain, aliasId, data);
    cache.invalidateSieveScripts(domain, aliasId);
    return result;
  },

  async updateSieveScript({ domain, aliasId, scriptId, data }: { domain: string; aliasId: string; scriptId: string; data: Partial<SieveScript> }) {
    const token = await getActiveToken();
    const result = await api.updateSieveScript(token, domain, aliasId, scriptId, data);
    cache.invalidateSieveScripts(domain, aliasId);
    return result;
  },

  async deleteSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const token = await getActiveToken();
    await api.deleteSieveScript(token, domain, aliasId, scriptId);
    cache.invalidateSieveScripts(domain, aliasId);
    return { ok: true };
  },

  async activateSieveScript({ domain, aliasId, scriptId }: { domain: string; aliasId: string; scriptId: string }) {
    const token = await getActiveToken();
    const result = await api.activateSieveScript(token, domain, aliasId, scriptId);
    cache.invalidateSieveScripts(domain, aliasId);
    return result;
  },

  async matchAliases({ addresses }: { addresses: string[] }) {
    const token = await getActiveToken();

    let domains = cache.getCachedDomains();
    if (!domains) {
      domains = await api.getDomains(token);
      cache.setCachedDomains(domains);
    }

    const domainNames = domains.map((d: { name: string }) => d.name.toLowerCase());
    const ownedDomains = new Set(domainNames);
    const matches: { address: string; alias: Alias; domain: string }[] = [];
    const parsedAddresses = addresses
      .map((address) => ({ address, parsed: parseEmailAddress(address) }))
      .filter((entry): entry is { address: string; parsed: { local: string; domain: string } } =>
        entry.parsed !== null && ownedDomains.has(entry.parsed.domain));

    const relevantDomains = [...new Set(parsedAddresses.map((entry) => entry.parsed.domain))];

    const aliasesByDomain = new Map<string, Alias[]>();
    for (const domainName of relevantDomains) {
      try {
        let aliases = cache.getCachedAliases(domainName);
        if (!aliases) {
          aliases = await api.getAliases(token, domainName);
          cache.setCachedAliases(domainName, aliases);
        }
        aliasesByDomain.set(domainName, aliases);
      } catch {
        // Skip domains that fail to load so one error does not hide other matches.
      }
    }

    for (const { address, parsed } of parsedAddresses) {
      const aliases = aliasesByDomain.get(parsed.domain);
      if (!aliases) continue;

      const sorted = [...aliases].sort((a, b) => aliasPriority(a.name) - aliasPriority(b.name));
      for (const alias of sorted) {
        if (matchesAlias(parsed.local, parsed.domain, alias, parsed.domain)) {
          matches.push({ address, alias, domain: parsed.domain });
          break;
        }
      }
    }

    return matches;
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

      const matches = await handlers.matchAliases({ addresses }) as {
        address: string; alias: Alias; domain: string;
      }[];

      // Discard stale result if a newer request arrived for this tab
      if (badgeRequestIds.get(tabId) !== requestId) return;

      if (matches.length > 0) {
        const uniqueMatches = new Map(matches.map((match) => [`${match.domain}:${match.alias.id}`, match]));
        await browser.messageDisplayAction.setBadgeText({
          text: String(uniqueMatches.size), tabId,
        });
        await browser.messageDisplayAction.setBadgeBackgroundColor({
          color: '#10b981', tabId,
        });
        const firstMatch = uniqueMatches.values().next().value as typeof matches[number];
        const title = uniqueMatches.size === 1
          ? `Alias: ${firstMatch.alias.name}@${firstMatch.domain}`
          : `${uniqueMatches.size} aliases matched`;
        await browser.messageDisplayAction.setTitle({ title, tabId });
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

browser.runtime.onMessage.addListener((msg: MessageType, _sender: unknown) => {
  if (msg.type === 'setDemoMode') {
    demoMode = (msg as any).enabled;
    return Promise.resolve({ data: { demoMode } });
  }
  if (msg.type === 'getDemoMode') {
    return Promise.resolve({ data: { demoMode } });
  }

  const source = demoMode ? demoHandlers : handlers;
  const handler = source[msg.type];
  if (!handler) return Promise.resolve({ error: 'Unknown message type' });
  return handler(msg)
    .then((data) => ({ data }))
    .catch((err: Error & { status?: number }) => ({ error: err.message, status: err.status }));
});
