const tokenInput = document.getElementById('api-token') as HTMLInputElement;
const toggleBtn = document.getElementById('toggle-visibility')!;
const eyeIcon = document.getElementById('eye-icon')!;
const btnTest = document.getElementById('btn-test') as HTMLButtonElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const btnDisconnect = document.getElementById('btn-disconnect') as HTMLButtonElement;
const btnDisconnectConfirm = document.getElementById('btn-disconnect-confirm') as HTMLButtonElement;
const btnDisconnectCancel = document.getElementById('btn-disconnect-cancel') as HTMLButtonElement;
const disconnectModal = document.getElementById('disconnect-modal')!;
const btnClearHistory = document.getElementById('btn-clear-history') as HTMLButtonElement;
const historyList = document.getElementById('activity-history-list')!;
const historyEmpty = document.getElementById('activity-history-empty')!;
const testResult = document.getElementById('test-result')!;
const statusBar = document.getElementById('status-bar')!;
const statusIcon = document.getElementById('status-icon')!;
const statusText = document.getElementById('status-text')!;
const demoCheckbox = document.getElementById('demo-mode') as HTMLInputElement;
let disconnectTrigger: HTMLElement | null = null;

type AuditAction =
  | 'credentials_saved'
  | 'credentials_removed'
  | 'alias_created'
  | 'alias_updated'
  | 'alias_deleted'
  | 'password_generated'
  | 'sieve_created'
  | 'sieve_updated'
  | 'sieve_deleted'
  | 'sieve_activated';

interface AuditEvent {
  id: string;
  timestamp: string;
  action: AuditAction;
  status: 'success' | 'failure';
  target: string;
  statusCode?: number;
  errorCategory?: 'authentication' | 'network' | 'rate_limited' | 'request' | 'server';
}

const auditActionKeys: Record<AuditAction, string> = {
  credentials_saved: 'auditActionCredentialsSaved',
  credentials_removed: 'auditActionCredentialsRemoved',
  alias_created: 'auditActionAliasCreated',
  alias_updated: 'auditActionAliasUpdated',
  alias_deleted: 'auditActionAliasDeleted',
  password_generated: 'auditActionPasswordGenerated',
  sieve_created: 'auditActionSieveCreated',
  sieve_updated: 'auditActionSieveUpdated',
  sieve_deleted: 'auditActionSieveDeleted',
  sieve_activated: 'auditActionSieveActivated',
};

/* ---- i18n ---- */
function applyI18n(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const msg = browser.i18n.getMessage(el.dataset.i18n!);
    if (msg) el.textContent = msg;
  }
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const msg = browser.i18n.getMessage(el.dataset.i18nPlaceholder!);
    if (msg) el.placeholder = msg;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const msg = browser.i18n.getMessage(el.dataset.i18nTitle!);
    if (msg) el.title = msg;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    const msg = browser.i18n.getMessage(el.dataset.i18nAriaLabel!);
    if (msg) el.setAttribute('aria-label', msg);
  }
}

/* ---- Load saved state ---- */
async function init(): Promise<void> {
  applyI18n();
  const { apiToken, accountEmail, accountPlan } = await browser.storage.local.get([
    'apiToken',
    'accountEmail',
    'accountPlan',
  ]);
  if (apiToken) {
    tokenInput.value = apiToken as string;
    btnDisconnect.classList.remove('hidden');
    if (accountEmail) {
      showStatus('success', `${accountEmail} (${accountPlan || 'Free'})`);
    }
  }
  await loadAuditEvents();
}

/* ---- Show/hide token ---- */
toggleBtn.addEventListener('click', () => {
  const showing = tokenInput.type === 'text';
  tokenInput.type = showing ? 'password' : 'text';
  eyeIcon.textContent = showing ? '\u{1f441}' : '\u{1f441}\u{200d}\u{1f5e8}';
});

