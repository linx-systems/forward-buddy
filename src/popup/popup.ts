import { getAliasType, formatEmail, truncateRecipients, formatDate, friendlyError, splitLines, splitCommas, resolveDomain, toDateInputValue } from '../lib/utils.js';
import type { Alias, SieveScript } from '../types/forward-email.js';
import { buildSieveScript } from '../lib/sieve-builder.js';
import type { FilterRule, FilterCondition } from '../lib/sieve-builder.js';
import type { MessageResponse } from '../types/messages.js';

/* ====== DOM refs ====== */
const views = {
  noconfig: document.getElementById('view-noconfig')!,
  list: document.getElementById('view-list')!,
  detail: document.getElementById('view-detail')!,
  create: document.getElementById('view-create')!,
  sieveList: document.getElementById('view-sieve-list')!,
  sieveEdit: document.getElementById('view-sieve-edit')!,
};

const domainSelect = document.getElementById('domain-select') as HTMLSelectElement;
const searchInput = document.getElementById('search') as HTMLInputElement;
const aliasList = document.getElementById('alias-list')!;
const listLoading = document.getElementById('list-loading')!;
const listEmpty = document.getElementById('list-empty')!;
const listError = document.getElementById('list-error')!;

/* ====== State ====== */
let currentDomain: string = '';
let allAliases: Alias[] = [];
let currentAlias: Alias | null = null;
let aliasLoadRequest = 0;
let currentSieveScript: SieveScript | null = null;
let sieveEditMode: 'create' | 'edit' = 'create';

/* ====== i18n ====== */
function t(key: string, fallback?: string): string {
  return browser.i18n.getMessage(key) || fallback || key;
}

function applyI18n(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const msg = browser.i18n.getMessage(el.dataset.i18n!);
    if (msg) el.textContent = msg;
  }
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const msg = browser.i18n.getMessage(el.dataset.i18nPlaceholder!);
    if (msg) el.placeholder = msg;
  }
}

/* ====== View switching ====== */
function showView(name: keyof typeof views): void {
  for (const [k, el] of Object.entries(views)) {
    el.classList.toggle('hidden', k !== name);
  }
}

/* ====== Messaging ====== */
function send(msg: Record<string, unknown>): Promise<MessageResponse> {
  return browser.runtime.sendMessage(msg);
}

/* ====== Init ====== */
async function init(): Promise<void> {
  applyI18n();

  const demoRes = await send({ type: 'getDemoMode' });
  const isDemoMode = (demoRes.data as { demoMode?: boolean })?.demoMode === true;

  const { apiToken } = await browser.storage.local.get('apiToken');
  if (!apiToken && !isDemoMode) {
    showView('noconfig');
    return;
  }

  showView('list');
  await loadDomains();

  // Handle deep-link from message display "Edit" button
  const params = new URLSearchParams(window.location.search);
  const editAliasId = params.get('editAlias');
  const editDomain = params.get('domain');
  if (editAliasId && editDomain) {
    document.body.classList.add('edit-mode');
    const backBtn = document.getElementById('detail-back')!;
    backBtn.textContent = '\u2715 ' + t('btnCloseWindow', 'Close');
    currentDomain = editDomain;
    domainSelect.value = editDomain;
    await loadAliases();
    const alias = allAliases.find((a) => a.id === editAliasId);
    if (alias) openDetail(alias);
  }
}

/* ====== Domains ====== */
async function loadDomains(): Promise<void> {
  const res = await send({ type: 'getDomains' });
  if (res.error) {
    showListError(res.error);
    return;
  }

  const domains = res.data as Array<{ name?: string; domain?: string }>;
  domainSelect.replaceChildren();

  if (!Array.isArray(domains) || domains.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = t('noDomains', 'No domains found');
    opt.disabled = true;
    domainSelect.appendChild(opt);
    return;
  }

  for (const d of domains) {
    const name = d.name || d.domain;
    if (!name) continue;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    domainSelect.appendChild(opt);
  }

  // Restore last selected domain
  const { lastDomain } = await browser.storage.local.get('lastDomain');
  if (lastDomain && domains.some((d) => (d.name || d.domain) === lastDomain)) {
    domainSelect.value = lastDomain as string;
  }

  currentDomain = domainSelect.value;
  await loadAliases();
}

