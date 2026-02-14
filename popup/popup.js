import { getAliasType, formatEmail, truncateRecipients, formatDate, friendlyError, splitLines, splitCommas, resolveDomain } from '../lib/utils.js';
/* ====== DOM refs ====== */
const views = {
    noconfig: document.getElementById('view-noconfig'),
    list: document.getElementById('view-list'),
    detail: document.getElementById('view-detail'),
    create: document.getElementById('view-create'),
};
const domainSelect = document.getElementById('domain-select');
const searchInput = document.getElementById('search');
const aliasList = document.getElementById('alias-list');
const listLoading = document.getElementById('list-loading');
const listEmpty = document.getElementById('list-empty');
const listError = document.getElementById('list-error');
/* ====== State ====== */
let currentDomain = '';
let allAliases = [];
let currentAlias = null;
/* ====== i18n ====== */
function t(key, fallback) {
    return browser.i18n.getMessage(key) || fallback || key;
}
function applyI18n() {
    for (const el of document.querySelectorAll('[data-i18n]')) {
        const msg = browser.i18n.getMessage(el.dataset.i18n);
        if (msg)
            el.textContent = msg;
    }
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
        const msg = browser.i18n.getMessage(el.dataset.i18nPlaceholder);
        if (msg)
            el.placeholder = msg;
    }
}
/* ====== View switching ====== */
function showView(name) {
    for (const [k, el] of Object.entries(views)) {
        el.classList.toggle('hidden', k !== name);
    }
}
/* ====== Messaging ====== */
function send(msg) {
    return browser.runtime.sendMessage(msg);
}
/* ====== Init ====== */
async function init() {
    applyI18n();
    const { apiToken } = await browser.storage.local.get('apiToken');
    if (!apiToken) {
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
        const backBtn = document.getElementById('detail-back');
        backBtn.textContent = '\u2715 ' + t('btnCloseWindow', 'Close');
        currentDomain = editDomain;
        domainSelect.value = editDomain;
        await loadAliases();
        const alias = allAliases.find((a) => a.id === editAliasId);
        if (alias)
            openDetail(alias);
    }
}
/* ====== Domains ====== */
async function loadDomains() {
    const res = await send({ type: 'getDomains' });
    if (res.error) {
        showListError(res.error);
        return;
    }
    const domains = res.data;
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
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        domainSelect.appendChild(opt);
    }
    // Restore last selected domain
    const { lastDomain } = await browser.storage.local.get('lastDomain');
    if (lastDomain && domains.some((d) => (d.name || d.domain) === lastDomain)) {
        domainSelect.value = lastDomain;
    }
    currentDomain = domainSelect.value;
    await loadAliases();
}
/* ====== Aliases ====== */
async function loadAliases() {
    if (!currentDomain)
        return;
    listLoading.classList.remove('hidden');
    listEmpty.classList.add('hidden');
    listError.classList.add('hidden');
    aliasList.replaceChildren();
    const res = await send({ type: 'getAliases', domain: currentDomain });
    listLoading.classList.add('hidden');
    if (res.error) {
        showListError(res.error);
        return;
    }
    allAliases = Array.isArray(res.data) ? res.data : [];
    renderAliases(allAliases);
}
function renderAliases(aliases) {
    aliasList.replaceChildren();
    listEmpty.classList.toggle('hidden', aliases.length > 0);
    for (const alias of aliases) {
        aliasList.appendChild(createAliasItem(alias));
    }
}
function createAliasItem(alias) {
    const name = alias.name || '';
    const domain = resolveDomain(alias, currentDomain);
    const typeInfo = getAliasType(name);
    const { visible, extra } = truncateRecipients(alias.recipients);
    const item = document.createElement('div');
    item.className = 'alias-item';
    if (alias.is_enabled === false)
        item.classList.add('alias-disabled');
    // Toggle (stop propagation so click doesn't open detail)
    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'alias-toggle';
    toggleWrap.addEventListener('click', (e) => e.stopPropagation());
    const toggle = document.createElement('label');
    toggle.className = 'toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = alias.is_enabled !== false;
    if (!typeInfo.canDisable) {
        checkbox.disabled = true;
        toggle.classList.add('toggle-disabled');
        toggle.title = t('toggleDisabledHint', 'This alias type cannot be toggled');
    }
    else {
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
        if (extra > 0)
            text += ` +${extra} more`;
        recip.textContent = '\u2192 ' + text;
        info.appendChild(recip);
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
async function toggleAlias(alias, checkbox) {
    const enabled = checkbox.checked;
    const domain = resolveDomain(alias, currentDomain);
    const res = await send({
        type: 'updateAlias',
        domain,
        id: alias.id,
        data: { is_enabled: enabled },
    });
    if (res.error) {
        checkbox.checked = !enabled; // revert
        showListError(friendlyError({ message: res.error, status: res.status }));
    }
    else {
        alias.is_enabled = enabled;
        checkbox.closest('.alias-item').classList.toggle('alias-disabled', !enabled);
    }
}
/* ====== Detail view ====== */
function openDetail(alias) {
    currentAlias = alias;
    const name = alias.name || '';
    const domain = resolveDomain(alias, currentDomain);
    const typeInfo = getAliasType(name);
    document.getElementById('detail-email').textContent = formatEmail(name, domain);
    const badge = document.getElementById('detail-badge');
    badge.textContent = typeInfo.label;
    badge.style.backgroundColor = typeInfo.color;
    document.getElementById('detail-enabled').checked = alias.is_enabled !== false;
    document.getElementById('detail-recipients').value = (alias.recipients || []).join('\n');
    document.getElementById('detail-description').value = alias.description || '';
    document.getElementById('detail-labels').value = (alias.labels || []).join(', ');
    document.getElementById('detail-imap').checked = !!alias.has_imap;
    document.getElementById('detail-pgp').checked = !!alias.has_pgp;
    document.getElementById('detail-verification').checked = !!alias.has_recipient_verification;
    document.getElementById('detail-created').textContent = alias.created_at
        ? `${t('labelCreated', 'Created')}: ${formatDate(alias.created_at)}`
        : '';
    document.getElementById('detail-updated').textContent = alias.updated_at
        ? `${t('labelUpdated', 'Updated')}: ${formatDate(alias.updated_at)}`
        : '';
    hideMsg('detail-msg');
    showView('detail');
}
/* ====== Save detail ====== */
async function saveDetail() {
    if (!currentAlias)
        return;
    const domain = resolveDomain(currentAlias, currentDomain);
    const data = {
        is_enabled: document.getElementById('detail-enabled').checked,
        recipients: splitLines(document.getElementById('detail-recipients').value),
        description: document.getElementById('detail-description').value.trim(),
        labels: splitCommas(document.getElementById('detail-labels').value),
        has_imap: document.getElementById('detail-imap').checked,
        has_pgp: document.getElementById('detail-pgp').checked,
        has_recipient_verification: document.getElementById('detail-verification').checked,
    };
    showGlobalLoading(true);
    const res = await send({ type: 'updateAlias', domain, id: currentAlias.id, data });
    showGlobalLoading(false);
    if (res.error) {
        showMsg('detail-msg', 'error', friendlyError({ message: res.error, status: res.status }));
    }
    else {
        showMsg('detail-msg', 'success', t('savedOk', 'Saved.'));
        // Refresh list in background
        loadAliases();
    }
}
/* ====== Generate password ====== */
async function generatePassword() {
    if (!currentAlias)
        return;
    const domain = resolveDomain(currentAlias, currentDomain);
    showGlobalLoading(true);
    const res = await send({ type: 'generatePassword', domain, id: currentAlias.id });
    showGlobalLoading(false);
    if (res.error) {
        showMsg('detail-msg', 'error', friendlyError({ message: res.error, status: res.status }));
        return;
    }
    const resData = res.data;
    const password = (resData?.password || resData?.generated_password || JSON.stringify(res.data));
    document.getElementById('modal-password-value').value = password;
    document.getElementById('modal-password').classList.remove('hidden');
}
/* ====== Delete alias ====== */
function confirmDelete() {
    if (!currentAlias)
        return;
    const name = currentAlias.name || '';
    const domain = resolveDomain(currentAlias, currentDomain);
    document.getElementById('modal-delete-name').textContent = formatEmail(name, domain);
    document.getElementById('modal-delete').classList.remove('hidden');
}
async function executeDelete() {
    if (!currentAlias)
        return;
    const domain = resolveDomain(currentAlias, currentDomain);
    document.getElementById('modal-delete').classList.add('hidden');
    showGlobalLoading(true);
    const res = await send({ type: 'deleteAlias', domain, id: currentAlias.id });
    showGlobalLoading(false);
    if (res.error) {
        showMsg('detail-msg', 'error', friendlyError({ message: res.error, status: res.status }));
    }
    else {
        showView('list');
        await loadAliases();
    }
}
/* ====== Create alias ====== */
function openCreate() {
    document.getElementById('create-name').value = '';
    document.getElementById('create-domain').value = currentDomain;
    document.getElementById('create-recipients').value = '';
    document.getElementById('create-description').value = '';
    document.getElementById('create-labels').value = '';
    document.getElementById('create-imap').checked = false;
    hideMsg('create-msg');
    showView('create');
}
async function executeCreate() {
    const name = document.getElementById('create-name').value.trim();
    if (!name) {
        showMsg('create-msg', 'error', t('errorNameRequired', 'Alias name is required.'));
        return;
    }
    const data = {
        name,
        recipients: splitLines(document.getElementById('create-recipients').value),
        description: document.getElementById('create-description').value.trim(),
        labels: splitCommas(document.getElementById('create-labels').value),
        has_imap: document.getElementById('create-imap').checked,
    };
    showGlobalLoading(true);
    const res = await send({ type: 'createAlias', domain: currentDomain, data });
    showGlobalLoading(false);
    if (res.error) {
        showMsg('create-msg', 'error', friendlyError({ message: res.error, status: res.status }));
    }
    else {
        showView('list');
        await loadAliases();
    }
}
/* ====== Search ====== */
function filterAliases() {
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
function showListError(msg) {
    listError.textContent = msg;
    listError.className = 'error-msg error';
    listError.classList.remove('hidden');
}
function showMsg(id, type, text) {
    const el = document.getElementById(id);
    el.className = `msg ${type}`;
    el.textContent = text;
    el.classList.remove('hidden');
}
function hideMsg(id) {
    document.getElementById(id).classList.add('hidden');
}
function showGlobalLoading(show) {
    document.getElementById('global-loading').classList.toggle('hidden', !show);
}
/* ====== Event listeners ====== */
document.getElementById('btn-settings').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
});
document.getElementById('btn-open-settings').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
});
domainSelect.addEventListener('change', async () => {
    currentDomain = domainSelect.value;
    await browser.storage.local.set({ lastDomain: currentDomain });
    searchInput.value = '';
    await loadAliases();
});
searchInput.addEventListener('input', filterAliases);
document.getElementById('btn-new-alias').addEventListener('click', openCreate);
document.querySelector('.btn-create-from-empty')?.addEventListener('click', openCreate);
document.getElementById('detail-back').addEventListener('click', () => {
    if (document.body.classList.contains('edit-mode')) {
        window.close();
    }
    else {
        showView('list');
    }
});
document.getElementById('btn-save-detail').addEventListener('click', saveDetail);
document.getElementById('btn-gen-password').addEventListener('click', generatePassword);
document.getElementById('btn-delete-alias').addEventListener('click', confirmDelete);
document.getElementById('create-back').addEventListener('click', () => showView('list'));
document.getElementById('btn-create-alias').addEventListener('click', executeCreate);
document.getElementById('modal-delete-confirm').addEventListener('click', executeDelete);
document.getElementById('modal-delete-cancel').addEventListener('click', () => {
    document.getElementById('modal-delete').classList.add('hidden');
});
document.getElementById('modal-password-copy').addEventListener('click', () => {
    const input = document.getElementById('modal-password-value');
    input.select();
    navigator.clipboard.writeText(input.value);
});
document.getElementById('modal-password-close').addEventListener('click', () => {
    document.getElementById('modal-password').classList.add('hidden');
});
/* ====== Start ====== */
init();
