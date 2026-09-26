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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl || tab.url;
  if (!targetUrl) return;

  const stored = await chrome.storage.sync.get([KEYS.API_BASE, KEYS.AUTH_TOKEN]);
  const apiBase = stored[KEYS.API_BASE] || 'http://localhost:3001';
  const token = stored[KEYS.AUTH_TOKEN];

  if (!token) {
    chrome.tabs.create({ url: `${apiBase}/auth/signin?ref=extension` });
    return;
  }

  try {
    // Scrape
    const scrapeRes = await fetch(`${apiBase}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: targetUrl }),
      signal: AbortSignal.timeout(8000),
    });
    const scrapeData = await scrapeRes.json();
    const meta = scrapeData.metadata || {};

    // Save
    const saveRes = await fetch(`${apiBase}/api/save-from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: meta.title || tab.title || targetUrl,
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
        message: (meta.title || targetUrl).slice(0, 80),
        priority: 1,
      });
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
  }
});

// ─── Auth Token Capture ───────────────────────────────────────────────────────
// When user logs into Keeva app, it can call postMessage with token
// OR the Keeva app can set the token in localStorage which we read via content script

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
    chrome.storage.sync.get([KEYS.AUTH_TOKEN], (result) => {
      sendResponse({ token: result[KEYS.AUTH_TOKEN] || null });
    });
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