/* ---- Test connection ---- */
btnTest.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    showTestResult('error', browser.i18n.getMessage('errorNoToken') || 'Please enter a token.');
    return;
  }

  btnTest.disabled = true;
  btnTest.textContent = browser.i18n.getMessage('btnTesting') || 'Testing\u2026';
  hideTestResult();

  try {
    const res = await browser.runtime.sendMessage({ type: 'testConnection', token });
    if (res.error) {
      const msg = res.status === 401
        ? browser.i18n.getMessage('errorInvalidToken') || 'Invalid API token.'
        : res.error;
      showTestResult('error', msg);
    } else {
      const account = res.data as { email?: string; plan?: string };
      const email = account.email || '?';
      const plan = account.plan || 'Free';
      showTestResult('success', `${browser.i18n.getMessage('testSuccess') || 'Connected as'} ${email} (${plan})`);
    }
  } catch (error) {
    showTestResult('error', error instanceof Error ? error.message : browser.i18n.getMessage('errorUnknown'));
  } finally {
    btnTest.disabled = false;
    btnTest.textContent = browser.i18n.getMessage('btnTestConnection') || 'Test Connection';
  }
});

/* ---- Save ---- */
btnSave.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    showTestResult('error', browser.i18n.getMessage('errorNoToken') || 'Please enter a token.');
    return;
  }

  btnSave.disabled = true;

  try {
    const res = await browser.runtime.sendMessage({ type: 'testConnection', token });
    if (res.error) {
      const msg = res.status === 401
        ? browser.i18n.getMessage('errorInvalidToken') || 'Invalid API token.'
        : res.error;
      showTestResult('error', msg);
      return;
    }

    const account = res.data as { email?: string; plan?: string };
    const email = account.email || '';
    const plan = account.plan || 'Free';
    const saveResult = await browser.runtime.sendMessage({ type: 'saveCredentials', token, email, plan });
    if (saveResult.error) {
      showTestResult('error', saveResult.error);
      return;
    }

    btnDisconnect.classList.remove('hidden');
    showStatus('success', `${email} (${plan})`);
    showTestResult('success', browser.i18n.getMessage('savedOk') || 'Settings saved.');
    await loadAuditEvents();
  } catch (error) {
    showTestResult('error', error instanceof Error ? error.message : browser.i18n.getMessage('errorUnknown'));
  } finally {
    btnSave.disabled = false;
  }
});

/* ---- Disconnect ---- */
function openDisconnectDialog(): void {
  disconnectTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  disconnectModal.classList.remove('hidden');
  btnDisconnectCancel.focus();
}

function closeDisconnectDialog(): void {
  disconnectModal.classList.add('hidden');
  if (disconnectTrigger?.isConnected) disconnectTrigger.focus();
  disconnectTrigger = null;
}

btnDisconnect.addEventListener('click', openDisconnectDialog);
btnDisconnectCancel.addEventListener('click', closeDisconnectDialog);
btnDisconnectConfirm.addEventListener('click', async () => {
  btnDisconnectConfirm.disabled = true;
  try {
    const result = await browser.runtime.sendMessage({ type: 'removeCredentials' });
    if (result.error) {
      showTestResult('error', result.error);
      return;
    }
    tokenInput.value = '';
    btnDisconnect.classList.add('hidden');
    statusBar.classList.add('hidden');
    closeDisconnectDialog();
    showTestResult('success', browser.i18n.getMessage('disconnectSuccess') || 'Disconnected.');
    await loadAuditEvents();
  } catch (error) {
    showTestResult('error', error instanceof Error ? error.message : browser.i18n.getMessage('errorUnknown'));
  } finally {
    btnDisconnectConfirm.disabled = false;
  }
});

disconnectModal.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDisconnectDialog();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = Array.from(disconnectModal.querySelectorAll<HTMLElement>('button:not([disabled])'));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

/* ---- Activity history ---- */
async function loadAuditEvents(): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'getAuditEvents' });
    if (response.error) {
      showTestResult('error', response.error);
      return;
    }
    renderAuditEvents(Array.isArray(response.data) ? response.data as AuditEvent[] : []);
  } catch (error) {
    showTestResult('error', error instanceof Error ? error.message : browser.i18n.getMessage('errorUnknown'));
  }
}

