// Keeva Browser Extension - Popup Script

const API_BASE_KEY = 'apiBase';
const AUTH_TOKEN_KEY = 'authToken';
const SETTINGS_KEY = 'settings';

let currentTab = null;
let pageMetadata = null;

async function init() {
  currentTab = await getCurrentTab();
  await loadSettings();
  await checkAuth();
  await loadPageMetadata();
  setupEventListeners();
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadSettings() {
  const { [API_BASE_KEY]: apiBase, [SETTINGS_KEY]: settings } = await chrome.storage.sync.get([API_BASE_KEY, SETTINGS_KEY]);
  document.getElementById('apiBase').value = apiBase || 'http://localhost:3000';
  if (settings) {
    document.getElementById('autoDetect').checked = settings.autoDetect !== false;
    document.getElementById('showNotifs').checked = settings.showNotifs !== false;
  }
}

async function saveSettings() {
  const settings = {
    autoDetect: document.getElementById('autoDetect').checked,
    showNotifs: document.getElementById('showNotifs').checked
  };
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings, [API_BASE_KEY]: document.getElementById('apiBase').value });
}

async function checkAuth() {
  const { [AUTH_TOKEN_KEY]: token } = await chrome.storage.sync.get(AUTH_TOKEN_KEY);
  const unauthDiv = document.getElementById('unauthenticated');
  const authDiv = document.getElementById('authenticated');

  if (token) {
    // Verify token with backend
    try {
      const apiBase = document.getElementById('apiBase').value || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        unauthDiv.classList.add('hidden');
        authDiv.classList.remove('hidden');
        document.getElementById('userEmail').textContent = data.user?.email || 'Connected';
        document.getElementById('avatar').textContent = (data.user?.email?.[0] || 'K').toUpperCase();
        return;
      }
    } catch (e) {
      console.warn('Auth check failed:', e);
    }
    // Token invalid
    await chrome.storage.sync.remove(AUTH_TOKEN_KEY);
  }
  unauthDiv.classList.remove('hidden');
  authDiv.classList.add('hidden');
}

async function loadPageMetadata() {
  if (!currentTab) return;

  try {
    // Try to get from content script first
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_PAGE_METADATA' });
    if (response?.success && response.metadata) {
      pageMetadata = response.metadata;
      renderPageInfo(response.metadata);
      checkForVideo(response.metadata);
      return;
    }
  } catch (e) {
    // Content script not ready, fallback
  }

  // Fallback: basic metadata from tab
  pageMetadata = {
    url: currentTab.url,
    title: currentTab.title,
    platform: detectPlatform(currentTab.url)
  };
  renderPageInfo(pageMetadata);
  checkForVideo(pageMetadata);
}

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('instagram.com/reel') || u.includes('instagram.com/p/')) return 'Instagram';
  if (u.includes('youtube.com/shorts') || (u.includes('youtu.be') && u.includes('shorts'))) return 'YouTube Shorts';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('linkedin.com')) return 'LinkedIn';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X';
  if (u.match(/\.(pdf|doc|docx|ppt|pptx)(\?|$)/)) return 'PDF';
  return 'Web';
}

function renderPageInfo(meta) {
  const section = document.getElementById('pageInfo');
  section.classList.remove('hidden');

  document.getElementById('pageTitle').textContent = meta.title || 'Untitled';
  document.getElementById('pagePlatform').textContent = meta.platform || 'Web';

  const tagsContainer = document.getElementById('pageTags');
  tagsContainer.innerHTML = '';

  const platformBadge = document.createElement('span');
  platformBadge.className = 'badge ' + getPlatformBadgeClass(meta.platform);
  platformBadge.textContent = meta.platform || 'Web';
  tagsContainer.appendChild(platformBadge);

  if (meta.thumbnail_url) {
    document.getElementById('thumbImg').src = meta.thumbnail_url;
    document.getElementById('thumbImg').classList.remove('hidden');
    document.getElementById('thumbFallback').classList.add('hidden');
  }
}

function getPlatformBadgeClass(platform) {
  const p = (platform || '').toLowerCase();
  if (p.includes('instagram')) return 'badge-rose';
  if (p.includes('youtube')) return 'badge-amber';
  if (p.includes('tiktok')) return 'badge-cyan';
  if (p.includes('linkedin')) return 'badge-emerald';
  if (p.includes('pdf')) return 'badge-rose';
  return 'badge-cyan';
}

function checkForVideo(meta) {
  const videoSection = document.getElementById('videoSection');
  const isVideoPlatform = ['Instagram', 'YouTube', 'YouTube Shorts', 'TikTok'].includes(meta.platform);
  const hasVideoElement = meta.videoElements?.length > 0 || meta.youtube_id;

  if (isVideoPlatform || hasVideoElement) {
    videoSection.classList.remove('hidden');
  }

  // Always show quick save
  document.getElementById('quickSaveSection').classList.remove('hidden');
}

