# Keeva Chrome Extension v2.0

Save any web content to your Keeva vault with **one click** — right from your browser toolbar.

---

## ✨ What it does

| Feature | Details |
|---|---|
| **1-Click Save** | Click the Keeva icon → hit "Save to Keeva Vault" |
| **Auto-Detection** | Detects Instagram, YouTube, LinkedIn, TikTok, PDFs automatically |
| **AI Metadata** | Fetches title, thumbnail, category, tags automatically |
| **Right-Click Save** | Right-click any link/video → "Save to Keeva" |
| **Auto Login** | Opens Keeva tab → logs in → extension connects automatically |

---

## 🚀 Install in Chrome (3 steps)

### Step 1 — Open Extensions
Open Chrome and go to:
```
chrome://extensions/
```

### Step 2 — Enable Developer Mode
Toggle **"Developer mode"** ON (top-right corner)

### Step 3 — Load the Extension
Click **"Load unpacked"** → Select the `extension/` folder from your Keeva project

That's it! The Keeva icon will appear in your toolbar. 🎉

---

## 🔐 First-Time Login

1. Click the Keeva extension icon
2. Click **"Open Keeva & Login"**
3. Login to your Keeva account in the tab that opens
4. The extension **auto-connects** — no manual token copy needed!

---

## 📁 Project Structure

```
extension/
├── manifest.json     — Extension config (MV3)
├── popup.html        — The popup UI
├── popup.js          — Popup logic
├── background.js     — Service worker (context menus, auth capture)
├── content.js        — Runs on pages (auth token capture, metadata)
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## ⚙️ Settings

Click the ⚙️ gear icon in the popup:

- **API Base URL** — Your Keeva app URL (default: `http://localhost:3001`)
- **Auto-detect platform** — Toggle Instagram/YouTube detection
- **Show notifications** — Chrome notifications on save

---

## 🐛 Troubleshooting

**Extension shows "Not connected"**
→ Click "Open Keeva & Login" and login to your account

**Save fails with error**
→ Check API Base URL in Settings matches your Keeva app URL

**Right-click menu not showing**
→ Reload the extension in `chrome://extensions/`