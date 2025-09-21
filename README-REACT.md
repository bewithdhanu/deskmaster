# DeskMaster - React + Tailwind CSS

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