/* ====== Aliases ====== */
async function loadAliases(): Promise<void> {
  if (!currentDomain) return;
  const requestId = ++aliasLoadRequest;
  const requestedDomain = currentDomain;

  listLoading.classList.remove('hidden');
  listEmpty.classList.add('hidden');
  listError.classList.add('hidden');
  aliasList.replaceChildren();

  const res = await send({ type: 'getAliases', domain: requestedDomain });
  if (requestId !== aliasLoadRequest || requestedDomain !== currentDomain) return;

  listLoading.classList.add('hidden');
  if (res.error) {
    showListError(res.error);
    return;
  }

  allAliases = Array.isArray(res.data) ? (res.data as Alias[]) : [];
  renderAliases(allAliases);
}

function renderAliases(aliases: Alias[]): void {
  aliasList.replaceChildren();
  listEmpty.classList.toggle('hidden', aliases.length > 0);

  for (const alias of aliases) {
    aliasList.appendChild(createAliasItem(alias));
  }
}

function createAliasItem(alias: Alias): HTMLDivElement {
  const name = alias.name || '';
  const domain = resolveDomain(alias, currentDomain);
  const typeInfo = getAliasType(name);
  const selfAddress = formatEmail(name, domain).toLowerCase();
  const externalRecipients = (alias.recipients || []).filter(
    (r) => r.toLowerCase() !== selfAddress,
  );
  const { visible, extra } = truncateRecipients(externalRecipients);

  const item = document.createElement('div');
  item.className = 'alias-item';
  if (alias.is_enabled === false) item.classList.add('alias-disabled');

  // Toggle (stop propagation so click doesn't open detail)
  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'alias-toggle';
  toggleWrap.addEventListener('click', (e: Event) => e.stopPropagation());
  const toggle = document.createElement('label');
  toggle.className = 'toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = alias.is_enabled !== false;
  if (!typeInfo.canDisable) {
    checkbox.disabled = true;
    toggle.classList.add('toggle-disabled');
    toggle.title = t('toggleDisabledHint', 'This alias type cannot be toggled');
  } else {
    checkbox.addEventListener('change', () => toggleAlias(alias, checkbox));
  }
  const slider = document.createElement('span');
  slider.className = 'toggle-slider';
  toggle.appendChild(checkbox);
  toggle.appendChild(slider);
  toggleWrap.appendChild(toggle);

  // Info section
  const info = document.createElement('div');
  info.className = 'alias-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'alias-name-row';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'alias-name';
  nameSpan.textContent = name;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = typeInfo.label;
  badge.style.backgroundColor = typeInfo.color;
  nameRow.appendChild(nameSpan);
  nameRow.appendChild(badge);

  const emailSpan = document.createElement('div');
  emailSpan.className = 'alias-email';
  emailSpan.textContent = formatEmail(name, domain);

  info.appendChild(nameRow);
  info.appendChild(emailSpan);

  if (visible.length > 0) {
    const recip = document.createElement('div');
    recip.className = 'alias-recipients';
    let text = visible.join(', ');
    if (extra > 0) text += ` +${extra} more`;
    recip.textContent = '\u2192 ' + text;
    info.appendChild(recip);
  } else if (alias.has_imap) {
    const imap = document.createElement('div');
    imap.className = 'alias-recipients alias-imap';
    imap.textContent = '\u2192 ' + t('labelImap', 'IMAP Storage');
    info.appendChild(imap);
  }

  if (alias.description) {
    const desc = document.createElement('div');
    desc.className = 'alias-desc';
    desc.textContent = alias.description;
    info.appendChild(desc);
  }

  item.appendChild(toggleWrap);
  item.appendChild(info);

  item.addEventListener('click', () => openDetail(alias));

  return item;
}

