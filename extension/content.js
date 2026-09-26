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
  // ─── Floating Smart Keeva Assistant (In-Page 1-Click Save) ───────────────
  // Shows a sleek, non-intrusive floating pill on Instagram, YouTube, LinkedIn, etc.
  // notifying users that they can save the content to Keeva with 1 click.

  if (!isKeevaOrigin) {
    let widgetRoot = null;
    let widgetShadow = null;
    let lastUrl = window.location.href;

    function getPlatformInfo() {
      const u = window.location.href.toLowerCase();
      if (u.includes('instagram.com/reel') || u.includes('instagram.com/p/')) {
        return { name: 'Instagram', label: 'Save Reel to Keeva', icon: '📸', isMedia: true };
      }
      if (u.includes('youtube.com/shorts') || (u.includes('youtu.be') && u.includes('shorts'))) {
        return { name: 'Shorts', label: 'Save Shorts to Keeva', icon: '▶️', isMedia: true };
      }
      if (u.includes('youtube.com/watch') || u.includes('youtu.be/')) {
        return { name: 'YouTube', label: 'Save Video to Keeva', icon: '▶️', isMedia: true };
      }
      if (u.includes('linkedin.com/feed') || u.includes('linkedin.com/posts')) {
        return { name: 'LinkedIn', label: 'Save Post to Keeva', icon: '💼', isMedia: true };
      }
      if (u.includes('twitter.com') || u.includes('x.com')) {
        return { name: 'X/Twitter', label: 'Save Post to Keeva', icon: '𝕏', isMedia: true };
      }
      return { name: 'Web', label: 'Save to Keeva Vault', icon: '⚡', isMedia: false };
    }

    function initFloatingWidget() {
      // Check if already injected
      if (document.getElementById('keeva-smart-save-host')) return;

      const host = document.createElement('div');
      host.id = 'keeva-smart-save-host';
      host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; bottom: 22px; right: 22px; pointer-events: auto;';
      document.body.appendChild(host);

      widgetRoot = host;
      widgetShadow = host.attachShadow({ mode: 'open' });

      renderWidget();
    }

    function renderWidget(state = 'idle', customMessage = '') {
      if (!widgetShadow) return;

      const info = getPlatformInfo();
      const isDismissed = sessionStorage.getItem('keeva_widget_minimized') === 'true';

      const style = `
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .keeva-widget {
          display: flex;
          align-items: center;
          gap: 9px;
          background: rgba(6, 9, 16, 0.94);
          border: 1px solid rgba(0, 229, 255, 0.35);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          padding: 6px 10px 6px 8px;
          border-radius: 9999px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.65), 0 0 20px rgba(0, 229, 255, 0.22);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          cursor: default;
        }
        .keeva-widget:hover {
          border-color: rgba(0, 229, 255, 0.6);
          box-shadow: 0 12px 36px rgba(0,0,0,0.75), 0 0 28px rgba(0, 229, 255, 0.35);
        }
        .keeva-logo-icon {
          width: 26px;
          height: 26px;
          border-radius: 8px;
          background: linear-gradient(135deg, #00E5FF, #6366F1, #D946EF);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 900;
          font-size: 13px;
          box-shadow: 0 0 10px rgba(0, 229, 255, 0.45);
          flex-shrink: 0;
        }
        .keeva-label {
          font-size: 12px;
          font-weight: 600;
          color: #E2E8F0;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .keeva-tag {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          background: rgba(0, 229, 255, 0.15);
          color: #00E5FF;
          border: 1px solid rgba(0, 229, 255, 0.3);
          padding: 1px 6px;
          border-radius: 999px;
        }
        .keeva-btn {
          border: none;
          background: linear-gradient(135deg, #00E5FF 0%, #6366F1 50%, #A855F7 100%);
          color: white;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 2px 10px rgba(0, 229, 255, 0.3);
          white-space: nowrap;
        }
        .keeva-btn:hover {
          transform: scale(1.04);
          box-shadow: 0 4px 15px rgba(0, 229, 255, 0.5);
          filter: brightness(1.1);
        }
        .keeva-btn:active {
          transform: scale(0.96);
        }
        .keeva-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .keeva-close-btn {
          background: transparent;
          border: none;
          color: #64748B;
          font-size: 14px;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 6px;
          transition: color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .keeva-close-btn:hover {
          color: #CBD5E1;
        }
        /* Minimized dot state */
        .keeva-minimized {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(6, 9, 16, 0.9);
          border: 1.5px solid rgba(0, 229, 255, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(0, 229, 255, 0.35);
          transition: transform 0.25s, box-shadow 0.25s;
        }
        .keeva-minimized:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 28px rgba(0, 229, 255, 0.6);
        }
        .keeva-success {
          color: #34D399;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        @keyframes keevaSpin {
          to { transform: rotate(360deg); }
        }
        .keeva-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: keevaSpin 0.7s linear infinite;
        }
      `;

      if (isDismissed) {
        widgetShadow.innerHTML = `
          <style>${style}</style>
          <div class="keeva-minimized" title="Open Keeva 1-Click Saver" id="keeva-reopen">
            <span style="color:#00E5FF; font-weight:900; font-size:16px;">K</span>
          </div>
        `;
        widgetShadow.getElementById('keeva-reopen')?.addEventListener('click', () => {
          sessionStorage.removeItem('keeva_widget_minimized');
          renderWidget();
        });
        return;
      }

      let actionHtml = '';
      if (state === 'idle') {
        actionHtml = `
          <button class="keeva-btn" id="keeva-save-trigger">
            <span>Save</span>
            <span>⚡</span>
          </button>
        `;
      } else if (state === 'saving') {
        actionHtml = `
          <button class="keeva-btn" disabled>
            <div class="keeva-spinner"></div>
            <span>Saving...</span>
          </button>
        `;
      } else if (state === 'saved') {
        actionHtml = `
          <div class="keeva-success">
            <span>✓</span>
            <span>Saved to Vault!</span>
          </div>
        `;
      } else if (state === 'auth_required') {
        actionHtml = `
          <button class="keeva-btn" id="keeva-login-trigger" style="background: linear-gradient(135deg, #F43F5E, #FB7185);">
            <span>Login to Keeva</span>
          </button>
        `;
      }

      widgetShadow.innerHTML = `
        <style>${style}</style>
        <div class="keeva-widget">
          <div class="keeva-logo-icon">K</div>
          <div class="keeva-label">
            <span>${customMessage || info.label}</span>
            <span class="keeva-tag">${info.name}</span>
          </div>
          ${actionHtml}
          <button class="keeva-close-btn" id="keeva-minimize" title="Minimize">✕</button>
        </div>
      `;

      // Event handlers
      widgetShadow.getElementById('keeva-minimize')?.addEventListener('click', () => {
        sessionStorage.setItem('keeva_widget_minimized', 'true');
        renderWidget();
      });

      widgetShadow.getElementById('keeva-save-trigger')?.addEventListener('click', () => {
        handleInPageSave();
      });

      widgetShadow.getElementById('keeva-login-trigger')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_LOGIN_TAB' });
      });
    }

    async function handleInPageSave() {
      renderWidget('saving');
      const currentUrl = window.location.href;
      const currentTitle = document.title;

      try {
        chrome.runtime.sendMessage({
          type: 'QUICK_SAVE_PAGE',
          url: currentUrl,
          title: currentTitle,
        }, (res) => {
          if (chrome.runtime.lastError) {
            renderWidget('idle', 'Save failed: Extension reloaded');
            return;
          }
          if (res?.needAuth) {
            renderWidget('auth_required', 'Login required');
          } else if (res?.success) {
            renderWidget('saved');
            // After 3.5 seconds, smoothly minimize
            setTimeout(() => {
              sessionStorage.setItem('keeva_widget_minimized', 'true');
              renderWidget();
            }, 3500);
          } else {
            renderWidget('idle', res?.error || 'Save failed');
            setTimeout(() => renderWidget('idle'), 3000);
          }
        });
      } catch (e) {
        renderWidget('idle', 'Save error');
      }
    }

    // Delay start by 1 second so page finishes initial load
    setTimeout(initFloatingWidget, 1200);

    // Watch for SPA URL changes (e.g. browsing Instagram reels or YouTube shorts)
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        renderWidget();
      }
    }, 1500);
  }

})();