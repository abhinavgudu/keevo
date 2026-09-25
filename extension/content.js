// Keeva Browser Extension - Content Script
// Detects video elements, provides page metadata, handles transcript extraction

(function () {
  'use strict';

  // Detect platform from URL
  function detectPlatform(url) {
    const u = url.toLowerCase();
    if (u.includes('instagram.com/reel') || u.includes('instagram.com/p/')) return 'Instagram';
    if (u.includes('youtube.com/shorts') || u.includes('youtu.be/') && u.includes('shorts')) return 'YouTube Shorts';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('tiktok.com')) return 'TikTok';
    if (u.includes('linkedin.com')) return 'LinkedIn';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X';
    if (u.match(/\.(pdf|doc|docx|ppt|pptx)(\?|$)/)) return 'PDF';
    return 'Web';
  }

  // Extract metadata from page
  function extractPageMetadata() {
    const metadata = {
      url: window.location.href,
      title: document.title,
      description: '',
      thumbnail_url: null,
      platform: detectPlatform(window.location.href),
      videoElements: []
    };

    // Open Graph tags
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
    const ogDesc = document.querySelector('meta[property="og:description"]')?.content;
    const ogImage = document.querySelector('meta[property="og:image"]')?.content;
    const ogVideo = document.querySelector('meta[property="og:video"]')?.content;

    if (ogTitle) metadata.title = ogTitle;
    if (ogDesc) metadata.description = ogDesc;
    if (ogImage) metadata.thumbnail_url = ogImage;
    if (ogVideo) metadata.video_url = ogVideo;

    // Twitter Card
    const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.content;
    const twitterDesc = document.querySelector('meta[name="twitter:description"]')?.content;
    const twitterImage = document.querySelector('meta[name="twitter:image"]')?.content;

    if (twitterTitle && !ogTitle) metadata.title = twitterTitle;
    if (twitterDesc && !ogDesc) metadata.description = twitterDesc;
    if (twitterImage && !ogImage) metadata.thumbnail_url = twitterImage;

    // Find video elements
    document.querySelectorAll('video').forEach((video, idx) => {
      const src = video.src || video.querySelector('source')?.src;
      if (src) {
        metadata.videoElements.push({
          index: idx,
          src,
          poster: video.poster,
          duration: video.duration,
          isShorts: window.location.href.includes('/shorts/') ||
            (video.videoWidth && video.videoHeight && video.videoHeight > video.videoWidth)
        });
      }
    });

    // YouTube specific
    if (metadata.platform === 'YouTube' || metadata.platform === 'YouTube Shorts') {
      const ytVideoId = new URLSearchParams(window.location.search).get('v') ||
        window.location.pathname.split('/shorts/')[1]?.split('/')[0] ||
        window.location.pathname.split('/').pop();
      if (ytVideoId) {
        metadata.youtube_id = ytVideoId;
        metadata.thumbnail_url = metadata.thumbnail_url || `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`;
      }
    }

    // Instagram specific
    if (metadata.platform === 'Instagram') {
      const metaDesc = document.querySelector('meta[name="description"]')?.content;
      if (metaDesc) metadata.description = metaDesc;
    }

    return metadata;
  }

  // Listen for messages from background/popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_METADATA') {
      sendResponse({ success: true, metadata: extractPageMetadata() });
    }
    if (message.type === 'GET_VIDEO_ELEMENTS') {
      const videos = Array.from(document.querySelectorAll('video')).map((v, i) => ({
        index: i,
        src: v.src || v.querySelector('source')?.src,
        poster: v.poster,
        duration: v.duration,
        currentTime: v.currentTime
      }));
      sendResponse({ success: true, videos });
    }
    if (message.type === 'EXTRACT_TRANSCRIPT') {
      extractTranscriptFromPage(message.videoSelector).then(sendResponse);
      return true;
    }
  });

  // Try to extract transcript from YouTube/Instagram/TikTok
  async function extractTranscriptFromPage(selector) {
    const video = document.querySelector(selector || 'video');
    if (!video) return { success: false, error: 'No video element found' };

    // YouTube captions
    if (window.location.hostname.includes('youtube.com')) {
      return extractYouTubeTranscript();
    }

    // Instagram - no direct access
    if (window.location.hostname.includes('instagram.com')) {
      return { success: false, error: 'Instagram transcripts not accessible from content script' };
    }

    // Generic video - would need external API
    return { success: false, error: 'Transcript extraction requires backend API' };
  }

  function extractYouTubeTranscript() {
    // Try to get caption track from ytInitialData
    try {
      const ytData = window.ytInitialData || {};
      const captions = ytData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captions?.length) {
        const enCaption = captions.find(c => c.languageCode?.startsWith('en')) || captions[0];
        if (enCaption?.baseUrl) {
          return fetch(enCaption.baseUrl)
            .then(r => r.text())
            .then(xml => parseYouTubeCaptionXML(xml))
            .then(segments => ({ success: true, transcript: segments, language: enCaption.languageCode }));
        }
      }
    } catch (e) {
      console.warn('YouTube transcript extraction failed:', e);
    }
    return { success: false, error: 'No captions available' };
  }

  function parseYouTubeCaptionXML(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const segments = [];
    doc.querySelectorAll('text').forEach(el => {
      const start = parseFloat(el.getAttribute('start') || '0');
      const dur = parseFloat(el.getAttribute('dur') || '0');
      segments.push({
        text: el.textContent,
        start,
        end: start + dur
      });
    });
    return segments;
  }

  // Add visual indicator for detected videos
  function addVideoIndicators() {
    document.querySelectorAll('video').forEach((video, idx) => {
      if (video.dataset.keevoProcessed) return;
      video.dataset.keevoProcessed = 'true';

      // Add right-click hint
      video.style.cursor = 'pointer';
      video.title = 'Right-click → Save to Keeva Vault';
    });
  }

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addVideoIndicators);
  } else {
    addVideoIndicators();
  }

  // Also run for dynamic content
  const observer = new MutationObserver(() => addVideoIndicators());
  observer.observe(document.body, { childList: true, subtree: true });

  // Expose metadata to popup
  window.__KEEVA_METADATA__ = extractPageMetadata();

})();