/**
 * Background script — handles messages from popup/options,
 * dispatches API calls, manages cache.
 */
import * as api from '../lib/api.js';
import * as cache from '../lib/cache.js';
import { parseEmailAddress, matchesAlias } from '../lib/utils.js';
async function getToken() {
    const { apiToken } = await browser.storage.local.get('apiToken');
    if (!apiToken)
        throw new Error('No API token configured');
    return apiToken;
}
const handlers = {
    async testConnection({ token }) {
        const account = await api.getAccount(token);
        return account;
    },
    async getDomains() {
        const cached = cache.getCachedDomains();
        if (cached)
            return cached;
        const token = await getToken();
        const data = await api.getDomains(token);
        cache.setCachedDomains(data);
        return data;
    },
    async getAliases({ domain }) {
        const cached = cache.getCachedAliases(domain);
        if (cached)
            return cached;
        const token = await getToken();
        const data = await api.getAliases(token, domain);
        cache.setCachedAliases(domain, data);
        return data;
    },
    async createAlias({ domain, data }) {
        const token = await getToken();
        const result = await api.createAlias(token, domain, data);
        cache.invalidateAliases(domain);
        return result;
    },
    async updateAlias({ domain, id, data }) {
        const token = await getToken();
        const result = await api.updateAlias(token, domain, id, data);
        if (!cache.updateCachedAlias(domain, id, result)) {
            cache.invalidateAliases(domain);
        }
        return result;
    },
    async deleteAlias({ domain, id }) {
        const token = await getToken();
        await api.deleteAlias(token, domain, id);
        if (!cache.removeCachedAlias(domain, id)) {
            cache.invalidateAliases(domain);
        }
        return { ok: true };
    },
    async generatePassword({ domain, id }) {
        const token = await getToken();
        return api.generatePassword(token, domain, id);
    },
    async matchAliases({ addresses }) {
        const token = await getToken();
        let domains = cache.getCachedDomains();
        if (!domains) {
            domains = await api.getDomains(token);
            cache.setCachedDomains(domains);
        }
        const domainNames = domains.map((d) => d.name.toLowerCase());
        const matches = [];
        const aliasesByDomain = new Map();
        for (const domainName of domainNames) {
            let aliases = cache.getCachedAliases(domainName);
            if (!aliases) {
                aliases = await api.getAliases(token, domainName);
                cache.setCachedAliases(domainName, aliases);
            }
            aliasesByDomain.set(domainName, aliases);
        }
        for (const addr of addresses) {
            const parsed = parseEmailAddress(addr);
            if (!parsed)
                continue;
            if (!domainNames.includes(parsed.domain))
                continue;
            const aliases = aliasesByDomain.get(parsed.domain);
            if (!aliases)
                continue;
            for (const alias of aliases) {
                if (matchesAlias(parsed.local, parsed.domain, alias)) {
                    matches.push({ address: addr, alias, domain: parsed.domain });
                    break;
                }
            }
        }
        return matches;
    },
};
// Update badge when a message is displayed
browser.messageDisplay.onMessagesDisplayed.addListener(async (tab, rawMessages) => {
    const tabId = tab.id;
    try {
        const messages = Array.isArray(rawMessages) ? rawMessages : rawMessages?.messages ?? [];
        const addresses = [];
        for (const msg of messages) {
            if (msg.recipients)
                addresses.push(...msg.recipients);
            if (msg.ccList)
                addresses.push(...msg.ccList);
        }
        if (addresses.length === 0) {
            await browser.messageDisplayAction.setBadgeText({ text: null, tabId });
            await browser.messageDisplayAction.setTitle({ title: null, tabId });
            return;
        }
        const matches = await handlers.matchAliases({ addresses });
        if (matches.length > 0) {
            await browser.messageDisplayAction.setBadgeText({
                text: String(matches.length), tabId,
            });
            await browser.messageDisplayAction.setBadgeBackgroundColor({
                color: '#10b981', tabId,
            });
            const title = matches.length === 1
                ? `Alias: ${matches[0].alias.name}@${matches[0].domain}`
                : `${matches.length} aliases matched`;
            await browser.messageDisplayAction.setTitle({ title, tabId });
        }
        else {
            await browser.messageDisplayAction.setBadgeText({ text: null, tabId });
            await browser.messageDisplayAction.setTitle({ title: null, tabId });
        }
    }
    catch {
        // Silently fail — user may not have configured a token yet
        await browser.messageDisplayAction.setBadgeText({ text: null, tabId });
        await browser.messageDisplayAction.setTitle({ title: null, tabId });
    }
});
browser.runtime.onMessage.addListener((msg, _sender) => {
    const handler = handlers[msg.type];
    if (!handler)
        return Promise.resolve({ error: 'Unknown message type' });
    return handler(msg)
        .then((data) => ({ data }))
        .catch((err) => ({ error: err.message, status: err.status }));
});