/* ====== Toggle alias enabled ====== */
async function toggleAlias(alias: Alias, checkbox: HTMLInputElement): Promise<void> {
  const enabled = checkbox.checked;
  // Always use currentDomain to match the cache key used by loadAliases
  const domain = currentDomain;

  checkbox.disabled = true;
  try {
    const res = await send({
      type: 'updateAlias',
      domain,
      id: alias.id,
      data: { is_enabled: enabled },
    });

    if (res.error) {
      checkbox.checked = !enabled; // revert
      showListError(friendlyError({ message: res.error, status: res.status }));
    } else {
      alias.is_enabled = enabled;
      checkbox.checked = enabled;
      checkbox.closest('.alias-item')!.classList.toggle('alias-disabled', !enabled);
    }
  } catch {
    checkbox.checked = !enabled; // revert on unexpected error
  } finally {
    checkbox.disabled = false;
  }
}

/* ====== Detail view ====== */
function openDetail(alias: Alias): void {
  currentAlias = alias;
  const name = alias.name || '';
  const domain = resolveDomain(alias, currentDomain);
  const typeInfo = getAliasType(name);

  document.getElementById('detail-email')!.textContent = formatEmail(name, domain);
  const badge = document.getElementById('detail-badge')!;
  badge.textContent = typeInfo.label;
  badge.style.backgroundColor = typeInfo.color;

  (document.getElementById('detail-enabled') as HTMLInputElement).checked = alias.is_enabled !== false;
  const selfAddr = formatEmail(name, domain).toLowerCase();
  const detailRecipients = (alias.recipients || []).filter((r) => r.toLowerCase() !== selfAddr);
  (document.getElementById('detail-recipients') as HTMLTextAreaElement).value = detailRecipients.join('\n');
  (document.getElementById('detail-description') as HTMLTextAreaElement).value = alias.description || '';
  (document.getElementById('detail-labels') as HTMLInputElement).value = (alias.labels || []).join(', ');
  (document.getElementById('detail-imap') as HTMLInputElement).checked = !!alias.has_imap;
  (document.getElementById('detail-pgp') as HTMLInputElement).checked = !!alias.has_pgp;
  (document.getElementById('detail-verification') as HTMLInputElement).checked = !!alias.has_recipient_verification;

  // Vacation responder fields
  const vacationEnabled = !!alias.vacation_responder_is_enabled;
  (document.getElementById('detail-vacation-enabled') as HTMLInputElement).checked = vacationEnabled;
  (document.getElementById('detail-vacation-start') as HTMLInputElement).value = toDateInputValue(alias.vacation_responder_start_date);
  (document.getElementById('detail-vacation-end') as HTMLInputElement).value = toDateInputValue(alias.vacation_responder_end_date);
  (document.getElementById('detail-vacation-subject') as HTMLInputElement).value = alias.vacation_responder_subject || '';
  (document.getElementById('detail-vacation-message') as HTMLTextAreaElement).value = alias.vacation_responder_message || '';
  const vacationDetails = document.getElementById('detail-vacation') as HTMLDetailsElement;
  if (vacationEnabled) {
    vacationDetails.open = true;
  } else {
    vacationDetails.open = false;
  }

  document.getElementById('detail-created')!.textContent = alias.created_at
    ? `${t('labelCreated', 'Created')}: ${formatDate(alias.created_at)}`
    : '';
  document.getElementById('detail-updated')!.textContent = alias.updated_at
    ? `${t('labelUpdated', 'Updated')}: ${formatDate(alias.updated_at)}`
    : '';

  hideMsg('detail-msg');
  showView('detail');
}

