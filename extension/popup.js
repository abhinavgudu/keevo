// Keeva Chrome Extension — popup.js v2.0
// Clean, fast, reliable

const KEYS = {
  API_BASE: 'keeva_api_base',
  AUTH_TOKEN: 'keeva_auth_token',
  USER_EMAIL: 'keeva_user_email',
  SETTINGS: 'keeva_settings',
};

let currentTab = null;
let scrapedMeta = null;
let isSaving = false;

// ─── Utility ────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function showToast(msg, type = 'info', duration = 2800) {
  const el = $('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, duration);
}

function detectPlatform(url = '') {
  const u = url.toLowerCase();
  if (u.includes('instagram.com/reel') || u.includes('instagram.com/p/') || u.includes('instagr.am')) return 'Instagram';
  if (u.includes('youtube.com/shorts') || (u.includes('youtu.be') && u.includes('shorts'))) return 'YouTube Shorts';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('linkedin.com')) return 'LinkedIn';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X';
  if (u.match(/\.(pdf|doc|docx|ppt|pptx)(\?|$)/i) || u.includes('arxiv.org')) return 'PDF';
  return 'Web';
}

function getPlatformTagClass(platform = '') {
  const p = platform.toLowerCase();
  if (p.includes('instagram')) return 'tag-instagram';
  if (p.includes('youtube')) return 'tag-youtube';
  if (p.includes('tiktok')) return 'tag-tiktok';
  if (p.includes('linkedin')) return 'tag-linkedin';
  if (p.includes('pdf')) return 'tag-pdf';
  return 'tag-web';
}

function addTag(container, text, className) {
  if (!text) return;
  const span = document.createElement('span');
  span.className = `tag ${className}`;
  span.textContent = text;
  container.appendChild(span);
}

async function getStorage(keys) {
  return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
}

async function setStorage(obj) {
  return new Promise(resolve => chrome.storage.sync.set(obj, resolve));
}

async function removeStorage(keys) {
  return new Promise(resolve => chrome.storage.sync.remove(keys, resolve));
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  // Load settings
  const stored = await getStorage([KEYS.API_BASE, KEYS.AUTH_TOKEN, KEYS.USER_EMAIL, KEYS.SETTINGS]);
  const apiBase = stored[KEYS.API_BASE] || 'https://keeva0.vercel.app';
  const token = stored[KEYS.AUTH_TOKEN];
  const email = stored[KEYS.USER_EMAIL];
  const settings = stored[KEYS.SETTINGS] || { autoDetect: true, showNotifs: true };

  // Populate settings UI
  $('apiBaseInput').value = apiBase;
  $('autoDetectToggle').checked = settings.autoDetect !== false;
  $('showNotifsToggle').checked = settings.showNotifs !== false;

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Set footer link
  $('footerLink').href = apiBase;
  $('footerLink').target = '_blank';

  if (token) {
    await initAuthenticatedView(token, email, apiBase);
  } else {
    initUnauthView(apiBase);
  }

  setupListeners(apiBase, token, settings);
}

// ─── Auth Views ───────────────────────────────────────────────────────────────

function initUnauthView(apiBase) {
  $('statusDot').className = 'status-dot disconnected';
  $('statusText').textContent = 'Not connected';
  $('unauthState').classList.remove('hidden');
  $('authState').classList.add('hidden');
}

async function initAuthenticatedView(token, email, apiBase) {
  // Verify token quickly (non-blocking)
  try {
    const res = await fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error('Invalid token');
    const data = await res.json();
    const userEmail = data.user?.email || email || 'Connected';
    await setStorage({ [KEYS.USER_EMAIL]: userEmail });
    showConnected(userEmail);
    await loadCurrentPageMeta(token, apiBase);
    return;
  } catch {
    // Token invalid or network error
    await removeStorage([KEYS.AUTH_TOKEN, KEYS.USER_EMAIL]);
    initUnauthView(apiBase);
    showToast('Session expired — please login again', 'error');
  }
}

function showConnected(email) {
  $('statusDot').className = 'status-dot connected';
  $('statusText').textContent = '';
  $('statusEmail').textContent = email;
  $('statusEmail').classList.remove('hidden');
  $('logoutMini').classList.remove('hidden');
  $('unauthState').classList.add('hidden');
  $('authState').classList.remove('hidden');
}

// ─── Page Metadata ────────────────────────────────────────────────────────────

