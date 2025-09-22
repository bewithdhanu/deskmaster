# DeskMaster - Development Guide

> **For Users**: See [README.md](README.md) for installation and usage instructions.

This document contains technical details for developers who want to contribute to DeskMaster or build it from source.

DeskMaster is a comprehensive desktop productivity application that combines system monitoring, world clocks, and productivity tools in one unified experience. Built with React and Tailwind CSS.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the React App
```bash
npm run build-app
```

### 3. Run the Application
```bash
npm start
```

## 🏗️ Automated Builds with GitHub Actions

DeskMaster includes comprehensive GitHub Actions workflows for automated building and releasing across all platforms.

### 📦 Available Workflows

#### 1. **Release Workflow** (`release.yml`)
**Triggers:** Git tags (`v*`) or manual dispatch
**Builds:**
- 🍎 **macOS**: Apple Silicon (ARM64) + Intel (x64) DMG files

#### 2. **CI Workflow** (`ci.yml`)
**Triggers:** Push to main/develop, Pull Requests
**Purpose:** Test builds and ensure code quality

#### 3. **ZIP Release Workflow** (`zip-release.yml`)
**Triggers:** Manual dispatch only
**Builds:** Portable ZIP files for macOS (no installation required)

### 🚀 How to Create a Release

#### Option 1: Using Git Tags (Recommended)
```bash
# Create and push a tag
git tag v2.0.0
git push origin v2.0.0
```
This automatically triggers the release workflow and creates a GitHub release with macOS builds.

#### Option 2: Manual Dispatch
1. Go to **Actions** tab in your GitHub repository
2. Select **"Release DeskMaster"** workflow
3. Click **"Run workflow"**
4. Enter version (e.g., `v2.0.0`)
5. Click **"Run workflow"**

#### Option 3: Create ZIP Release
1. Go to **Actions** tab
2. Select **"Create ZIP Release"** workflow
3. Click **"Run workflow"**
4. Enter version and confirm ZIP creation
5. Portable ZIP files will be created for macOS

### 📁 Generated Artifacts

Each release includes:

**macOS:**
- `DeskMaster-v2.0.0-arm64.dmg` (Apple Silicon - 182MB)
- `DeskMaster-v2.0.0-x64.dmg` (Intel Mac - 555MB)
**ZIP Releases:**
- `DeskMaster-v2.0.0-macOS-AppleSilicon.zip`
- `DeskMaster-v2.0.0-macOS-Intel.zip`

## 🛠️ Development

### Development Mode (with hot reload)
```bash
npm run dev-app
```

This will:
- Start webpack in watch mode to rebuild on changes
- Start Electron in development mode
- Automatically reload when you make changes

### Manual Development Commands
```bash
# Build React app only
npm run build-react

# Watch for changes
npm run watch

# Start Electron in dev mode
npm run dev
```

## 📁 Project Structure

```
├── src/                          # React source code
│   ├── components/               # React components
│   │   ├── Header.js            # App header component
│   │   ├── StatsManager.js      # System stats display
│   │   ├── TimezoneManager.js   # World clocks functionality
│   │   ├── TimezoneDropdown.js  # Timezone search dropdown
│   │   └── TrayIcon.js          # Tray icon component
│   ├── App.js                   # Main React app component
│   ├── index.js                 # Main app entry point
│   ├── tray.js                  # Tray icon entry point
│   ├── index.css                # Main app Tailwind CSS styles
│   └── tray.css                 # Tray icon CSS styles
├── dist/                        # Built React apps (generated)
│   ├── index.html              # Main app HTML file
│   ├── tray-icon.html          # Tray icon HTML file
│   ├── main.bundle.js          # Main app JavaScript bundle
│   └── tray.bundle.js          # Tray icon JavaScript bundle
├── webpack.config.js           # Webpack configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
├── build.js                    # Build script
├── dev.js                      # Development script
└── main.js                     # Electron main process
```

## 🎨 Styling

The application uses Tailwind CSS with custom color scheme:

- **Background**: Dark theme with transparency
- **Cards**: Semi-transparent with hover effects
- **Accent Colors**: 
  - CPU: Red (`#ff6b6b`)
  - Memory: Teal (`#4ecdc4`)
  - Disk: Blue (`#45b7d1`)
  - Network: Green (`#96ceb4`)
  - Battery: Success green (`#51cf66`)

## 🔧 Key Features

### React Components
- **Header**: App title and close button
- **StatsManager**: Real-time system statistics display
- **TimezoneManager**: World clocks with add/remove functionality
- **TimezoneDropdown**: Searchable timezone selection
- **TrayIcon**: System tray icon with live stats and timezone display

### Electron Integration
- IPC communication for real-time stats
- Theme management
- Window controls
- Tray icon functionality with React rendering
- Live system stats in system tray
- Dynamic timezone display in tray
- Automatic theme switching for tray icon

## 📦 Build Process

1. **Webpack** bundles React components and assets
2. **Tailwind CSS** processes styles with PostCSS
3. **Babel** transpiles JSX and modern JavaScript
4. **Electron** loads the built React app

## 🚀 Deployment

```bash
# Build for production
npm run build-app

# Create distributable
npm run dist
```

## 🔄 Migration Notes

### What Changed
- ✅ Converted vanilla JS to React components
- ✅ Replaced custom CSS with Tailwind CSS
- ✅ Added webpack build system
- ✅ Maintained all original functionality
- ✅ Improved code organization and maintainability

### What Stayed the Same
- ✅ Electron main process (`main.js`)
- ✅ IPC communication patterns
- ✅ System monitoring functionality
- ✅ Timezone management features
- ✅ UI/UX design and behavior

## 🐛 Troubleshooting

### Build Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild React app
npm run build-app
```

### Development Issues
```bash
# Check if webpack is running
npm run watch

# Check Electron logs
npm run dev
```

## 📚 Dependencies

### Production
- React 18.2.0
- React DOM 18.2.0
- Chart.js 4.4.0
- React Chart.js 2 5.2.0

### Development
- Webpack 5.88.0
- Babel 7.23.0
- Tailwind CSS 3.3.0
- PostCSS 8.4.0

## 🎯 Next Steps

- [ ] Add unit tests with Jest
- [ ] Implement error boundaries
- [ ] Add TypeScript support
- [ ] Optimize bundle size
- [ ] Add PWA features

---

## 📖 User Documentation

For end-user documentation, installation instructions, and feature overview, please see:
- **[README.md](README.md)** - User guide, installation, and features
- **[HOW-TO-USE.md](HOW-TO-USE.md)** - Detailed usage instructions

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Setup
1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/deskmaster.git`
3. Install dependencies: `npm install`
4. Start development: `npm run dev`

### Making Changes
1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Make your changes
3. Test thoroughly
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Guidelines
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all builds pass

## 🙏 Acknowledgments

- Built with [Electron](https://electronjs.org/)
- UI powered by [React](https://reactjs.org/) and [Tailwind CSS](https://tailwindcss.com/)
- System monitoring via [systeminformation](https://github.com/sebhildebrandt/systeminformation)
- Timezone handling with [moment-timezone](https://momentjs.com/timezone/)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
