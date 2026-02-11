const tokenInput = document.getElementById('api-token');
const toggleBtn = document.getElementById('toggle-visibility');
const eyeIcon = document.getElementById('eye-icon');
const btnTest = document.getElementById('btn-test');
const btnSave = document.getElementById('btn-save');
const testResult = document.getElementById('test-result');
const statusBar = document.getElementById('status-bar');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');

/* ---- i18n ---- */
function applyI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const msg = browser.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const msg = browser.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  }
}

/* ---- Load saved state ---- */
async function init() {
  applyI18n();
  const { apiToken, accountEmail, accountPlan } = await browser.storage.local.get([
    'apiToken',
    'accountEmail',
    'accountPlan',
  ]);
  if (apiToken) {
    tokenInput.value = apiToken;
    if (accountEmail) {
      showStatus('success', `${accountEmail} (${accountPlan || 'Free'})`);
    }
  }
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
      const msg =
        res.status === 401
          ? browser.i18n.getMessage('errorInvalidToken') || 'Invalid API token.'
          : res.error;
      showTestResult('error', msg);
    } else {
      const email = res.data.email || '?';
      const plan = res.data.plan || 'Free';
      showTestResult('success', `${browser.i18n.getMessage('testSuccess') || 'Connected as'} ${email} (${plan})`);
    }
  } catch (err) {
    showTestResult('error', err.message);
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
    // Validate before saving
    const res = await browser.runtime.sendMessage({ type: 'testConnection', token });
    if (res.error) {
      const msg =
        res.status === 401
          ? browser.i18n.getMessage('errorInvalidToken') || 'Invalid API token.'
          : res.error;
      showTestResult('error', msg);
      return;
    }

    const email = res.data.email || '';
    const plan = res.data.plan || 'Free';

    await browser.storage.local.set({
      apiToken: token,
      accountEmail: email,
      accountPlan: plan,
    });

    showStatus('success', `${email} (${plan})`);
    showTestResult('success', browser.i18n.getMessage('savedOk') || 'Settings saved.');
  } catch (err) {
    showTestResult('error', err.message);
  } finally {
    btnSave.disabled = false;
  }
});

/* ---- Helpers ---- */
function showTestResult(type, message) {
  testResult.className = `test-result ${type}`;
  testResult.textContent = type === 'success' ? `\u2714 ${message}` : `\u2716 ${message}`;
  testResult.classList.remove('hidden');
}

function hideTestResult() {
  testResult.classList.add('hidden');
}

function showStatus(type, message) {
  statusBar.className = `status-bar ${type}`;
  statusIcon.textContent = type === 'success' ? '\u2714' : '';
  statusText.textContent = `${browser.i18n.getMessage('connectedAs') || 'Connected as'} ${message}`;
  statusBar.classList.remove('hidden');
}

init();
