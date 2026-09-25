# Keeva Browser Extension - Installation Guide

## Quick Install (Development Mode)

### Chrome / Edge / Brave / Arc
1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. Pin the Keeva icon to your toolbar

### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `extension/manifest.json`

## Configuration

After installation, click the extension icon and:
1. Enter your **Keeva API Base URL** (e.g., `http://localhost:3000` or your production URL)
2. Click **Login / Signup** - opens Keeva in a new tab
3. Sign in to your Keeva account
4. Return to extension - you'll see "Connected" status

## Usage

### Right-click Context Menu
- **Right-click any link** → "Save to Keeva Vault"
- **Right-click on a video** → "Save Video/Reel to Keeva"
- **Right-click PDF links** → "Save PDF/Document to Keeva"

### Extension Popup
- Click the Keeva icon in toolbar
- See current page metadata
- **Save Page** - saves current page as article
- **Save Video** - saves detected video as Reel (9:16)
- **Generate Transcript** - AI transcription via AssemblyAI (requires API key)

### Keyboard Shortcut (Optional)
Set in `chrome://extensions/shortcuts`:
- Default: `Ctrl+Shift+K` (or `Cmd+Shift+K` on Mac)

## Features

| Feature | Description |
|---------|-------------|
| **Smart Ingestion** | Auto-detects platform (Instagram, YouTube, TikTok, LinkedIn, Twitter/X, PDF) |
| **Auto-Categorization** | AI classifies content into categories (Dev & Tech, AI/ML, Design, etc.) |
| **Priority Scoring** | Calculates priority (MUST_LEARN=100, HIGH=75, MEDIUM=50, LOW=25) |
| **Video Transcripts** | AssemblyAI-powered transcription with speaker labels, chapters, entities |
| **9:16 Preservation** | Maintains vertical video aspect ratio for Reels/Shorts |
| **Offline Support** | Queues saves when offline, syncs when online |

## Environment Variables (Backend)

Add to your `.env.local`:
```bash
# AssemblyAI for transcripts (get free key at assemblyai.com)
ASSEMBLYAI_API_KEY=your_assemblyai_key_here
```

## Permissions Explained

- **contextMenus** - Right-click "Save to Keeva"
- **activeTab** - Read current page URL/metadata
- **storage** - Save auth token, settings locally
- **scripting** - Inject content script for video detection
- **tabs** - Open Keeva login page
- **host_permissions** - Access all sites for scraping

## Development

```bash
# Watch for changes (manual reload needed)
# Edit files in extension/ folder
# Refresh extension in chrome://extensions/
```

## Production Build

```bash
# Create zip for Chrome Web Store
cd extension
zip -r keeva-extension.zip . -x "*.md" "*.svg" "*.git*"
```

## Troubleshooting

**"Not authenticated"** - Click Login in popup, sign in to Keeva, return to popup

**"Failed to save"** - Check API Base URL is correct and server is running

**"Transcription failed"** - Ensure `ASSEMBLYAI_API_KEY` is set in backend `.env.local`

**Video not detected** - Refresh page, ensure video element exists in DOM

## Architecture

```
extension/
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker (context menus, API calls)
├── content.js             # Content script (page metadata, video detection)
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic (save, transcript, auth)
└── icons/                 # Extension icons (16, 32, 48, 128)
```

## API Endpoints Used

- `POST /api/scrape` - Extract metadata from URL
- `POST /api/save-from-extension` - Save item from extension
- `POST /api/transcript` - Generate AI transcript
- `GET /api/auth/me` - Verify auth token