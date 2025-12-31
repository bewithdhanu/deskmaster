# DeskMaster

<div align="center">
  <img src="assets/icons/app-icon-512.png" alt="DeskMaster Logo" width="128" height="128">
  
  **Master your desktop experience with system monitoring, world clocks, and productivity tools**
  
  [![macOS](https://img.shields.io/badge/macOS-10.12+-blue.svg)](https://www.apple.com/macos/)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![Version](https://img.shields.io/badge/version-2.4.0-orange.svg)](https://github.com/bewithdhanu/deskmaster/releases)
</div>


## ✨ Features

### 🖥️ **System Monitoring**
- **Real-time CPU usage** with core details and temperature
- **Memory monitoring** with used/total RAM display
- **Storage tracking** across all drives
- **Network activity** with upload/download speeds
- **Battery status** (on laptops)
- **Live updates** every second in the system tray

### 🌍 **World Clocks**
- **Multiple timezone support** - add unlimited timezones
- **Custom labels** for each timezone
- **Interactive timeline** - drag to adjust time for all timezones
- **Manual time editing** - click any timezone to set custom time
- **Flexible time formats** - 12/24 hour with date options
- **Automatic DST handling**
- **Real-time synchronization** across all timezones

### 🎨 **Modern Interface**
- **Dark/Light theme** support with system preference detection
- **Responsive grid layouts** that adapt to screen size
- **Custom scrollbars** with theme-aware styling
- **Smooth animations** and transitions
- **Native macOS integration** with proper window management
- **Persistent settings** that remember your preferences

### 🔧 **Productivity Tools**
- **System tray integration** for quick access
- **Auto-start option** (configurable)
- **Minimal resource usage**
- **Background operation** without interrupting workflow

### 🛠️ **Utility Tools**
- **Bcrypt Hash Generator** - Generate secure bcrypt hashes from text
- **Bcrypt Hash Verifier** - Verify text against bcrypt hashes
- **Public IP Tool** - Display your public IP address
- **IP Location Tool** - Get location details from IP address(es) with API key support
- **Pinggy Tunnel** - Create secure tunnels to local ports for testing and development
- **Text Reformat Tool** - Reformat text using ChatGPT GPT-4o mini (requires API key)
- **Text Translation** - Translate text to any language using ChatGPT GPT-4o mini
- **Password Generator** - Generate strong passwords with customizable options (length, character sets)

### 📋 **Clipboard History**
- **Automatic tracking** - Monitors clipboard changes in real-time
- **Search functionality** - Quickly find past clipboard entries
- **Copy to clipboard** - One-click copy of any historical entry
- **View full content** - Expand to see complete clipboard entries
- **Delete entries** - Remove unwanted clipboard history items
- **Clear all** - Bulk delete all clipboard history
- **Real-time updates** - WebSocket-powered live updates
- **Source tracking** - See which application copied each entry

### 🔐 **Authenticator (TOTP)**
- **TOTP code generation** - Generate time-based one-time passwords
- **Multiple authenticators** - Manage unlimited authenticator accounts
- **QR code import** - Import from `otpauth://` URLs
- **Manual entry** - Add authenticators manually with secret key
- **Real-time codes** - Codes update automatically every 30 seconds
- **Copy to clipboard** - One-click copy of TOTP codes
- **Username display** - View and copy usernames associated with accounts
- **Trash system** - Soft delete with 30-day retention before permanent deletion
- **Restore from trash** - Recover accidentally deleted authenticators
- **Search & sort** - Find authenticators quickly, sorted by name
- **WebSocket updates** - Real-time code updates without polling

### 🔒 **Security Features**
- **Computer authentication** - Touch ID/password required for sensitive tabs
- **Protected tabs** - Clipboard, Authenticator, and Settings require authentication
- **Operation security** - Edit/delete operations require authentication (regardless of timeout)
- **5-minute timeout** - Authentication valid for 5 minutes after successful auth
- **Export encryption** - Optional AES-256-GCM encryption for exported data
- **Import decryption** - Automatic detection and decryption of encrypted imports

### 💾 **Data Management**
- **Export all data** - Export settings, authenticators, clipboard history, and performance stats
- **Import all data** - Restore complete application state from exported file
- **Optional encryption** - Protect exported data with encryption key
- **Reset all data** - Complete data reset to factory defaults
- **Authentication required** - All data operations require computer authentication

### 🌐 **Web Access** (New!)
- **Browser access** - View and control DeskMaster from any web browser
- **Real-time data** - Live system stats and timezone updates via WebSocket
- **Full functionality** - All features work in browser (stats, timezones, settings)
- **Easy setup** - Enable with a single toggle in Settings
- **Secure** - Only accessible when explicitly enabled

## 🚀 Installation

### Download for macOS

Choose the version that matches your Mac:

| Architecture | Download | Size |
|-------------|----------|------|
| **Apple Silicon** (M1/M2/M3) | [DeskMaster-arm64.dmg](https://github.com/bewithdhanu/deskmaster/releases/latest) | ~85 MB |
| **Intel Mac** | [DeskMaster-x64.dmg](https://github.com/bewithdhanu/deskmaster/releases/latest) | ~90 MB |

### Installation Steps

1. **Download** the appropriate DMG file for your Mac
2. **Open** the DMG file
3. **Drag** DeskMaster to your Applications folder
4. **Launch** DeskMaster from Applications or Spotlight
5. **Enjoy** your new desktop productivity tool!

## 🎯 Quick Start

### First Launch
1. DeskMaster will appear in your system tray (menu bar)
2. Click the tray icon to open the main window
3. Add your first timezone by clicking the "+" button
4. Customize your timezone labels as needed

### System Tray
- **Click** the tray icon to open/close the main window
- **Right-click** for additional options
- **Hover** to see quick system stats

### Adding Timezones
1. Click the **"+"** button in the timezone section
2. Search for your desired timezone
3. Add a custom label (optional)
4. Click **"Add Timezone"**

### Using Tools
1. Navigate to the **Tools** tab
2. Available tools are displayed in a grid layout
3. Click any tool to open it
4. Use drag-and-drop to reorder tools
5. Add/remove tools as needed

### Clipboard History
1. Navigate to the **Clipboard** tab
2. View all clipboard entries automatically tracked
3. Use search to find specific entries
4. Click any entry to copy it again
5. Click the eye icon to view full content

### Authenticator
1. Navigate to the **Authenticator** tab
2. Click **"+"** to add a new authenticator
3. Enter `otpauth://` URL or manual details
4. TOTP codes update automatically every 30 seconds
5. Click code to copy to clipboard
6. Use trash view to restore deleted authenticators

### Data Export/Import
1. Go to **Settings** → **Data Management**
2. **Export**: Click "Export All Data" to save everything to a JSON file
   - Optional: Enter encryption key for secure export
   - Leave empty to export without encryption
3. **Import**: Click "Import Data" to restore from exported file
   - If file is encrypted, enter the encryption key
   - All current data will be replaced
4. **Reset**: Click "Reset All Data" to clear everything
   - Requires double confirmation
   - Cannot be undone

## ⚙️ Configuration

### Themes
- DeskMaster automatically detects your system theme preference
- Switch between light and dark modes
- Theme changes apply instantly across the entire application

### Auto-Start
- Enable auto-start to launch DeskMaster when you log in
- Access this option through Settings → System
- Perfect for keeping your productivity tools always available

### Web Access
DeskMaster can be accessed from any web browser on your local network:

1. **Enable Web Access**:
   - Go to Settings → System
   - Toggle "Web Access" to ON
   - The web URL will appear below the toggle

2. **Access in Browser**:
   - Click the URL (`http://localhost:65530`) to open in your default browser
   - Or manually navigate to the URL in any browser

3. **Features Available**:
   - ✅ Real-time system monitoring (CPU, RAM, Disk, Network, Battery)
   - ✅ World clocks with interactive timeline
   - ✅ Tools (all utility tools)
   - ✅ Clipboard history (view and copy)
   - ✅ Authenticator (view TOTP codes)
   - ✅ Settings management
   - ✅ Theme switching
   - ✅ All UI functionality

4. **Security**:
   - Web access is **disabled by default**
   - Only accessible when explicitly enabled
   - Runs on localhost (127.0.0.1) - not exposed to external networks
   - API token authentication required for all requests
   - Can be disabled at any time from Settings

**Note**: The desktop app must be running for web access to work. The browser connects to the app via WebSocket and HTTP API for real-time data. Export/Import features are only available in the desktop app (not in browser mode).

## 🛠️ System Requirements

- **macOS 10.12** (Sierra) or later
- **Apple Silicon** (M1/M2/M3) or **Intel** processor
- **50 MB** free disk space
- **Internet connection** for timezone data (optional)

## 📱 Supported Platforms

DeskMaster is currently available for:
- ✅ **macOS** (Apple Silicon & Intel)

## 🐛 Issues & Support

- **Report bugs**: [GitHub Issues](https://github.com/bewithdhanu/deskmaster/issues)
- **Feature requests**: [GitHub Discussions](https://github.com/bewithdhanu/deskmaster/discussions)
- **Developer info**: [Development Guide](DEVELOPMENT.md)

---

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/bewithdhanu">Dhanu K</a></p>
  <p>⭐ Star this repo if you find it useful!</p>
</div>