/* ====== Save detail ====== */
async function saveDetail(): Promise<void> {
  if (!currentAlias) return;
  const domain = currentDomain;

  // Read vacation fields
  const vacationStart = (document.getElementById('detail-vacation-start') as HTMLInputElement).value;
  const vacationEnd = (document.getElementById('detail-vacation-end') as HTMLInputElement).value;
  if (vacationStart && vacationEnd && vacationEnd < vacationStart) {
    showMsg('detail-msg', 'error', t('errorVacationDateRange', 'End date must be on or after start date.'));
    return;
  }

  const data: Record<string, unknown> = {
    is_enabled: (document.getElementById('detail-enabled') as HTMLInputElement).checked,
    recipients: splitLines((document.getElementById('detail-recipients') as HTMLTextAreaElement).value),
    description: (document.getElementById('detail-description') as HTMLTextAreaElement).value.trim(),
    labels: splitCommas((document.getElementById('detail-labels') as HTMLInputElement).value),
    has_imap: (document.getElementById('detail-imap') as HTMLInputElement).checked,
    has_pgp: (document.getElementById('detail-pgp') as HTMLInputElement).checked,
    has_recipient_verification: (document.getElementById('detail-verification') as HTMLInputElement).checked,
    vacation_responder_is_enabled: (document.getElementById('detail-vacation-enabled') as HTMLInputElement).checked,
    vacation_responder_start_date: vacationStart || undefined,
    vacation_responder_end_date: vacationEnd || undefined,
    vacation_responder_subject: (document.getElementById('detail-vacation-subject') as HTMLInputElement).value.trim() || undefined,
    vacation_responder_message: (document.getElementById('detail-vacation-message') as HTMLTextAreaElement).value.trim() || undefined,
  };

  showGlobalLoading(true);
  const res = await send({ type: 'updateAlias', domain, id: currentAlias.id, data });
  showGlobalLoading(false);

  if (res.error) {
    showMsg('detail-msg', 'error', friendlyError({ message: res.error, status: res.status }));
  } else {
    showMsg('detail-msg', 'success', t('savedOk', 'Saved.'));
    await loadAliases();
    filterAliases();
  }
}

/* ====== Generate password ====== */
async function generatePassword(): Promise<void> {
  if (!currentAlias) return;
  const domain = currentDomain;

  showGlobalLoading(true);
  const res = await send({ type: 'generatePassword', domain, id: currentAlias.id });
  showGlobalLoading(false);

  if (res.error) {
    showMsg('detail-msg', 'error', friendlyError({ message: res.error, status: res.status }));
    return;
  }

  const resData = res.data as Record<string, unknown>;
  const password = (resData?.password || resData?.generated_password || JSON.stringify(res.data)) as string;
  (document.getElementById('modal-password-value') as HTMLInputElement).value = password;
  document.getElementById('modal-password')!.classList.remove('hidden');
}

/* ====== Delete alias ====== */
function confirmDelete(): void {
  if (!currentAlias) return;
  const name = currentAlias.name || '';
  const domain = resolveDomain(currentAlias, currentDomain);
  document.getElementById('modal-delete-name')!.textContent = formatEmail(name, domain);
  document.getElementById('modal-delete')!.classList.remove('hidden');
}

async function executeDelete(): Promise<void> {
  if (!currentAlias) return;
  const domain = currentDomain;

  document.getElementById('modal-delete')!.classList.add('hidden');
  showGlobalLoading(true);

  const res = await send({ type: 'deleteAlias', domain, id: currentAlias.id });
  showGlobalLoading(false);

  if (res.error) {
    showMsg('detail-msg', 'error', friendlyError({ message: res.error, status: res.status }));
  } else {
    showView('list');
    await loadAliases();
    filterAliases();
  }
}

/* ====== Create alias ====== */
function openCreate(): void {
  (document.getElementById('create-name') as HTMLInputElement).value = '';

  // Populate domain dropdown from the main domain selector
  const createDomain = document.getElementById('create-domain') as HTMLSelectElement;
  createDomain.replaceChildren();
  for (const opt of domainSelect.options) {
    const clone = opt.cloneNode(true) as HTMLOptionElement;
    createDomain.appendChild(clone);
  }
  createDomain.value = currentDomain;

  (document.getElementById('create-recipients') as HTMLTextAreaElement).value = '';
  (document.getElementById('create-description') as HTMLTextAreaElement).value = '';
  (document.getElementById('create-labels') as HTMLInputElement).value = '';
  (document.getElementById('create-imap') as HTMLInputElement).checked = false;
  hideMsg('create-msg');
  showView('create');
}

