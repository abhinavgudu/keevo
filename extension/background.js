// Keeva Chrome Extension — background.js (Service Worker)
// Handles: context menus, auth token capture, cross-tab messaging

const KEYS = {
  API_BASE: 'keeva_api_base',
  AUTH_TOKEN: 'keeva_auth_token',
  USER_EMAIL: 'keeva_user_email',
};

// ─── Context Menu Setup ──────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Remove existing menus first
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-to-keeva',
      title: '⚡ Save to Keeva',
      contexts: ['page', 'link', 'video', 'image'],
    });
    chrome.contextMenus.create({
      id: 'save-link-to-keeva',
      title: '🔗 Save This Link to Keeva',
      contexts: ['link'],
    });
  });
});

// ─── Save Helper ─────────────────────────────────────────────────────────────

async function saveUrlToVault(targetUrl, fallbackTitle = '') {
  const stored = await chrome.storage.sync.get([KEYS.API_BASE, KEYS.AUTH_TOKEN]);
  const apiBase = stored[KEYS.API_BASE] || 'https://keeva0.vercel.app';
  const token = stored[KEYS.AUTH_TOKEN];

  if (!token) {
    return { success: false, needAuth: true, loginUrl: `${apiBase}/auth/signin?ref=extension` };
  }

  try {
    // Scrape metadata
    let meta = {};
    try {
      const scrapeRes = await fetch(`${apiBase}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: targetUrl }),
        signal: AbortSignal.timeout(8000),
      });
      const scrapeData = await scrapeRes.json();
      meta = scrapeData.metadata || {};
    } catch (e) {
      console.warn('Scrape fallback:', e);
    }

    // Save
    const saveRes = await fetch(`${apiBase}/api/save-from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: meta.title || fallbackTitle || targetUrl,
        source_url: meta.source_url || targetUrl,
        platform: meta.platform || 'Web',
        media_type: meta.media_type || 'ARTICLE',
        aspect_ratio: meta.aspect_ratio || 'LANDSCAPE_16_9',
        thumbnail_url: meta.thumbnail_url || null,
        priority: meta.autoPriority || 'HIGH',
        description: meta.description || '',
        tags: meta.autoTags || [],
        category_name: meta.autoCategoryName || '',
      }),
      signal: AbortSignal.timeout(10000),
    });

    const saveData = await saveRes.json();

    if (saveData.success || saveRes.ok) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '✓ Saved to Keeva!',
        message: (meta.title || fallbackTitle || targetUrl).slice(0, 80),
        priority: 1,
      });
      return { success: true, title: meta.title || fallbackTitle || targetUrl };
    } else {
      throw new Error(saveData.error || 'Save failed');
    }
  } catch (err) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Keeva — Save Failed',
      message: err.message.slice(0, 100),
      priority: 2,
    });
    return { success: false, error: err.message };
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl || tab?.url;
  if (!targetUrl) return;

  const result = await saveUrlToVault(targetUrl, tab?.title || '');
  if (result.needAuth) {
    const stored = await chrome.storage.sync.get([KEYS.API_BASE]);
    const apiBase = stored[KEYS.API_BASE] || 'https://keeva0.vercel.app';
    chrome.tabs.create({ url: `${apiBase}/auth/signin?ref=extension` });
  }
});

// ─── Auth Token & Message Handling ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'KEEVA_AUTH_TOKEN') {
    const { token, email } = message;
    chrome.storage.sync.set({
      [KEYS.AUTH_TOKEN]: token,
      [KEYS.USER_EMAIL]: email || '',
    }, () => {
      sendResponse({ success: true });
    });
    return true; // keep channel open
  }

  if (message.type === 'KEEVA_LOGOUT') {
    chrome.storage.sync.remove([KEYS.AUTH_TOKEN, KEYS.USER_EMAIL], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_TOKEN') {
    chrome.storage.sync.get([KEYS.AUTH_TOKEN, KEYS.API_BASE], (result) => {
      sendResponse({
        token: result[KEYS.AUTH_TOKEN] || null,
        apiBase: result[KEYS.API_BASE] || 'https://keeva0.vercel.app',
      });
    });
    return true;
  }

  if (message.type === 'QUICK_SAVE_PAGE') {
    saveUrlToVault(message.url, message.title).then((res) => {
      sendResponse(res);
    });
    return true; // async response
  }

  if (message.type === 'OPEN_LOGIN_TAB') {
    chrome.storage.sync.get([KEYS.API_BASE], (res) => {
      const apiBase = res[KEYS.API_BASE] || 'https://keeva0.vercel.app';
      chrome.tabs.create({ url: `${apiBase}/auth/signin?ref=extension` });
    });
    sendResponse({ success: true });
    return true;
  }
});

// ─── Tab Navigation Listener ──────────────────────────────────────────────────
// Update badge/icon when on a saveable page

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;

  const stored = await chrome.storage.sync.get([KEYS.AUTH_TOKEN]);
  const isLoggedIn = !!stored[KEYS.AUTH_TOKEN];

  // Show badge dot if logged in
  if (isLoggedIn) {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#00E5FF', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});