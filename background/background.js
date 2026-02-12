/**
 * Background script — handles messages from popup/options,
 * dispatches API calls, manages cache.
 */

import * as api from '../lib/api.js';
import * as cache from '../lib/cache.js';
/* global browser */

async function getToken() {
  const { apiToken } = await browser.storage.local.get('apiToken');
  if (!apiToken) throw new Error('No API token configured');
  return apiToken;
}

const handlers = {
  async testConnection({ token }) {
    const account = await api.getAccount(token);
    return account;
  },

  async getDomains() {
    const cached = cache.getCachedDomains();
    if (cached) return cached;
    const token = await getToken();
    const data = await api.getDomains(token);
    cache.setCachedDomains(data);
    return data;
  },

  async getAliases({ domain }) {
    const cached = cache.getCachedAliases(domain);
    if (cached) return cached;
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
};

browser.runtime.onMessage.addListener((msg, _sender) => {
  const handler = handlers[msg.type];
  if (!handler) return Promise.resolve({ error: 'Unknown message type' });
  return handler(msg)
    .then((data) => ({ data }))
    .catch((err) => ({ error: err.message, status: err.status }));
});