async function executeCreate(): Promise<void> {
  const name = (document.getElementById('create-name') as HTMLInputElement).value.trim();
  if (!name) {
    showMsg('create-msg', 'error', t('errorNameRequired', 'Alias name is required.'));
    return;
  }

  const data = {
    name,
    recipients: splitLines((document.getElementById('create-recipients') as HTMLTextAreaElement).value),
    description: (document.getElementById('create-description') as HTMLTextAreaElement).value.trim(),
    labels: splitCommas((document.getElementById('create-labels') as HTMLInputElement).value),
    has_imap: (document.getElementById('create-imap') as HTMLInputElement).checked,
  };

  const createDomain = (document.getElementById('create-domain') as HTMLSelectElement).value;

  showGlobalLoading(true);
  const res = await send({ type: 'createAlias', domain: createDomain, data });
  showGlobalLoading(false);

  if (res.error) {
    showMsg('create-msg', 'error', friendlyError({ message: res.error, status: res.status }));
  } else {
    // Switch to the domain where the alias was created
    if (createDomain !== currentDomain) {
      domainSelect.value = createDomain;
      currentDomain = createDomain;
    }
    showView('list');
    await loadAliases();
    filterAliases();
  }
}

/* ====== Search ====== */
function filterAliases(): void {
  const q = searchInput.value.toLowerCase().trim();
  if (!q) {
    renderAliases(allAliases);
    return;
  }
  const filtered = allAliases.filter((a) => {
    const name = (a.name || '').toLowerCase();
    const desc = (a.description || '').toLowerCase();
    const recips = (a.recipients || []).join(' ').toLowerCase();
    return name.includes(q) || desc.includes(q) || recips.includes(q);
  });
  renderAliases(filtered);
}

/* ====== Helpers ====== */
function showListError(msg: string): void {
  listError.textContent = msg;
  listError.className = 'error-msg error';
  listError.classList.remove('hidden');
}

function showMsg(id: string, type: string, text: string): void {
  const el = document.getElementById(id)!;
  el.className = `msg ${type}`;
  el.textContent = text;
  el.classList.remove('hidden');
}

function hideMsg(id: string): void {
  document.getElementById(id)!.classList.add('hidden');
}

function showGlobalLoading(show: boolean): void {
  document.getElementById('global-loading')!.classList.toggle('hidden', !show);
}

/* ====== Sieve script management ====== */
async function openSieveList(): Promise<void> {
  if (!currentAlias) return;
  const domain = currentDomain;
  const aliasId = currentAlias.id;

  showView('sieveList');
  const sieveList = document.getElementById('sieve-list')!;
  const sieveLoading = document.getElementById('sieve-list-loading')!;
  const sieveEmpty = document.getElementById('sieve-list-empty')!;
  const sieveError = document.getElementById('sieve-list-error')!;

  sieveList.replaceChildren();
  sieveLoading.classList.remove('hidden');
  sieveEmpty.classList.add('hidden');
  sieveError.classList.add('hidden');

  const res = await send({ type: 'getSieveScripts', domain, aliasId });
  sieveLoading.classList.add('hidden');

  if (res.error) {
    sieveError.textContent = friendlyError({ message: res.error, status: res.status });
    sieveError.className = 'error-msg error';
    sieveError.classList.remove('hidden');
    return;
  }

  const scripts = Array.isArray(res.data) ? (res.data as SieveScript[]) : [];
  sieveEmpty.classList.toggle('hidden', scripts.length > 0);

  for (const script of scripts) {
    sieveList.appendChild(createSieveItem(script));
  }
}

