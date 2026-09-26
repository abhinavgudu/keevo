// Keeva Chrome Extension — content.js
// Runs on all pages. Key jobs:
// 1. Auto-capture auth token when user logs into Keeva app
// 2. Provide page metadata to the popup

(function () {
  'use strict';

  // ─── Auth Token Auto-Capture ─────────────────────────────────────────────
  // When Keeva app sets session token in localStorage, we forward it to extension
  const KEEVA_HOST_PATTERNS = [
    /keeva/i,
    /localhost:\d+/i,
    /reelsvault/i,
    /127\.0\.0\.1/i,
  ];

  const isKeevaOrigin = KEEVA_HOST_PATTERNS.some(p => p.test(window.location.host));

  if (isKeevaOrigin) {
    // Try reading token from localStorage (set by Keeva app after login)
    function tryCapturAuthToken() {
      try {
        // Supabase stores session like: sb-<project>-auth-token
        const keys = Object.keys(localStorage);
        const authKey = keys.find(k => k.includes('auth-token') || k.includes('supabase.auth.token'));
        if (!authKey) return;

        const raw = localStorage.getItem(authKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const token = parsed?.access_token || parsed?.currentSession?.access_token;
        const email = parsed?.user?.email || parsed?.currentSession?.user?.email;

        if (token) {
          chrome.runtime.sendMessage({
            type: 'KEEVA_AUTH_TOKEN',
            token,
            email: email || '',
          });
        }
      } catch (e) {
        // Silently fail
      }
    }

    // Run on load
    tryCapturAuthToken();

    // Watch for localStorage changes (login event)
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      origSetItem(key, value);
      if (key.includes('auth-token') || key.includes('supabase.auth.token')) {
        setTimeout(tryCapturAuthToken, 200);
      }
    };

    // Also listen for custom postMessage from the Keeva app
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'KEEVA_AUTH_TOKEN' && event.data?.token) {
        chrome.runtime.sendMessage({
          type: 'KEEVA_AUTH_TOKEN',
          token: event.data.token,
          email: event.data.email || '',
        });
      }
    });
  }

  // ─── Page Metadata Extraction ────────────────────────────────────────────
  // Popup calls GET_PAGE_METADATA → we respond with rich metadata

  function getMetaContent(selector) {
    return document.querySelector(selector)?.getAttribute('content') || null;
  }

  function extractPageMetadata() {
    const url = window.location.href;
    const title = getMetaContent('meta[property="og:title"]') ||
                  getMetaContent('meta[name="twitter:title"]') ||
                  document.title || '';
    const description = getMetaContent('meta[property="og:description"]') ||
                        getMetaContent('meta[name="description"]') || '';
    const thumbnail = getMetaContent('meta[property="og:image"]') ||
                      getMetaContent('meta[name="twitter:image"]') || null;
    const siteName = getMetaContent('meta[property="og:site_name"]') || '';

    // Detect video elements
    const videoElements = Array.from(document.querySelectorAll('video')).map(v => ({
      src: v.src || v.currentSrc,
      poster: v.poster,
    })).filter(v => v.src);

    // YouTube video ID
    let youtube_id = null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (ytMatch) youtube_id = ytMatch[1];

    return {
      url,
      title: title.slice(0, 200),
      description: description.slice(0, 500),
      thumbnail_url: thumbnail,
      site_name: siteName,
      videoElements: videoElements.slice(0, 3),
      youtube_id,
    };
  }

  // Listen for popup requesting metadata
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_METADATA') {
      try {
        const meta = extractPageMetadata();
        sendResponse({ success: true, metadata: meta });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }
  });

})();