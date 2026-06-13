# DeskMaster

<div align="center">
  <img src="assets/icons/app-icon-512.png" alt="DeskMaster Logo" width="128" height="128">
  
  **Master your desktop experience with system monitoring, world clocks, AI agent, and productivity tools**
  
  [![macOS](https://img.shields.io/badge/macOS-10.12+-blue.svg)](https://www.apple.com/macos/)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![Version](https://img.shields.io/badge/version-3.3.0-orange.svg)](https://github.com/bewithdhanu/deskmaster/releases)
</div>

## ✨ Features

### 🧭 **Navigation & Deep Linking**
- **Nine main tabs**: Home, World Clocks, Performance, Notes, Agent, Uptime, Clipboard, Authenticator, and Settings
- **Hash-based URLs** for bookmarking and browser back/forward — e.g. `#/agent/chat/{id}`, `#/settings/agent`, `#/notes/note/{id}`
- **Persistent tab memory** with URL as the source of truth when a hash is present
- **System tray** quick access with live stats and theme-aware tray icon

---

### 🖥️ **System Monitoring**
- **Real-time CPU** usage with core count, speed, and temperature
- **Memory monitoring** with used/total RAM
- **Storage tracking** across all drives
- **Network activity** with upload/download speeds
- **Battery status** on laptops
- **Configurable visibility** per metric (Settings → System Stats)
- **Live tray updates** every second
- **Home dashboard** with system stat cards and Uptime Kuma summary widgets

### 📈 **Performance History**
- **Dedicated Performance tab** with live stat cards and historical charts
- **Chart.js line charts** for CPU, RAM, disk, network, and battery
- **Time ranges**: 1h, 6h, 24h, 7d, and 30d
- **Metric toggles** to show/hide series on the chart
- **~30 days** of stored samples for trend analysis
- **Agent-accessible history** via `query_system_stats_history` when DeskMaster Tools are enabled

### 📈 **Uptime Monitoring**
- **Uptime Kuma integration** as a native Uptime tab
- **Local-first monitor cache** for fast loading and offline-friendly viewing
- **Hourly background sync** plus manual force refresh
- **Optimistic create/edit/delete/pause/resume** with queued background sync
- **Automatic retry and rollback** if a queued action fails twice
- **SSL and domain expiry attention** tracking alongside down monitor counts
- **Tray status indicator** for Down | SSL Attention | Domain Attention counts
- **Settings-managed credentials** (URL, username, password)
- **Optional disable** of the Uptime tab from Settings → Uptime Kuma

### 🤖 **AI Agent**
- **Streaming chat** with markdown rendering and tool-call status indicators
- **Multiple LLM providers** (configure any that you use):
  - OpenAI
  - Anthropic
  - OpenRouter
  - AWS Bedrock
  - Local Server (Ollama / LM Studio compatible APIs)
- **Per-chat provider and model** selection
- **Chat history** with search, rename, delete, and deep-linked URLs (`#/agent/chat/{id}`)
- **Edit & resend** user messages to branch a conversation
- **Copy** and **Save to Notes** on assistant responses
- **Optional capabilities** (toggled per chat or as defaults in Settings):
  - **Knowledge Base** — RAG over Notes and custom documents (SQLite embeddings)
  - **DeskMaster Tools** — safe in-app tool registry (system stats, notes, uptime, backup, bcrypt, IP tools, translation, etc.)
  - **Composio Integrations** — OAuth-connected external apps (GitHub, Gmail, Slack, etc.)
- **Composio Tool Router** meta-tools for discovering and executing integration actions without hardcoded per-app logic
- **Multi-account support** per Composio toolkit (e.g. two Gmail accounts) with account labels and disconnect
- **Write confirmations** for destructive or sensitive agent actions (e.g. note saves, backups)
- **KB reindex** and status display (document/chunk counts)
- **Citation display** when Knowledge Base context is used

#### Agent DeskMaster Tools (when enabled)
| Area | Examples |
|------|----------|
| System | Current stats, historical performance queries, app version |
| Notes | Search, read, create, save pages |
| Tools | Bcrypt, public IP, IP geolocation, translate, reformat text |
| Uptime | List monitors |
| Backup | Google Drive status, trigger backup |
| Knowledge | Search KB, list/create/update custom KB documents |
| Settings | Read settings summary |

Clipboard and Authenticator data are **never** exposed to the agent.

### 📝 **Notes**
- **OneNote-style canvas editor** with movable/resizable text blocks
- **Multi-select**, drag, clone, cut/copy/paste, align, and clear-style actions
- **Improved OneNote paste** preserving blocks, positions, and formatting
- **Markdown editor** (BlockNote) with structured Markdown paste and AI toolbar actions
- **Plain text editor** (Monaco) with AI edit on selection
- **Page tree**: rename, archive, restore, delete, drag reorder, multi-selection
- **Search** across note content
- **Deep-linked URLs** per note (`#/notes/note/{id}`)
- **Indexed for Agent Knowledge Base** when that capability is enabled

### 🌍 **World Clocks**
- **Multiple timezones** with custom labels
- **Interactive timeline** — drag to adjust all clocks (15-minute steps)
- **Manual time editing** — click any clock to set custom time
- **Flexible formats** — 12/24 hour with optional date display
- **Automatic DST handling**
- **Per-timezone tray visibility** toggle
- **Real-time synchronization** across all clocks

### 🛠️ **Home Utility Tools**
Installable tools on the Home tab (add/remove and drag to reorder):

| Tool | Description |
|------|-------------|
| **Bcrypt Generate** | Create bcrypt hashes from text |
| **Bcrypt Verify** | Verify text against a bcrypt hash |
| **Public IP** | Show your public IP address |
| **IP Location** | City, country, ISP, coordinates (IPGeolocation.io API key in Settings) |
| **Pinggy Tunnel** | Secure tunnels to local ports |
| **Text Reformat / Translate** | AI reformat (multiple tones) or translate — uses your **AI Agent** default LLM |
| **Password Generator** | Length and character-set options |
| **OneTimeSecret** | Create anonymous one-time shareable secrets with TTL |

### 📋 **Clipboard History**
- **Automatic tracking** of clipboard changes in real time
- **Search** past entries
- **Copy**, **view full content**, **delete**, and **clear all**
- **WebSocket live updates**
- **Source app tracking** for each entry

### 🔐 **Authenticator (TOTP)**
- **TOTP code generation** with 30-second refresh
- **QR / `otpauth://` import** and manual secret entry
- **Copy codes and usernames**
- **Trash** with 30-day retention and restore
- **Search and sort** by name
- **WebSocket updates** without polling

### 🔒 **Security**
- **Touch ID / password** for Clipboard, Authenticator, and Settings tabs
- **5-minute auth timeout** for tab access; sensitive operations can re-prompt
- **Export encryption** (optional AES-256-GCM)
- **Automatic decryption** on import when encrypted
- **API token** for web/browser mode HTTP API

### 💾 **Data Management**
- **Export all data** — settings, authenticators, clipboard, performance history, notes, agent chats, etc.
- **Import** full restore from JSON (optional encryption key)
- **Reset to factory defaults** with confirmation
- **Authentication required** for export/import/reset
- **Browser mode** uses the desktop app API when web access is enabled

### ☁️ **Cloud Backup**
- **Google Drive** OAuth from Settings → Cloud Backup
- **Scheduled backups** (configurable interval, default every 4 hours)
- **Manual “Backup now”**
- **Retention** — keep last N backups (default 10)
- **Status** — last run time, success/error, connection state

### ⚙️ **Settings**
Sidebar sections (each has its own URL under `#/settings/...`):

| Section | What you configure |
|---------|-------------------|
| **System Stats** | Which metrics appear in tray and dashboards |
| **World Clocks** | Date/time format |
| **System** | Auto-start, web access, show in Dock |
| **Appearance** | Dark / light / system theme |
| **API Keys** | IP Location API key (tools) |
| **AI Agent** | LLM providers, default capabilities, Composio API key & toolkits |
| **Uptime Kuma** | Server URL, credentials, enable/disable tab |
| **Data Management** | Export, import, reset |
| **Cloud Backup** | Google Drive OAuth, schedule, retention |

### 🎨 **Modern Interface**
- **Dark / light / system** themes with CSS variables
- **Responsive grids** (1–4 columns depending on context)
- **Custom scrollbars** and smooth transitions
- **Native macOS** window and tray integration
- **Subtle borders** and theme-aware cards

### 🌐 **Web Access**
- **Browser UI** when enabled in Settings → System
- **Same hash URLs** as the desktop app for tabs, settings, chats, and notes
- **WebSocket + HTTP API** for real-time stats, clipboard, authenticator, notes, agent, uptime, settings, and tools
- **Localhost only** by default with API token authentication
- **Desktop app must be running** — the browser connects to the Electron backend

---

## 🚀 Installation

### Download for macOS

| Architecture | Download | Size |
|-------------|----------|------|
| **Apple Silicon** (M1/M2/M3/M4) | [DeskMaster-arm64.dmg](https://github.com/bewithdhanu/deskmaster/releases/latest) | ~85 MB |
| **Intel Mac** | [DeskMaster-x64.dmg](https://github.com/bewithdhanu/deskmaster/releases/latest) | ~90 MB |

### Installation Steps

1. Download the DMG for your Mac architecture
2. Open the DMG and drag DeskMaster to Applications
3. Launch from Applications or Spotlight
4. Click the menu bar tray icon to open the main window

---

## 🎯 Quick Start

### First launch
1. DeskMaster appears in the system tray (menu bar)
2. Click the tray icon to open or hide the main window
3. Explore tabs from the top navigation bar
4. Configure LLM providers in **Settings → AI Agent** to use the Agent and Text Reformat tools

### System tray
- **Click** — show/hide main window
- **Right-click** — context menu
- **Hover** — quick system stats (when enabled)

### World Clocks
1. Open the **World Clocks** tab
2. Click **+** to add a timezone and optional label
3. Drag the timeline or click a clock to adjust time

### AI Agent
1. Open the **Agent** tab
2. Add API keys in **Settings → AI Agent** for at least one provider
3. Toggle capabilities (Knowledge Base, DeskMaster Tools, Integrations) as needed
4. Start a chat; use the sidebar to switch chats or search history
5. For Composio: add toolkit slugs in Settings, connect accounts, then enable Integrations on the chat

### Notes
1. Open **Notes** — tree on the left, editor on the right
2. Create pages (canvas, markdown, or text)
3. Use archive mode for soft-deleted pages

### Clipboard & Authenticator
Protected tabs — authenticate with Touch ID or password when prompted.

### Data export / import
**Settings → Data Management** — export (optional encryption), import, or reset. Authentication required.

---

## ⚙️ Configuration

### Themes
System, dark, or light in **Settings → Appearance**. Changes apply instantly app-wide.

### Auto-start
**Settings → System** — launch DeskMaster at login.

### Web access
1. **Settings → System** → enable **Web Access**
2. Open the shown URL (e.g. `http://localhost:65530`) in a browser
3. Use the same `#/...` URLs as in the desktop app
4. Disable anytime; requires API token on each request

---

## 🛠️ System Requirements

- **macOS 10.12** (Sierra) or later
- **Apple Silicon** or **Intel**
- **~50 MB** disk space (plus data, notes, and optional local models)
- **Internet** optional (timezones, IP tools, cloud LLMs, Composio, Uptime Kuma, Drive backup)

---

## 📱 Supported Platforms

- ✅ **macOS** (Apple Silicon & Intel)

---

## 🐛 Issues & Support

- **Bugs**: [GitHub Issues](https://github.com/bewithdhanu/deskmaster/issues)
- **Feature requests**: [GitHub Discussions](https://github.com/bewithdhanu/deskmaster/discussions)
- **Development**: [Development Guide](DEVELOPMENT.md)

---

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/bewithdhanu">Dhanu K</a></p>
  <p>⭐ Star this repo if you find it useful!</p>
</div>