function createSieveItem(script: SieveScript): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'sieve-item';

  const info = document.createElement('div');
  info.className = 'sieve-item-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'sieve-item-name';
  const nameSpan = document.createElement('span');
  nameSpan.textContent = script.name;
  nameRow.appendChild(nameSpan);

  if (script.is_active) {
    const badge = document.createElement('span');
    badge.className = 'sieve-active-badge';
    badge.textContent = t('sieveActive', 'Active');
    nameRow.appendChild(badge);
  }

  info.appendChild(nameRow);

  if (script.description) {
    const desc = document.createElement('div');
    desc.className = 'sieve-item-desc';
    desc.textContent = script.description;
    info.appendChild(desc);
  }

  const actions = document.createElement('div');
  actions.className = 'sieve-item-actions';

  if (!script.is_active) {
    const activateBtn = document.createElement('button');
    activateBtn.className = 'btn btn-secondary';
    activateBtn.textContent = t('btnActivate', 'Activate');
    activateBtn.addEventListener('click', (e) => { e.stopPropagation(); activateSieve(script); });
    actions.appendChild(activateBtn);
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-secondary';
  editBtn.textContent = t('msgDisplayEdit', 'Edit');
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); openSieveEditor(script); });
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-danger';
  deleteBtn.style.width = 'auto';
  deleteBtn.style.marginTop = '0';
  deleteBtn.textContent = t('btnDelete', 'Delete');
  deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteSieve(script); });
  actions.appendChild(deleteBtn);

  item.appendChild(info);
  item.appendChild(actions);

  return item;
}

function openSieveEditor(script?: SieveScript): void {
  if (script) {
    sieveEditMode = 'edit';
    currentSieveScript = script;
    document.getElementById('sieve-edit-title')!.textContent = t('titleEditScript', 'Edit Script');
    (document.getElementById('sieve-name') as HTMLInputElement).value = script.name;
    (document.getElementById('sieve-description') as HTMLInputElement).value = script.description || '';
    (document.getElementById('sieve-content') as HTMLTextAreaElement).value = script.content;
    switchSieveMode('raw');
  } else {
    sieveEditMode = 'create';
    currentSieveScript = null;
    document.getElementById('sieve-edit-title')!.textContent = t('titleCreateScript', 'New Script');
    (document.getElementById('sieve-name') as HTMLInputElement).value = '';
    (document.getElementById('sieve-description') as HTMLInputElement).value = '';
    (document.getElementById('sieve-content') as HTMLTextAreaElement).value = '';
    // Reset visual builder
    document.getElementById('sieve-conditions')!.replaceChildren();
    (document.getElementById('sieve-condition-logic') as HTMLSelectElement).value = 'allof';
    (document.getElementById('sieve-action') as HTMLSelectElement).value = 'fileinto';
    (document.getElementById('sieve-action-value') as HTMLInputElement).value = '';
    updateActionValueVisibility();
    addConditionRow();
    switchSieveMode('visual');
  }
  hideMsg('sieve-edit-msg');
  showView('sieveEdit');
}

async function saveSieve(): Promise<void> {
  if (!currentAlias) return;
  const domain = currentDomain;
  const aliasId = currentAlias.id;

  const name = (document.getElementById('sieve-name') as HTMLInputElement).value.trim();
  if (!name) {
    showMsg('sieve-edit-msg', 'error', t('errorNameRequired', 'Name is required.'));
    return;
  }

  // Sync visual builder to raw textarea if in visual mode
  if (sieveMode === 'visual') {
    syncVisualToRaw();
  }

  const data = {
    name,
    description: (document.getElementById('sieve-description') as HTMLInputElement).value.trim(),
    content: (document.getElementById('sieve-content') as HTMLTextAreaElement).value,
  };

  showGlobalLoading(true);
  let res;
  if (sieveEditMode === 'edit' && currentSieveScript) {
    res = await send({ type: 'updateSieveScript', domain, aliasId, scriptId: currentSieveScript.id, data });
  } else {
    res = await send({ type: 'createSieveScript', domain, aliasId, data });
  }
  showGlobalLoading(false);

  if (res.error) {
    showMsg('sieve-edit-msg', 'error', friendlyError({ message: res.error, status: res.status }));
  } else {
    showMsg('sieve-edit-msg', 'success', t('sieveSavedOk', 'Saved.'));
    await openSieveList();
  }
}