async function loadCurrentPageMeta(token, apiBase) {
  if (!currentTab) return;

  const url = currentTab.url;
  const platform = detectPlatform(url);

  // Show skeleton immediately
  $('pageTitle').textContent = currentTab.title?.slice(0, 80) || 'Loading...';
  $('pageUrl').textContent = url?.slice(0, 60) || '';
  $('saveBtn').disabled = true;
  $('saveBtnText').textContent = 'Fetching metadata...';

  // Show fetch indicator
  $('fetchState').classList.remove('hidden');
  $('fetchText').textContent = `Detecting ${platform} content...`;

  try {
    const res = await fetch(`${apiBase}/api/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json();
    scrapedMeta = data.metadata || {};

    renderPageCard(scrapedMeta, url);
  } catch (err) {
    // Fallback with basic tab info
    scrapedMeta = {
      title: currentTab.title || url,
      source_url: url,
      platform,
      media_type: 'ARTICLE',
      aspect_ratio: 'LANDSCAPE_16_9',
      thumbnail_url: null,
      autoPriority: 'HIGH',
      autoTags: [],
    };
    renderPageCard(scrapedMeta, url);
  } finally {
    $('fetchState').classList.add('hidden');
    $('saveBtn').disabled = false;
    $('saveBtnText').textContent = 'Save to Keeva Vault ⚡';
  }
}

function renderPageCard(meta, fallbackUrl) {
  const title = meta.title || fallbackUrl || 'Untitled';
  const platform = meta.platform || detectPlatform(fallbackUrl);
  const url = meta.source_url || fallbackUrl;

  $('pageTitle').textContent = title.slice(0, 100);
  $('pageUrl').textContent = url?.replace(/^https?:\/\//, '').slice(0, 55) || '';

  // Thumbnail
  if (meta.thumbnail_url) {
    const img = $('thumbImg');
    img.src = meta.thumbnail_url;
    img.style.display = 'block';
    $('thumbFallback').style.display = 'none';
  }

  // Tags
  const tagsRow = $('tagsRow');
  tagsRow.innerHTML = '';
  addTag(tagsRow, platform, getPlatformTagClass(platform));
  if (meta.autoCategoryName) addTag(tagsRow, meta.autoCategoryName, 'tag-category');
  if (meta.autoPriority) addTag(tagsRow, meta.autoPriority.replace('_', ' '), 'tag-priority');
  (meta.autoTags || []).slice(0, 2).forEach(t => addTag(tagsRow, `#${t}`, 'tag-web'));
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function saveToVault(token, apiBase) {
  if (isSaving || !currentTab) return;
  isSaving = true;

  const btn = $('saveBtn');
  const btnText = $('saveBtnText');
  btn.disabled = true;
  btnText.textContent = 'Saving...';

  try {
    const url = currentTab.url;
    const meta = scrapedMeta || {};

    const payload = {
      title: meta.title || currentTab.title || url,
      source_url: meta.source_url || url,
      platform: meta.platform || detectPlatform(url),
      media_type: meta.media_type || 'ARTICLE',
      aspect_ratio: meta.aspect_ratio || 'LANDSCAPE_16_9',
      thumbnail_url: meta.thumbnail_url || null,
      priority: meta.autoPriority || 'HIGH',
      description: meta.description || '',
      tags: meta.autoTags || [],
      category_name: meta.autoCategoryName || '',
    };

    const res = await fetch(`${apiBase}/api/save-from-extension`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();

    if (data.success || res.ok) {
      // Show success overlay
      $('successOverlay').classList.remove('hidden');
      $('successSub').textContent = meta.platform || 'Web';
      showToast('✓ Saved to Keeva!', 'success');

      // Auto-close popup after success
      setTimeout(() => window.close(), 1800);
    } else {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
    btn.disabled = false;
    btnText.textContent = 'Retry Save ↺';
  } finally {
    isSaving = false;
  }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

function setupListeners(apiBase, token, settings) {
  // Login
  $('loginBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: `${apiBase}/auth/signin?ref=extension` });
    window.close();
  });

  // Logout
  $('logoutMini')?.addEventListener('click', async () => {
    await removeStorage([KEYS.AUTH_TOKEN, KEYS.USER_EMAIL]);
    initUnauthView(apiBase);
    $('statusEmail').classList.add('hidden');
    $('logoutMini').classList.add('hidden');
    showToast('Logged out', 'info');
  });

  // Save button
  $('saveBtn')?.addEventListener('click', () => {
    saveToVault(token, apiBase);
  });

  // Open Vault
  $('openVaultBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: apiBase });
  });

  // Footer link
  $('footerLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: apiBase });
  });

  // Copy URL
  $('copyUrlBtn')?.addEventListener('click', async () => {
    if (currentTab?.url) {
      await navigator.clipboard.writeText(currentTab.url);
      showToast('URL copied!', 'success', 1500);
    }
  });

  // Settings toggle
  $('settingsToggle')?.addEventListener('click', () => {
    const panel = $('settingsPanel');
    const main = $('mainContent');
    const isOpen = panel.classList.contains('active');
    panel.classList.toggle('active', !isOpen);
    main.style.display = isOpen ? 'flex' : 'none';
  });

  // Save settings
  $('saveSettingsBtn')?.addEventListener('click', async () => {
    const newBase = $('apiBaseInput').value.trim().replace(/\/$/, '');
    const newSettings = {
      autoDetect: $('autoDetectToggle').checked,
      showNotifs: $('showNotifsToggle').checked,
    };
    await setStorage({ [KEYS.API_BASE]: newBase, [KEYS.SETTINGS]: newSettings });
    $('footerLink').href = newBase;
    showToast('Settings saved!', 'success');

    // Close settings
    $('settingsPanel').classList.remove('active');
    $('mainContent').style.display = 'flex';
  });

  // Listen for auth token set from other tabs (e.g. after login)
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'sync' && changes[KEYS.AUTH_TOKEN]?.newValue) {
      const newToken = changes[KEYS.AUTH_TOKEN].newValue;
      const stored = await getStorage([KEYS.API_BASE, KEYS.USER_EMAIL]);
      const base = stored[KEYS.API_BASE] || 'https://keeva0.vercel.app';
      const email = stored[KEYS.USER_EMAIL] || 'Connected';
      showConnected(email);
      await loadCurrentPageMeta(newToken, base);
      showToast('Connected to Keeva!', 'success');
    }
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init().catch(console.error);