function setupEventListeners() {
  // Login
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const apiBase = document.getElementById('apiBase').value || 'http://localhost:3000';
    chrome.tabs.create({ url: `${apiBase}/auth/signin?extension=true` });
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await chrome.storage.sync.remove(AUTH_TOKEN_KEY);
    checkAuth();
  });

  // Save current page
  document.getElementById('savePageBtn').addEventListener('click', async () => {
    await saveCurrentPage();
  });

  // Save as PDF
  document.getElementById('saveAsPdfBtn').addEventListener('click', async () => {
    await saveCurrentPage({ asPdf: true });
  });

  // Save video
  document.getElementById('saveVideoBtn').addEventListener('click', async () => {
    await saveVideo();
  });

  // Get transcript
  document.getElementById('getTranscriptBtn').addEventListener('click', async () => {
    await getTranscript();
  });

  // Settings
  document.getElementById('apiBase').addEventListener('change', saveSettings);
  document.getElementById('autoDetect').addEventListener('change', saveSettings);
  document.getElementById('showNotifs').addEventListener('change', saveSettings);

  // Listen for auth changes from other tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[AUTH_TOKEN_KEY]) {
      checkAuth();
    }
  });
}

async function saveCurrentPage(options = {}) {
  const btn = document.getElementById('savePageBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const apiBase = document.getElementById('apiBase').value || 'http://localhost:3000';
    const { [AUTH_TOKEN_KEY]: token } = await chrome.storage.sync.get(AUTH_TOKEN_KEY);

    if (!token) throw new Error('Not authenticated');

    const title = document.getElementById('customTitle').value || pageMetadata?.title || currentTab.title;
    const url = currentTab.url;

    // First scrape for metadata
    const scrapeRes = await fetch(`${apiBase}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url })
    });
    const scrapeData = await scrapeRes.json();

    let meta = scrapeData.metadata || {};
    if (options.asPdf) {
      meta.media_type = 'DOCUMENT';
      meta.aspect_ratio = 'STANDARD_DOCUMENT';
    }

    const saveRes = await fetch(`${apiBase}/api/save-from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: meta.title || title,
        source_url: meta.source_url || url,
        platform: meta.platform || detectPlatform(url),
        media_type: meta.media_type || 'ARTICLE',
        aspect_ratio: meta.aspect_ratio || 'LANDSCAPE_16_9',
        thumbnail_url: meta.thumbnail_url || null,
        priority: meta.autoPriority || 'HIGH',
        description: meta.description || '',
        tags: meta.autoTags || [],
        category_name: meta.autoCategoryName || ''
      })
    });

    const saveData = await saveRes.json();
    if (saveData.success) {
      showToast('Saved to Keeva Vault!', 'success');
      document.getElementById('customTitle').value = '';
    } else {
      showToast('Save failed: ' + (saveData.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function saveVideo() {
  const btn = document.getElementById('saveVideoBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Saving...';
  btn.disabled = true;

  try {
    const apiBase = document.getElementById('apiBase').value || 'http://localhost:3000';
    const { [AUTH_TOKEN_KEY]: token } = await chrome.storage.sync.get(AUTH_TOKEN_KEY);
    if (!token) throw new Error('Not authenticated');

    const url = currentTab.url;

    const scrapeRes = await fetch(`${apiBase}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url })
    });
    const scrapeData = await scrapeRes.json();

    if (!scrapeData.success) throw new Error(scrapeData.error || 'Scraping failed');

    const meta = scrapeData.metadata;
    const saveRes = await fetch(`${apiBase}/api/save-from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: meta.title || currentTab.title,
        source_url: meta.source_url || url,
        platform: meta.platform || detectPlatform(url),
        media_type: 'REEL',
        aspect_ratio: 'PORTRAIT_9_16',
        thumbnail_url: meta.thumbnail_url || null,
        priority: meta.autoPriority || 'MUST_LEARN',
        description: meta.description || '',
        tags: meta.autoTags || [],
        category_name: meta.autoCategoryName || ''
      })
    });

    const saveData = await saveRes.json();
    if (saveData.success) {
      showToast('Video saved to Keeva!', 'success');
    } else {
      showToast('Save failed: ' + (saveData.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function getTranscript() {
  const btn = document.getElementById('getTranscriptBtn');
  const statusEl = document.getElementById('transcriptStatus');
  const originalText = btn.innerHTML;

  btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...';
  btn.disabled = true;
  statusEl.classList.remove('hidden');
  statusEl.textContent = 'Calling AI transcription...';
  statusEl.className = 'text-[10px] text-cyan-400 text-center';

  try {
    const apiBase = document.getElementById('apiBase').value || 'http://localhost:3000';
    const { [AUTH_TOKEN_KEY]: token } = await chrome.storage.sync.get(AUTH_TOKEN_KEY);
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${apiBase}/api/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ videoUrl: currentTab.url })
    });

    const data = await response.json();

    if (data.success) {
      statusEl.textContent = `Transcript ready! ${data.segments?.length || 0} segments`;
      statusEl.className = 'text-[10px] text-emerald-400 text-center';
      showToast('Transcript generated! Check your vault.', 'success');
    } else {
      statusEl.textContent = 'Failed: ' + (data.error || 'Unknown error');
      statusEl.className = 'text-[10px] text-rose-400 text-center';
      showToast('Transcript failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.className = 'text-[10px] text-rose-400 text-center';
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function showToast(message, type = 'info') {
  const { showNotifs } = JSON.parse(localStorage.getItem('keeva_settings') || '{}');
  if (showNotifs === false) return;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Keeva Vault',
    message,
    priority: type === 'error' ? 2 : 1
  });
}

// Handle messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTH_CHANGED') {
    checkAuth();
  }
});

init();