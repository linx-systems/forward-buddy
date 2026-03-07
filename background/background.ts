/**
 * Background script — handles messages from popup/options,
 * dispatches API calls, manages cache.
 */

import * as api from '../lib/api.js';
import * as cache from '../lib/cache.js';
import { parseEmailAddress, matchesAlias } from '../lib/utils.js';
import type { Alias } from '../types/forward-email.js';
import type { MessageType } from '../types/messages.js';

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
      cache.invalidateAliases(domain);
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

      for (const alias of aliases) {
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
browser.messageDisplay.onMessagesDisplayed.addListener(
  async (tab: browser.tabs.Tab, rawMessages: any) => {
    const tabId = tab.id;
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
    } catch {
      // Silently fail — user may not have configured a token yet
      await browser.messageDisplayAction.setBadgeText({ text: null, tabId });
      await browser.messageDisplayAction.setTitle({ title: null, tabId });
    }
  }
);

browser.runtime.onMessage.addListener((msg: MessageType, _sender: unknown) => {
  const handler = handlers[msg.type];
  if (!handler) return Promise.resolve({ error: 'Unknown message type' });
  return handler(msg)
    .then((data) => ({ data }))
    .catch((err: Error & { status?: number }) => ({ error: err.message, status: err.status }));
});
