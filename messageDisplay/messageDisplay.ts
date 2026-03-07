/**
 * Message display popup — shows alias match info for the currently displayed message.
 */

import { getAliasType, truncateRecipients, parseEmailAddress, resolveDomain } from '../lib/utils.js';
import type { Alias } from '../types/forward-email.js';
import type { MessageResponse } from '../types/messages.js';

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

function send(msg: Record<string, unknown>): Promise<MessageResponse> {
  return browser.runtime.sendMessage(msg);
}

function t(key: string, fallback?: string): string {
  return browser.i18n.getMessage(key) || fallback || key;
}

function setButtonLoading(btn: HTMLButtonElement, loading: boolean): void {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origText = btn.textContent || '';
    btn.textContent = '';
    const spinner = document.createElement('span');
    spinner.className = 'action-spinner';
    btn.appendChild(spinner);
  } else {
    btn.textContent = btn.dataset.origText || '';
  }
}

function replaceActionsWithResult(actionsRow: HTMLElement, text: string, isError: boolean): void {
  actionsRow.textContent = '';
  if (isError) {
    actionsRow.className = 'match-actions';
    const errorEl = document.createElement('span');
    errorEl.className = 'action-error';
    errorEl.textContent = text;
    actionsRow.appendChild(errorEl);
  } else {
    actionsRow.className = 'action-success';
    actionsRow.textContent = '\u2713 ' + text;
  }
}

async function handleBlockDirect(alias: Alias, domain: string, actionsRow: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  setButtonLoading(btn, true);
  const res = await send({ type: 'updateAlias', domain, id: alias.id, data: { is_enabled: false } });
  if (res.error) {
    setButtonLoading(btn, false);
    const errorEl = document.createElement('span');
    errorEl.className = 'action-error';
    errorEl.textContent = t('msgDisplayBlockError') + ': ' + res.error;
    actionsRow.appendChild(errorEl);
  } else {
    replaceActionsWithResult(actionsRow, t('msgDisplayBlocked'), false);
  }
}

async function handleBlockAddress(address: string, alias: Alias, domain: string, actionsRow: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  const parsed = parseEmailAddress(address);
  if (!parsed) return;

  setButtonLoading(btn, true);
  const res = await send({
    type: 'createAlias',
    domain,
    data: {
      name: parsed.local,
      is_enabled: false,
      recipients: alias.recipients || [],
    },
  });
  if (res.error) {
    setButtonLoading(btn, false);
    const errorEl = document.createElement('span');
    errorEl.className = 'action-error';
    errorEl.textContent = t('msgDisplayBlockError') + ': ' + res.error;
    actionsRow.appendChild(errorEl);
  } else {
    replaceActionsWithResult(actionsRow, t('msgDisplayBlockCreated'), false);
  }
}

async function handleBlockWildcard(alias: Alias, domain: string, actionsRow: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  setButtonLoading(btn, true);
  const res = await send({ type: 'updateAlias', domain, id: alias.id, data: { is_enabled: false } });
  if (res.error) {
    setButtonLoading(btn, false);
    const errorEl = document.createElement('span');
    errorEl.className = 'action-error';
    errorEl.textContent = t('msgDisplayBlockError') + ': ' + res.error;
    actionsRow.appendChild(errorEl);
  } else {
    replaceActionsWithResult(actionsRow, t('msgDisplayBlocked'), false);
  }
}

function openEditPopup(alias: Alias, domain: string): void {
  browser.windows.create({
    url: browser.runtime.getURL(`popup/popup.html?editAlias=${alias.id}&domain=${encodeURIComponent(domain)}`),
    type: 'popup',
    width: 420,
    height: 580,
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

    const domainSpan = document.createElement('span');
    domainSpan.className = 'match-domain';
    domainSpan.textContent = m.domain;
    meta.appendChild(domainSpan);

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

    // Action buttons
    const domain = resolveDomain(m.alias, m.domain);
    const actions = document.createElement('div');
    actions.className = 'match-actions';

    if (typeInfo.type === 'direct') {
      const blockBtn = document.createElement('button');
      blockBtn.className = 'action-btn action-btn-danger';
      blockBtn.textContent = t('msgDisplayBlock');
      blockBtn.addEventListener('click', () => handleBlockDirect(m.alias, domain, actions, blockBtn));
      actions.appendChild(blockBtn);
    } else {
      // catch-all or regex: two block options
      const blockAddrBtn = document.createElement('button');
      blockAddrBtn.className = 'action-btn action-btn-danger';
      blockAddrBtn.textContent = t('msgDisplayBlockAddress');
      blockAddrBtn.addEventListener('click', () => handleBlockAddress(m.address, m.alias, domain, actions, blockAddrBtn));
      actions.appendChild(blockAddrBtn);

      const blockAllBtn = document.createElement('button');
      blockAllBtn.className = 'action-btn action-btn-danger';
      blockAllBtn.textContent = typeInfo.type === 'catchall' ? t('msgDisplayBlockCatchall') : t('msgDisplayBlockRegex');
      blockAllBtn.addEventListener('click', () => handleBlockWildcard(m.alias, domain, actions, blockAllBtn));
      actions.appendChild(blockAllBtn);

      const warning = document.createElement('div');
      warning.className = 'block-warning';
      warning.textContent = t('msgDisplayBlockWarning');
      actions.appendChild(warning);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn action-btn-secondary';
    editBtn.textContent = t('msgDisplayEdit');
    editBtn.addEventListener('click', () => openEditPopup(m.alias, domain));
    actions.appendChild(editBtn);

    item.appendChild(actions);
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
      if (msg.bccList) addresses.push(...msg.bccList);
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