function renderAuditEvents(events: AuditEvent[]): void {
  historyList.replaceChildren();
  historyList.classList.toggle('hidden', events.length === 0);
  historyEmpty.classList.toggle('hidden', events.length > 0);
  btnClearHistory.disabled = events.length === 0;

  for (const event of events) {
    const item = document.createElement('li');
    const action = document.createElement('strong');
    const actionKey = auditActionKeys[event.action] || 'auditActionUnknown';
    action.textContent = browser.i18n.getMessage(actionKey) || browser.i18n.getMessage('auditActionUnknown');
    item.appendChild(action);

    if (event.target) {
      item.appendChild(document.createTextNode(` — ${event.target}`));
    }

    const meta = document.createElement('span');
    meta.className = 'event-meta';
    const statusKey = event.status === 'success' ? 'auditStatusSuccess' : 'auditStatusFailure';
    const timestamp = Number.isNaN(Date.parse(event.timestamp)) ? '' : new Date(event.timestamp).toLocaleString();
    const details: string[] = [browser.i18n.getMessage(statusKey), timestamp].filter(Boolean);
    if (event.errorCategory) {
      const categoryKey = `auditError${event.errorCategory.replace(/(^|_)(\w)/g, (_, __, letter: string) => letter.toUpperCase())}`;
      details.push(browser.i18n.getMessage(categoryKey) || browser.i18n.getMessage('auditErrorUnknown'));
    }
    if (event.statusCode) details.push(String(event.statusCode));
    meta.textContent = details.join(' · ');
    item.appendChild(meta);
    historyList.appendChild(item);
  }
}

btnClearHistory.addEventListener('click', async () => {
  btnClearHistory.disabled = true;
  try {
    const response = await browser.runtime.sendMessage({ type: 'clearAuditEvents' });
    if (response.error) {
      showTestResult('error', response.error);
      return;
    }
    renderAuditEvents([]);
    showTestResult('success', browser.i18n.getMessage('historyCleared') || 'Activity history cleared.');
  } catch (error) {
    showTestResult('error', error instanceof Error ? error.message : browser.i18n.getMessage('errorUnknown'));
  } finally {
    if (historyList.childElementCount > 0) btnClearHistory.disabled = false;
  }
});

/* ---- Helpers ---- */
function showTestResult(type: 'success' | 'error', message: string): void {
  testResult.className = `test-result ${type}`;
  testResult.textContent = type === 'success' ? `\u2714 ${message}` : `\u2716 ${message}`;
  testResult.classList.remove('hidden');
}

function hideTestResult(): void {
  testResult.classList.add('hidden');
}

function showStatus(type: 'success' | 'error', message: string): void {
  statusBar.className = `status-bar ${type}`;
  statusIcon.textContent = type === 'success' ? '\u2714' : '';
  statusText.textContent = `${browser.i18n.getMessage('connectedAs') || 'Connected as'} ${message}`;
  statusBar.classList.remove('hidden');
}

/* ---- Demo mode ---- */
async function loadDemoState(): Promise<void> {
  try {
    const res = await browser.runtime.sendMessage({ type: 'getDemoMode' });
    demoCheckbox.checked = res.data?.demoMode ?? false;
  } catch (error) {
    showTestResult('error', error instanceof Error ? error.message : browser.i18n.getMessage('errorUnknown'));
  }
}

demoCheckbox.addEventListener('change', async () => {
  try {
    const result = await browser.runtime.sendMessage({ type: 'setDemoMode', enabled: demoCheckbox.checked });
    if (result.error) {
      demoCheckbox.checked = !demoCheckbox.checked;
      showTestResult('error', result.error);
    }
  } catch (error) {
    demoCheckbox.checked = !demoCheckbox.checked;
    showTestResult('error', error instanceof Error ? error.message : browser.i18n.getMessage('errorUnknown'));
  }
});

init();
loadDemoState();
