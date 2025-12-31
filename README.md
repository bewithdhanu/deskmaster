# DeskMaster

<div align="center">
  <img src="assets/icons/app-icon-512.png" alt="DeskMaster Logo" width="128" height="128">
  
  **Master your desktop experience with system monitoring, world clocks, and productivity tools**
  
  [![macOS](https://img.shields.io/badge/macOS-10.12+-blue.svg)](https://www.apple.com/macos/)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![Version](https://img.shields.io/badge/version-2.2.0-orange.svg)](https://github.com/bewithdhanu/deskmaster/releases)
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
   - ✅ Settings management
   - ✅ Theme switching
   - ✅ All UI functionality

4. **Security**:
   - Web access is **disabled by default**
   - Only accessible when explicitly enabled
   - Runs on localhost (127.0.0.1) - not exposed to external networks
   - Can be disabled at any time from Settings

**Note**: The desktop app must be running for web access to work. The browser connects to the app via WebSocket and HTTP API for real-time data.

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
