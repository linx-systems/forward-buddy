/**
 * Message display popup — shows alias match info for the currently displayed message.
 */

import { getAliasType, truncateRecipients } from '../lib/utils.js';
import type { Alias } from '../types/forward-email.js';

interface AliasMatch {
  address: string;
  alias: Alias;
  domain: string;
}

const viewLoading = document.getElementById('view-loading')!;
const viewResults = document.getElementById('view-results')!;
const viewNoMatch = document.getElementById('view-no-match')!;
const viewError = document.getElementById('view-error')!;
const matchList = document.getElementById('match-list')!;
const errorText = document.getElementById('error-text')!;

function showView(view: HTMLElement): void {
  viewLoading.classList.add('hidden');
  viewResults.classList.add('hidden');
  viewNoMatch.classList.add('hidden');
  viewError.classList.add('hidden');
  view.classList.remove('hidden');
}

function applyI18n(): void {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = browser.i18n.getMessage(key);
  });
}

function renderMatches(matches: AliasMatch[]): void {
  matchList.textContent = '';
  for (const m of matches) {
    const item = document.createElement('div');
    item.className = 'match-item';

    const addr = document.createElement('div');
    addr.className = 'match-address';
    addr.textContent = m.address;
    item.appendChild(addr);

    const meta = document.createElement('div');
    meta.className = 'match-meta';

    const typeInfo = getAliasType(m.alias.name);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.style.background = typeInfo.color;
    badge.textContent = typeInfo.label;
    meta.appendChild(badge);

    const domain = document.createElement('span');
    domain.className = 'match-domain';
    domain.textContent = m.domain;
    meta.appendChild(domain);

    item.appendChild(meta);

    if (m.alias.recipients && m.alias.recipients.length > 0) {
      const recip = document.createElement('div');
      recip.className = 'match-recipients';

      const label = document.createElement('span');
      label.className = 'match-recipients-label';
      label.textContent = browser.i18n.getMessage('msgDisplayRecipients') + ': ';
      recip.appendChild(label);

      const { visible, extra } = truncateRecipients(m.alias.recipients, 3);
      const text = document.createTextNode(visible.join(', ') + (extra > 0 ? ` (+${extra})` : ''));
      recip.appendChild(text);

      item.appendChild(recip);
    }

    matchList.appendChild(item);
  }
}

async function init(): Promise<void> {
  applyI18n();
  showView(viewLoading);

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) {
      showView(viewNoMatch);
      return;
    }

    const result: any = await browser.messageDisplay.getDisplayedMessages(tabId);
    const messages: any[] = Array.isArray(result) ? result : result?.messages ?? [];
    if (messages.length === 0) {
      showView(viewNoMatch);
      return;
    }

    const addresses: string[] = [];
    for (const msg of messages) {
      if (msg.recipients) addresses.push(...msg.recipients);
      if (msg.ccList) addresses.push(...msg.ccList);
    }

    if (addresses.length === 0) {
      showView(viewNoMatch);
      return;
    }

    const response = await browser.runtime.sendMessage({ type: 'matchAliases', addresses });
    if (response.error) {
      errorText.textContent = response.error;
      showView(viewError);
      return;
    }

    const matches: AliasMatch[] = response.data;
    if (!matches || matches.length === 0) {
      showView(viewNoMatch);
    } else {
      renderMatches(matches);
      showView(viewResults);
    }
  } catch (err) {
    errorText.textContent = (err as Error).message || browser.i18n.getMessage('errorUnknown');
    showView(viewError);
  }
}

init();