async function activateSieve(script: SieveScript): Promise<void> {
  if (!currentAlias) return;
  const domain = currentDomain;
  const aliasId = currentAlias.id;

  showGlobalLoading(true);
  const res = await send({ type: 'activateSieveScript', domain, aliasId, scriptId: script.id });
  showGlobalLoading(false);

  if (res.error) {
    showMsg('detail-msg', 'error', friendlyError({ message: res.error, status: res.status }));
  } else {
    await openSieveList();
  }
}

function confirmDeleteSieve(script: SieveScript): void {
  currentSieveScript = script;
  document.getElementById('modal-sieve-delete-name')!.textContent = script.name;
  document.getElementById('modal-sieve-delete')!.classList.remove('hidden');
}

async function executeDeleteSieve(): Promise<void> {
  if (!currentAlias || !currentSieveScript) return;
  const domain = currentDomain;
  const aliasId = currentAlias.id;

  document.getElementById('modal-sieve-delete')!.classList.add('hidden');
  showGlobalLoading(true);

  const res = await send({ type: 'deleteSieveScript', domain, aliasId, scriptId: currentSieveScript.id });
  showGlobalLoading(false);

  if (res.error) {
    const sieveError = document.getElementById('sieve-list-error')!;
    sieveError.textContent = friendlyError({ message: res.error, status: res.status });
    sieveError.className = 'error-msg error';
    sieveError.classList.remove('hidden');
  } else {
    await openSieveList();
  }
}

/* ====== Visual filter builder ====== */
let sieveMode: 'visual' | 'raw' = 'visual';

function addConditionRow(): void {
  const container = document.getElementById('sieve-conditions')!;

  const row = document.createElement('div');
  row.className = 'condition-row';

  const headerSelect = document.createElement('select');
  for (const [val, label] of [
    ['from', t('headerFrom', 'From')],
    ['to', t('headerTo', 'To')],
    ['subject', t('headerSubject', 'Subject')],
    ['cc', t('headerCc', 'Cc')],
    ['reply-to', t('headerReplyTo', 'Reply-To')],
  ]) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    headerSelect.appendChild(opt);
  }

  const opSelect = document.createElement('select');
  for (const [val, label] of [
    ['contains', t('operatorContains', 'contains')],
    ['is', t('operatorIs', 'is')],
    ['matches', t('operatorMatches', 'matches')],
    ['regex', t('operatorRegex', 'regex')],
  ]) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    opSelect.appendChild(opt);
  }

  const valueInput = document.createElement('input');
  valueInput.type = 'text';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-condition';
  removeBtn.textContent = '\u00d7';
  removeBtn.title = t('btnRemoveCondition', 'Remove');
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(headerSelect);
  row.appendChild(opSelect);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function collectFilterRule(): FilterRule {
  const container = document.getElementById('sieve-conditions')!;
  const rows = container.querySelectorAll('.condition-row');
  const conditions: FilterCondition[] = [];

  for (const row of rows) {
    const selects = row.querySelectorAll('select');
    const input = row.querySelector('input') as HTMLInputElement;
    conditions.push({
      header: selects[0].value,
      operator: selects[1].value,
      value: input.value,
    });
  }

  return {
    conditions,
    conditionLogic: (document.getElementById('sieve-condition-logic') as HTMLSelectElement).value as 'allof' | 'anyof',
    action: (document.getElementById('sieve-action') as HTMLSelectElement).value as FilterRule['action'],
    actionValue: (document.getElementById('sieve-action-value') as HTMLInputElement).value.trim() || undefined,
  };
}

function syncVisualToRaw(): void {
  const rule = collectFilterRule();
  (document.getElementById('sieve-content') as HTMLTextAreaElement).value = buildSieveScript(rule);
}

