// Keevo Browser Extension - Background Service Worker
// Handles context menus, API communication, and auth

const KEEVO_API_BASE = (async () => {
  const { apiBase } = await chrome.storage.sync.get('apiBase');
  return apiBase || 'http://localhost:3000';
})();

async function getApiBase() {
  const { apiBase } = await chrome.storage.sync.get('apiBase');
  return apiBase || 'http://localhost:3000';
}

async function getAuthToken() {
  const { authToken } = await chrome.storage.sync.get('authToken');
  return authToken;
}

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'keevo-save-link',
    title: 'Save to Keevo Vault',
    contexts: ['link', 'page', 'selection', 'video', 'audio'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });

  chrome.contextMenus.create({
    id: 'keevo-save-video',
    title: 'Save Video/Reel to Keevo',
    contexts: ['video'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });

  chrome.contextMenus.create({
    id: 'keevo-save-pdf',
    title: 'Save PDF/Document to Keevo',
    contexts: ['link'],
    targetUrlPatterns: ['*.pdf', '*.doc', '*.docx', '*.ppt', '*.pptx'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const apiBase = await getApiBase();
  const token = await getAuthToken();

  if (!token) {
    showNotification('Please login to Keevo first', 'error');
    chrome.action.openPopup();
    return;
  }

  let url = info.linkUrl || info.pageUrl || info.srcUrl || '';
  let title = info.selectionText || '';

  if (!url && tab?.url) url = tab.url;

  if (!url) {
    showNotification('No URL found to save', 'error');
    return;
  }

  try {
    showNotification('Saving to Keevo...', 'info');

    const response = await fetch(`${apiBase}/api/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (data.success && data.metadata) {
      const meta = data.metadata;
      const saveResponse = await fetch(`${apiBase}/api/save-from-extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: meta.title || title || url,
          source_url: meta.source_url || url,
          platform: meta.platform || 'Web',
          media_type: meta.media_type || 'ARTICLE',
          aspect_ratio: meta.aspect_ratio || 'LANDSCAPE_16_9',
          thumbnail_url: meta.thumbnail_url || null,
          priority: meta.autoPriority || 'HIGH',
          description: meta.description || '',
          tags: meta.autoTags || [],
          category_name: meta.autoCategoryName || ''
        })
      });

      const saveData = await saveResponse.json();

      if (saveData.success) {
        showNotification(`Saved: ${meta.title?.slice(0, 40)}...`, 'success');
      } else {
        showNotification('Save failed: ' + (saveData.error || 'Unknown error'), 'error');
      }
    } else {
      showNotification('Could not extract metadata', 'error');
    }
  } catch (err) {
    console.error('Keevo save error:', err);
    showNotification('Failed to save: ' + err.message, 'error');
  }
});

// Listen for messages from content script / popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_CURRENT_PAGE') {
    handleSaveCurrentPage(message.data).then(sendResponse);
    return true; // async response
  }
  if (message.type === 'CHECK_AUTH') {
    getAuthToken().then(token => sendResponse({ authenticated: !!token }));
    return true;
  }
  if (message.type === 'GET_TRANSCRIPT') {
    handleGetTranscript(message.videoUrl).then(sendResponse);
    return true;
  }
});

async function handleSaveCurrentPage(data) {
  const apiBase = await getApiBase();
  const token = await getAuthToken();

  if (!token) return { success: false, error: 'Not authenticated' };

  try {
    const response = await fetch(`${apiBase}/api/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ url: data.url })
    });

    const result = await response.json();
    if (!result.success) return { success: false, error: result.error };

    const meta = result.metadata;
    const saveResponse = await fetch(`${apiBase}/api/save-from-extension`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: meta.title || data.title || data.url,
        source_url: meta.source_url || data.url,
        platform: meta.platform || 'Web',
        media_type: meta.media_type || 'ARTICLE',
        aspect_ratio: meta.aspect_ratio || 'LANDSCAPE_16_9',
        thumbnail_url: meta.thumbnail_url || null,
        priority: meta.autoPriority || 'HIGH',
        description: meta.description || '',
        tags: meta.autoTags || [],
        category_name: meta.autoCategoryName || ''
      })
    });

    return await saveResponse.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleGetTranscript(videoUrl) {
  const apiBase = await getApiBase();
  const token = await getAuthToken();

  if (!token) return { success: false, error: 'Not authenticated' };

  try {
    const response = await fetch(`${apiBase}/api/transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ videoUrl })
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function showNotification(message, type = 'info') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Keevo Vault',
    message,
    priority: type === 'error' ? 2 : 1
  });
}

// Handle extension icon click - open popup automatically handled by manifest
chrome.action.onClicked.addListener((tab) => {
  // Popup opens automatically
});