function switchSieveMode(mode: 'visual' | 'raw'): void {
  sieveMode = mode;
  const visualTab = document.getElementById('sieve-tab-visual')!;
  const rawTab = document.getElementById('sieve-tab-raw')!;
  const visualPanel = document.getElementById('sieve-panel-visual')!;
  const rawPanel = document.getElementById('sieve-panel-raw')!;

  if (mode === 'visual') {
    visualTab.classList.add('active');
    rawTab.classList.remove('active');
    visualPanel.classList.remove('hidden');
    rawPanel.classList.add('hidden');
  } else {
    syncVisualToRaw();
    rawTab.classList.add('active');
    visualTab.classList.remove('active');
    rawPanel.classList.remove('hidden');
    visualPanel.classList.add('hidden');
  }
}

function updateActionValueVisibility(): void {
  const action = (document.getElementById('sieve-action') as HTMLSelectElement).value;
  const group = document.getElementById('sieve-action-value-group')!;
  // flag and discard don't need a value
  group.classList.toggle('hidden', action === 'flag' || action === 'discard');
}

/* ====== Event listeners ====== */
document.getElementById('btn-settings')!.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

document.getElementById('btn-open-settings')!.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

domainSelect.addEventListener('change', async () => {
  currentDomain = domainSelect.value;
  await browser.storage.local.set({ lastDomain: currentDomain });
  searchInput.value = '';
  await loadAliases();
});

searchInput.addEventListener('input', filterAliases);

document.getElementById('btn-new-alias')!.addEventListener('click', openCreate);
document.querySelector('.btn-create-from-empty')?.addEventListener('click', openCreate);

document.getElementById('detail-back')!.addEventListener('click', () => {
  if (document.body.classList.contains('edit-mode')) {
    window.close();
  } else {
    showView('list');
  }
});
document.getElementById('btn-save-detail')!.addEventListener('click', saveDetail);
document.getElementById('btn-gen-password')!.addEventListener('click', generatePassword);
document.getElementById('btn-delete-alias')!.addEventListener('click', confirmDelete);

document.getElementById('create-back')!.addEventListener('click', () => showView('list'));
document.getElementById('btn-create-alias')!.addEventListener('click', executeCreate);

document.getElementById('btn-manage-filters')!.addEventListener('click', openSieveList);

document.getElementById('sieve-list-back')!.addEventListener('click', () => showView('detail'));
document.getElementById('btn-new-script')!.addEventListener('click', () => openSieveEditor());

document.getElementById('sieve-edit-back')!.addEventListener('click', () => openSieveList());
document.getElementById('btn-save-script')!.addEventListener('click', saveSieve);

document.getElementById('sieve-tab-visual')!.addEventListener('click', () => switchSieveMode('visual'));
document.getElementById('sieve-tab-raw')!.addEventListener('click', () => switchSieveMode('raw'));
document.getElementById('btn-add-condition')!.addEventListener('click', addConditionRow);
document.getElementById('sieve-action')!.addEventListener('change', updateActionValueVisibility);

document.getElementById('modal-sieve-delete-confirm')!.addEventListener('click', executeDeleteSieve);
document.getElementById('modal-sieve-delete-cancel')!.addEventListener('click', () => {
  document.getElementById('modal-sieve-delete')!.classList.add('hidden');
});

document.getElementById('modal-delete-confirm')!.addEventListener('click', executeDelete);
document.getElementById('modal-delete-cancel')!.addEventListener('click', () => {
  document.getElementById('modal-delete')!.classList.add('hidden');
});

document.getElementById('modal-password-copy')!.addEventListener('click', async () => {
  const input = document.getElementById('modal-password-value') as HTMLInputElement;
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    // Fallback: input is already selected so user can Ctrl+C manually
  }
});
document.getElementById('modal-password-close')!.addEventListener('click', () => {
  document.getElementById('modal-password')!.classList.add('hidden');
});

/* ====== Start ====== */
init();
