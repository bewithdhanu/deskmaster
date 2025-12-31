// Load environment variables
require('dotenv').config()

const { app, BrowserWindow, Tray, nativeImage, ipcMain, Menu, nativeTheme, systemPreferences, dialog } = require("electron")
const path = require("path")
const fs = require("fs")
const http = require("http")
const WebSocket = require("ws")
const config = require("./config")
const stats = require("./stats")
const history = require("./history")
const clipboardTracker = require("./clipboard")
const authenticator = require("./authenticator")
const bcrypt = require("bcryptjs")
const { spawn } = require("child_process")
const { randomUUID } = require("crypto")

// Only load auto-launch in production
let AutoLaunch = null
if (process.env.NODE_ENV === 'production' || !process.env.NODE_ENV) {
  try {
    AutoLaunch = require('auto-launch')
  } catch (error) {
    console.warn('Auto-launch not available:', error.message)
  }
}

// Enable live reload for development
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    })
  } catch (error) {
    console.warn('Electron-reload not available:', error.message)
  }
}

let tray = null
let win = null
let trayIconWindow = null
let aboutWindow = null
let statsInterval = null
let trayUpdateInterval = null

// Settings management - will be loaded from config
let appSettings = {};

// Pinggy tunnel instances
const pinggyInstances = new Map() // Map<instanceId, { process, port, urls, options }>

// WebSocket and HTTP server for browser access
let wss = null
let httpServer = null
let staticServer = null
const WS_PORT = 65531
const HTTP_PORT = 65532
const STATIC_PORT = 65530
const connectedClients = new Set()
let totpBroadcastInterval = null
let lastTOTPCodes = null

// Security: Generate a secret token for API authentication (only accessible within Electron app)
const crypto = require('crypto')
const API_SECRET_TOKEN = crypto.randomBytes(32).toString('hex')

// Helper function to get the effective theme based on user preference
function getEffectiveTheme() {
  if (appSettings.theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  }
  return appSettings.theme || 'system';
}

// Auto-launch configuration (only in production)
let autoLauncher = null
if (AutoLaunch) {
  autoLauncher = new AutoLaunch({
    name: 'DeskMaster',
    path: process.execPath,
    isHidden: true
  })
}


function createTrayIconWindow() {
  trayIconWindow = new BrowserWindow({
    width: 200,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'assets/icons/app-icon-256.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: true,
      devTools: process.env.NODE_ENV === 'development', // Enable DevTools only in development
    },
  })

  const distPath = app.isPackaged ? app.getAppPath() : __dirname;
  trayIconWindow.loadFile(path.join(distPath, "dist", "tray-icon.html"))
  
  trayIconWindow.webContents.on('did-finish-load', () => {
    // Open DevTools for tray window debugging
    // trayIconWindow.webContents.openDevTools()
    updateTrayIcon()
  })
}

function createAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus()
    return
  }

  aboutWindow = new BrowserWindow({
    width: 400,
    height: 400,
    show: false,
    frame: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'About DeskMaster',
    icon: path.join(__dirname, 'assets/icons/app-icon-256.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: process.env.NODE_ENV === 'production', // Disable web security only in development
      devTools: process.env.NODE_ENV === 'development', // Enable DevTools only in development
    },
  })

  const distPath = app.isPackaged ? app.getAppPath() : __dirname;
  aboutWindow.loadFile(path.join(distPath, "dist", "about.html"))

  aboutWindow.once('ready-to-show', () => {
    aboutWindow.show()
    aboutWindow.focus()
  })

  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
}

function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // Calculate 80% of screen size with max dimensions
  const windowWidth = Math.min(Math.floor(screenWidth * 0.8), 1100);
  const windowHeight = Math.min(Math.floor(screenHeight * 0.8), 700);
  
  win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    show: false,
    frame: true,
    resizable: true,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: 'DeskMaster - Desktop Productivity Tool',
    icon: path.join(__dirname, 'assets/icons/app-icon-256.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: process.env.NODE_ENV === 'development', // Enable DevTools only in development
      webSecurity: process.env.NODE_ENV === 'production', // Disable web security only in development
    },
  })

  // Load React app from dist folder
  // Use proper path resolution for both dev and production
  const distPath = app.isPackaged ? app.getAppPath() : __dirname;
  win.loadFile(path.join(distPath, "dist", "index.html"))

  // Open DevTools for debugging (only in development, but not automatically)
  if (process.env.NODE_ENV === 'development') {
    // DevTools available but not opened automatically
    // User can open manually with Cmd+Option+I or right-click context menu
  }

  win.webContents.on('did-finish-load', () => {
    // Send initial theme to renderer
    const effectiveTheme = getEffectiveTheme()
    console.log('Sending initial theme to renderer:', effectiveTheme, '(user setting:', appSettings.theme, ')')
    win.webContents.send('theme-changed', effectiveTheme)
  })

  // Ensure window is ready before showing
  win.once('ready-to-show', () => {
    // Window is ready, but don't auto-show
    // It will be shown when user clicks tray icon
  })

  // Add keyboard shortcut to toggle DevTools (only in development)
  if (process.env.NODE_ENV === 'development') {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        win.webContents.toggleDevTools()
      }
    })
  }

  // Add context menu for DevTools (only in development)
  if (process.env.NODE_ENV === 'development') {
    win.webContents.on('context-menu', (event, params) => {
      const menu = Menu.buildFromTemplate([
        {
          label: 'Inspect Element',
          click: () => {
            win.webContents.inspectElement(params.x, params.y)
          }
        },
        {
          label: 'Toggle DevTools',
          click: () => {
            win.webContents.toggleDevTools()
          }
        }
      ])
      menu.popup()
    })
  }
  
  win.on("hide", () => {
    // Don't stop stats updates when window is hidden
    // Stats need to continue for WebSocket clients and tray
  })

  win.on("closed", () => {
    win = null
    // Don't stop stats updates when window is closed
    // Stats need to continue for WebSocket clients and tray
  })
}

async function updateTrayIcon() {
  if (!trayIconWindow || !tray) return

  try {
    const currentStats = await stats.updateTrayStats();
    const allTimezones = config.getTimezones();
    
    // Filter timezones to only show those with showInTray: true (default to true if not set)
    const timezones = allTimezones.filter(tz => tz.showInTray !== false);

    // Debug: Log timezone data

    // Get effective theme based on user preference
    const effectiveTheme = getEffectiveTheme();
    
    // Send current stats to tray icon window
    trayIconWindow.webContents.send('update-tray-stats', {
      ...currentStats,
      timezones: timezones,
      theme: effectiveTheme,
      settings: appSettings
    })
    // log all html contents of trayIconWindow
    // console.log(await trayIconWindow.webContents.executeJavaScript('document.documentElement.outerHTML'))

    // Calculate dynamic width based on enabled stats
    let enabledStatsCount = 0;
    if (appSettings.stats.cpu) enabledStatsCount++;
    if (appSettings.stats.ram) enabledStatsCount++;
    if (appSettings.stats.disk) enabledStatsCount++;
    if (appSettings.stats.network) enabledStatsCount++;
    if (appSettings.stats.battery && currentStats.battery) enabledStatsCount++;
    
    // Base width for stats + timezones + padding
    const baseWidth = 20; // Base padding
    const statWidth = enabledStatsCount * 18; // Each stat takes ~18px
    const timezoneWidth = timezones.length * 72; // Each timezone takes ~72px (only those shown in tray)
    const padding = (enabledStatsCount + timezones.length) * 4; // 4px padding between items
    
    const width = baseWidth + statWidth + timezoneWidth + padding;
    const height = 17;
    
    // Resize the tray window to accommodate all content
    trayIconWindow.setSize(Math.ceil(width), height)
    
    const image = await trayIconWindow.webContents.capturePage({
      x: 0,
      y: 0,
      width: width,
      height: height
    })
    
    if (image && !image.isEmpty()) {
      // Resize the image to appropriate tray icon size
      const resizedImage = image.resize({ 
        width: process.platform === 'darwin' ? 22*width/height : 32*width/height,
        height: process.platform === 'darwin' ? 22 : 32,
        quality: 'best'
      })
      tray.setImage(resizedImage)
    }
  } catch (error) {
    console.error('Error updating tray icon:', error)
    tray.setTitle("")
  }
}

async function sendDetailedStatsToRenderer() {
  try {
    const detailedStats = await stats.getDetailedStats();
    const timezones = config.getTimezones();

    // Add theme info to stats object
    detailedStats.theme = getEffectiveTheme();
    detailedStats.timezones = timezones;
    detailedStats.settings = appSettings;

    // Send to Electron window if it exists and is not destroyed
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send("detailed-stats-update", detailedStats);
    }
    
    // Always broadcast to WebSocket clients (browser) regardless of window state
    broadcastStats(detailedStats);
  } catch (error) {
    console.error("Error sending detailed stats:", error);
    // Don't clear interval on error - keep trying
  }
}

// Broadcast stats to all connected WebSocket clients
function broadcastStats(statsData) {
  if (wss && connectedClients.size > 0) {
    const message = JSON.stringify({
      type: 'detailed-stats-update',
      data: statsData
    });
    
    connectedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      } else {
        connectedClients.delete(client);
      }
    });
  }
}

// Broadcast TOTP codes to all connected WebSocket clients
function broadcastTOTPCodes(codes, timeRemaining) {
  if (wss && connectedClients.size > 0) {
    const message = JSON.stringify({
      type: 'totp-codes-update',
      data: {
        codes,
        timeRemaining
      }
    });
    
    connectedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      } else {
        connectedClients.delete(client);
      }
    });
  }
}

// Broadcast clipboard update to all connected WebSocket clients
function broadcastClipboardUpdate() {
  if (wss && connectedClients.size > 0) {
    const message = JSON.stringify({
      type: 'clipboard-updated',
      data: { timestamp: Date.now() }
    });
    
    connectedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      } else {
        connectedClients.delete(client);
      }
    });
  }
}

// Start TOTP code broadcasting via WebSocket
function startTOTPBroadcasting() {
  // Clear existing interval if any
  if (totpBroadcastInterval) {
    clearInterval(totpBroadcastInterval);
  }
  
  // Broadcast TOTP codes every second (to check for changes)
  // Codes only change every 30 seconds, but we check frequently for smooth timer updates
  totpBroadcastInterval = setInterval(async () => {
    try {
      // Get all authenticators
      const authenticators = await authenticator.getAllAuthenticators();
      
      if (authenticators.length === 0) {
        return;
      }
      
      // Get all secrets
      const secrets = authenticators.map(auth => auth.secret).filter(Boolean);
      
      if (secrets.length === 0) {
        return;
      }
      
      // Get all codes
      const codes = authenticator.getAllTOTPCodes(secrets);
      const timeRemaining = authenticator.getTimeRemaining();
      
      // Only broadcast if codes changed (to avoid unnecessary updates)
      const codesString = JSON.stringify(codes);
      if (codesString !== lastTOTPCodes) {
        lastTOTPCodes = codesString;
        broadcastTOTPCodes(codes, timeRemaining);
      } else {
        // Still broadcast time remaining updates for smooth countdown
        // But only if we have connected clients
        if (wss && connectedClients.size > 0) {
          broadcastTOTPCodes(codes, timeRemaining);
        }
      }
    } catch (error) {
      console.error('Error broadcasting TOTP codes:', error);
    }
  }, 1000); // Check every second for timer updates
}

// Stop TOTP code broadcasting
function stopTOTPBroadcasting() {
  if (totpBroadcastInterval) {
    clearInterval(totpBroadcastInterval);
    totpBroadcastInterval = null;
  }
}

// Helper function to get the correct path for dist folder (works in dev and production)
function getDistPath() {
  // In production, app is packaged in app.asar
  // app.getAppPath() returns the path to app.asar or the unpacked app directory
  if (app.isPackaged) {
    // In production, dist is inside app.asar
    return path.join(app.getAppPath(), 'dist');
  } else {
    // In development, use __dirname
    return path.join(__dirname, 'dist');
  }
}

// Start WebSocket and HTTP servers for browser access
function startBrowserServers() {
  const fs = require('fs');
  const { URL } = require('url');
  const distPath = getDistPath();
  
  // MIME types for static file server
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
  };
  
  // Static file server for serving the web UI
  try {
    staticServer = http.createServer((req, res) => {
      // Security: Validate request origin - only allow localhost
      const origin = req.headers.origin || req.headers.referer || '';
      const host = req.headers.host || '';
      const remoteAddress = req.socket.remoteAddress || '';
      
      const isLocalhost = 
        remoteAddress === '127.0.0.1' || 
        remoteAddress === '::1' || 
        remoteAddress === '::ffff:127.0.0.1' ||
        host.includes('localhost') ||
        host.includes('127.0.0.1') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');
      
      // Block all external requests
      if (!isLocalhost) {
        console.warn(`🚫 Blocked unauthorized static file request from ${remoteAddress} - ${req.url}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Access restricted to localhost only');
        return;
      }
      
      const parsedUrl = new URL(req.url, `http://localhost:${STATIC_PORT}`);
      let pathname = parsedUrl.pathname;
      
      // Handle favicon.ico requests - serve the app icon
      if (pathname === '/favicon.ico' || pathname === '/assets/icons/app-icon-256.png') {
        const faviconPath = path.join(distPath, 'assets', 'icons', 'app-icon-256.png');
        fs.readFile(faviconPath, (err, data) => {
          if (err) {
            // Fallback: return 204 if icon not found
            res.writeHead(204, { 'Content-Type': 'image/x-icon' });
            res.end();
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Access-Control-Allow-Origin': origin || `http://localhost:${STATIC_PORT}`,
            'Cache-Control': 'public, max-age=31536000'
          });
          res.end(data);
        });
        return;
      }
      
      // Default to index.html
      if (pathname === '/') {
        pathname = '/index.html';
      }
      
      // Security: prevent directory traversal
      const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(distPath, safePath);
      
      // Check if file exists
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        
        // Read and serve file
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
            return;
          }
          
          // Get MIME type
          const ext = path.extname(filePath).toLowerCase();
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          
          // Inject API token into HTML files for browser mode
          let fileData = data;
          if (ext === '.html') {
            const htmlContent = data.toString();
            // Inject token as a script tag before closing </head> or at the start of <body>
            const tokenScript = `<script>window.DESKMASTER_API_TOKEN = '${API_SECRET_TOKEN}'; localStorage.setItem('deskmaster_api_token', '${API_SECRET_TOKEN}');</script>`;
            if (htmlContent.includes('</head>')) {
              fileData = Buffer.from(htmlContent.replace('</head>', `${tokenScript}</head>`));
            } else if (htmlContent.includes('<body>')) {
              fileData = Buffer.from(htmlContent.replace('<body>', `<body>${tokenScript}`));
            } else {
              // If no head or body, prepend to the beginning
              fileData = Buffer.from(`${tokenScript}${htmlContent}`);
            }
          }
          
          // Set headers - only allow localhost CORS
          res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': origin || `http://localhost:${STATIC_PORT}`,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
            'Cache-Control': 'no-cache'
          });
          
          res.end(fileData);
        });
      });
    });
    
    // Bind to localhost only (127.0.0.1) - prevents external access
    staticServer.listen(STATIC_PORT, '127.0.0.1', () => {
      console.log(`🌐 Static file server started on http://127.0.0.1:${STATIC_PORT} (localhost only)`);
    });
    
    staticServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`⚠️  Static server port ${STATIC_PORT} is already in use. Browser access may not work.`);
      } else {
        console.error('Static server error:', error);
      }
    });
  } catch (error) {
    console.error('Failed to start static file server:', error);
  }
  
  // WebSocket server for real-time stats
  try {
    // Bind to localhost only (127.0.0.1) - prevents external access
    wss = new WebSocket.Server({ port: WS_PORT, host: '127.0.0.1' });
    
    wss.on('connection', (ws, req) => {
      // Security: Validate request origin - only allow localhost
      const origin = req.headers.origin || req.headers.referer || '';
      const remoteAddress = req.socket.remoteAddress || '';
      
      const isLocalhost = 
        remoteAddress === '127.0.0.1' || 
        remoteAddress === '::1' || 
        remoteAddress === '::ffff:127.0.0.1' ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');
      
      if (!isLocalhost) {
        console.warn(`🚫 Blocked unauthorized WebSocket connection from ${remoteAddress}`);
        ws.close(1008, 'Forbidden: WebSocket access restricted to localhost only');
        return;
      }
      
      console.log('🌐 Browser client connected via WebSocket');
      connectedClients.add(ws);
      
      // Send initial stats
      sendInitialStatsToClient(ws);
      
      ws.on('close', () => {
        console.log('🌐 Browser client disconnected');
        connectedClients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedClients.delete(ws);
      });
    });
    
    wss.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`⚠️  WebSocket port ${WS_PORT} is already in use. Browser access may not work.`);
      } else {
        console.error('WebSocket server error:', error);
      }
    });
    
    console.log(`🔌 WebSocket server started on ws://localhost:${WS_PORT}`);
  } catch (error) {
    console.error('Failed to start WebSocket server:', error);
  }
  
  // HTTP server for IPC-like commands
  httpServer = http.createServer((req, res) => {
    // Security: Validate request origin - only allow localhost/127.0.0.1
    const origin = req.headers.origin || req.headers.referer || '';
    const host = req.headers.host || '';
    const remoteAddress = req.socket.remoteAddress || '';
    const authToken = req.headers['x-api-token'] || req.headers['authorization']?.replace('Bearer ', '');
    
    // Check if request is from localhost only
    const isLocalhost = 
      remoteAddress === '127.0.0.1' || 
      remoteAddress === '::1' || 
      remoteAddress === '::ffff:127.0.0.1' ||
      host.includes('localhost') ||
      host.includes('127.0.0.1') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1');
    
    // Check for Electron-specific header (set by Electron's webContents)
    const isElectronRequest = req.headers['user-agent']?.includes('Electron') || 
                              req.headers['x-electron-request'] === 'true';
    
    // Set CORS headers FIRST (before blocking) to allow preflight requests
    if (isLocalhost) {
      res.setHeader('Access-Control-Allow-Origin', origin || 'http://localhost:' + STATIC_PORT);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Electron-Request, X-Api-Token, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    // Handle OPTIONS preflight requests immediately (before token validation)
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Validate secret token (required for all API requests except OPTIONS)
    const hasValidToken = authToken === API_SECRET_TOKEN;
    
    // Block all external requests
    if (!isLocalhost) {
      console.warn(`🚫 Blocked unauthorized API request from ${remoteAddress} - ${req.url} (not localhost)`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: API access restricted to localhost only' }));
      return;
    }
    
    // Block requests without valid token
    if (!hasValidToken) {
      console.warn(`🚫 Blocked API request from ${remoteAddress} - ${req.url} (missing or invalid token)`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Invalid or missing API token' }));
      return;
    }
    
    // Handle GET requests immediately (no body to read)
    if (req.method === 'GET') {
      handleGetRequest(req, res);
      return;
    }
    
    // Handle POST requests (need to read body)
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      await handlePostRequest(req, res, body);
    });
  });
  
  // Handle GET requests
  async function handleGetRequest(req, res) {
    try {
      if (req.url === '/api/get-settings') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(appSettings));
      } else if (req.url.startsWith('/api/history') && req.url !== '/api/history/range') {
        // Parse query parameters
        const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
        const startTime = parseInt(url.searchParams.get('startTime')) || Date.now() - (24 * 60 * 60 * 1000);
        const endTime = parseInt(url.searchParams.get('endTime')) || Date.now();
        
        try {
          const historyData = await history.getHistory(startTime, endTime);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(historyData));
        } catch (error) {
          console.error('Error getting history:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/history/range') {
        try {
          const timeRange = await history.getTimeRange();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(timeRange));
        } catch (error) {
          console.error('Error getting history range:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-public-ip') {
        try {
          const https = require('https');
          https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (ipRes) => {
            let data = '';
            ipRes.on('data', (chunk) => {
              data += chunk;
            });
            ipRes.on('end', () => {
              try {
                const result = JSON.parse(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ip: result.ip }));
              } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to parse IP response' }));
              }
            });
          }).on('error', (error) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          });
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url.startsWith('/api/get-clipboard-history')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        try {
          const history = await clipboardTracker.getClipboardHistory(limit);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(history));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url.startsWith('/api/search-clipboard-history')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const query = url.searchParams.get('query') || '';
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        try {
          const results = await clipboardTracker.searchClipboardHistory(query, limit);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-pinggy-instances') {
        try {
          const instances = Array.from(pinggyInstances.values()).map(instance => ({
            id: instance.id,
            port: instance.port,
            urls: instance.urls,
            options: instance.options,
            startTime: instance.startTime
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(instances));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-authenticators') {
        try {
          const data = await authenticator.getAllAuthenticators();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-totp-time-remaining') {
        try {
          const remaining = authenticator.getTimeRemaining();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ remaining }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-trash-entries') {
        try {
          const entries = await authenticator.getTrashEntries();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ entries }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      console.error('HTTP GET API error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }
  
  // Handle POST requests
  async function handlePostRequest(req, res, body) {
    try {
      if (req.url === '/api/update-settings') {
        const newSettings = JSON.parse(body);
        config.setAppSettings(newSettings);
        appSettings = config.getAppSettings();
        
        // Broadcast settings update to WebSocket clients
        if (wss && connectedClients.size > 0) {
          const message = JSON.stringify({
            type: 'settings-updated',
            data: appSettings
          });
          connectedClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          });
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(appSettings));
      } else if (req.url === '/api/toggle-auto-start') {
        const { enabled } = JSON.parse(body);
        const success = await toggleAutoStart(enabled);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } else if (req.url === '/api/toggle-web-access') {
        const { enabled } = JSON.parse(body);
        appSettings.webAccess = enabled;
        config.updateAppSetting('webAccess', enabled);
        
        if (enabled) {
          if (!wss || !httpServer) {
            startBrowserServers();
          }
        } else {
          if (staticServer) {
            staticServer.close();
            staticServer = null;
          }
          if (wss) {
            wss.close();
            wss = null;
            connectedClients.clear();
          }
          if (httpServer) {
            httpServer.close();
            httpServer = null;
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (req.url === '/api/authenticate-user') {
        const { reason } = JSON.parse(body);
        try {
          let result;
          if (process.platform === 'darwin') {
            await systemPreferences.promptTouchID(reason || 'Access to this feature requires authentication');
            result = { success: true, authenticated: true };
          } else {
            const { dialog } = require('electron');
            const response = await dialog.showMessageBox(win, {
              type: 'question',
              buttons: ['Cancel', 'Authenticate'],
              defaultId: 1,
              title: 'Authentication Required',
              message: reason || 'Access to this feature requires authentication',
              detail: 'Please authenticate to access this feature.',
              cancelId: 0
            });
            result = { 
              success: response.response === 1, 
              authenticated: response.response === 1 
            };
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          console.error('Authentication error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, authenticated: false, error: error.message }));
        }
      } else if (req.url === '/api/export-all-data') {
        // Export requires file dialog - only available via IPC, not HTTP API
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Export is only available in Electron app mode' }));
      } else if (req.url === '/api/import-all-data') {
        // Import requires file dialog - only available via IPC, not HTTP API
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Import is only available in Electron app mode' }));
      } else if (req.url === '/api/reset-all-data') {
        try {
          // Clear authenticators
          const existingAuths = await authenticator.getAllAuthenticators();
          for (const auth of existingAuths) {
            await authenticator.deleteAuthenticator(auth.id);
          }

          // Clear clipboard history
          await clipboardTracker.clearClipboardHistory();

          // Clear performance stats history
          await history.clearAllHistory();

          // Reset settings to defaults
          const defaultSettings = {
            stats: {
              cpu: true,
              ram: true,
              disk: true,
              network: true,
              battery: true
            },
            timezones: [],
            datetimeFormat: 'HH:mm:ss',
            autoStart: false,
            theme: 'system',
            webAccess: false,
            apiKeys: {
              chatgpt: '',
              ipLocation: ''
            },
            toolOrder: []
          };
          config.setAppSettings(defaultSettings);
          appSettings = config.getAppSettings();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error('Error resetting data:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/bcrypt-generate') {
        const { text } = JSON.parse(body);
        try {
          const saltRounds = 10;
          const hash = await bcrypt.hash(text, saltRounds);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hash }));
        } catch (error) {
          console.error('Error generating bcrypt hash:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/bcrypt-verify') {
        const { text, hash } = JSON.parse(body);
        try {
          const isValid = await bcrypt.compare(text, hash);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ isValid }));
        } catch (error) {
          console.error('Error verifying bcrypt hash:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-public-ip') {
        try {
          const https = require('https');
          https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (ipRes) => {
            let data = '';
            ipRes.on('data', (chunk) => {
              data += chunk;
            });
            ipRes.on('end', () => {
              try {
                const result = JSON.parse(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ip: result.ip }));
              } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to parse IP response' }));
              }
            });
          }).on('error', (error) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          });
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-ip-location') {
        const { ips } = JSON.parse(body);
        try {
          const https = require('https');
          const apiKey = appSettings.apiKeys?.ipLocation || process.env.IPGEOLOCATION_API_KEY;
          
          if (!apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'IPGeolocation API key not found. Please set it in Settings > API Keys' }));
            return;
          }
          
          const results = await Promise.all(
            ips.map(ip => {
              return new Promise((resolve) => {
                const url = `https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&ip=${encodeURIComponent(ip)}`;
                https.get(url, { timeout: 10000 }, (ipRes) => {
                  let data = '';
                  ipRes.on('data', (chunk) => {
                    data += chunk;
                  });
                  ipRes.on('end', () => {
                    try {
                      const result = JSON.parse(data);
                      if (result.message || result.error) {
                        resolve({ ip, error: result.message || result.error || 'Invalid IP address' });
                      } else {
                        resolve({
                          ip: result.ip || ip,
                          country: result.country_name,
                          region: result.state_prov,
                          city: result.city,
                          zip: result.zipcode,
                          lat: result.latitude,
                          lon: result.longitude,
                          isp: result.isp,
                          org: result.organization || result.isp
                        });
                      }
                    } catch (error) {
                      resolve({ ip, error: 'Failed to parse location data' });
                    }
                  });
                }).on('error', (error) => {
                  resolve({ ip, error: error.message || 'Network error' });
                });
              });
            })
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/start-pinggy-tunnel') {
        const { port, options } = JSON.parse(body);
        try {
          const instance = await startPinggyTunnel({ port, options });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(instance));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/stop-pinggy-tunnel') {
        const { instanceId } = JSON.parse(body);
        try {
          await stopPinggyTunnel(instanceId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/translate-text') {
        const { text, targetLanguage } = JSON.parse(body);
        try {
          const apiKey = appSettings.apiKeys?.chatgpt;
          
          if (!apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'ChatGPT API key not found. Please set it in Settings > API Keys' }));
            return;
          }

          if (!targetLanguage || !targetLanguage.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Target language is required' }));
            return;
          }

          const https = require('https');
          const requestData = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the given text to ${targetLanguage.trim()}. Preserve the original meaning, tone, and style. Only provide the translation, no explanations or additional text.`
              },
              {
                role: 'user',
                content: `Translate the following text to ${targetLanguage.trim()}:\n\n${text}`
              }
            ],
            temperature: 0.3,
            max_tokens: 2000
          });

          const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Content-Length': Buffer.byteLength(requestData)
            },
            timeout: 30000
          };

          const httpsReq = https.request(options, (httpsRes) => {
            let data = '';
            httpsRes.on('data', (chunk) => {
              data += chunk;
            });
            httpsRes.on('end', () => {
              try {
                if (httpsRes.statusCode !== 200) {
                  const error = JSON.parse(data);
                  res.writeHead(httpsRes.statusCode, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: error.error?.message || `API returned status ${httpsRes.statusCode}` }));
                  return;
                }
                const response = JSON.parse(data);
                if (response.choices && response.choices[0] && response.choices[0].message) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ text: response.choices[0].message.content.trim() }));
                } else {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Invalid response from API' }));
                }
              } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to parse API response' }));
              }
            });
          });

          httpsReq.on('error', (error) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Network error: ${error.message}` }));
          });

          httpsReq.on('timeout', () => {
            httpsReq.destroy();
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request timeout' }));
          });

          httpsReq.write(requestData);
          httpsReq.end();
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
        }
      } else if (req.url === '/api/delete-clipboard-entry') {
        const { id } = JSON.parse(body);
        try {
          await clipboardTracker.deleteClipboardEntry(id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/clear-clipboard-history') {
        try {
          await clipboardTracker.clearClipboardHistory();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/create-authenticator') {
        const data = JSON.parse(body);
        try {
          const result = await authenticator.createAuthenticator(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/update-authenticator') {
        const { id, ...data } = JSON.parse(body);
        try {
          const result = await authenticator.updateAuthenticator(id, data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/delete-authenticator') {
        const { id } = JSON.parse(body);
        try {
          await authenticator.deleteAuthenticator(id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-totp-code') {
        const { secret } = JSON.parse(body);
        try {
          const code = authenticator.getTOTPCode(secret);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-all-totp-codes') {
        const { secrets } = JSON.parse(body);
        try {
          if (!Array.isArray(secrets)) {
            throw new Error('secrets must be an array');
          }
          const codes = authenticator.getAllTOTPCodes(secrets);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ codes }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/get-trash-entries') {
        try {
          const entries = await authenticator.getTrashEntries();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ entries }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/restore-from-trash') {
        const { trashId } = JSON.parse(body);
        try {
          const result = await authenticator.restoreFromTrash(trashId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/permanently-delete-from-trash') {
        const { trashId } = JSON.parse(body);
        try {
          await authenticator.permanentlyDeleteFromTrash(trashId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/reformat-text') {
        const { text } = JSON.parse(body);
        try {
          const apiKey = appSettings.apiKeys?.chatgpt;
          
          if (!apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'ChatGPT API key not found. Please set it in Settings > API Keys' }));
            return;
          }

          const https = require('https');
          const requestData = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that reformats text to be more readable, well-structured, and properly formatted. Preserve all important information while improving clarity and structure.'
              },
              {
                role: 'user',
                content: `Please reformat the following text to make it more readable and well-structured:\n\n${text}`
              }
            ],
            temperature: 0.7,
            max_tokens: 2000
          });

          const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Content-Length': Buffer.byteLength(requestData)
            },
            timeout: 30000
          };

          const apiReq = https.request(options, (apiRes) => {
            let data = '';
            apiRes.on('data', (chunk) => {
              data += chunk;
            });
            apiRes.on('end', () => {
              try {
                if (apiRes.statusCode !== 200) {
                  const error = JSON.parse(data);
                  res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: error.error?.message || `API returned status ${apiRes.statusCode}` }));
                  return;
                }
                const result = JSON.parse(data);
                if (result.choices && result.choices.length > 0) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ text: result.choices[0].message.content }));
                } else {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'No response from ChatGPT API' }));
                }
              } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to parse API response' }));
              }
            });
          });

          apiReq.on('error', (error) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Request failed: ${error.message}` }));
          });

          apiReq.on('timeout', () => {
            apiReq.destroy();
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request timeout' }));
          });

          apiReq.write(requestData);
          apiReq.end();
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'Failed to reformat text' }));
        }
      } else if (req.url === '/api/get-pinggy-instances') {
        try {
          const instances = Array.from(pinggyInstances.values()).map(instance => ({
            id: instance.id,
            port: instance.port,
            urls: instance.urls,
            options: instance.options,
            startTime: instance.startTime
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(instances));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      console.error('HTTP POST API error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }
  
  // Bind to localhost only (127.0.0.1) - prevents external access
  httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
    console.log(`🌐 HTTP API server started on http://127.0.0.1:${HTTP_PORT} (localhost only)`);
  });
  
  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`⚠️  Port ${HTTP_PORT} is already in use. Browser API may not work.`);
    } else {
      console.error('HTTP server error:', error);
    }
  });
}

async function sendInitialStatsToClient(ws) {
  try {
    const detailedStats = await stats.getDetailedStats();
    const timezones = config.getTimezones();
    
    detailedStats.theme = getEffectiveTheme();
    detailedStats.timezones = timezones;
    detailedStats.settings = appSettings;
    
    const message = JSON.stringify({
      type: 'detailed-stats-update',
      data: detailedStats
    });
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  } catch (error) {
    console.error('Error sending initial stats to client:', error);
  }
}

// Auto-start functions (only available in production)
async function isAutoStartEnabled() {
  if (!autoLauncher) {
    return false
  }
  try {
    return await autoLauncher.isEnabled()
  } catch (error) {
    console.error('Error checking auto-start status:', error)
    return false
  }
}

async function enableAutoStart() {
  if (!autoLauncher) {
    console.log('Auto-start not available in development mode')
    return false
  }
  try {
    await autoLauncher.enable()
    console.log('Auto-start enabled')
    return true
  } catch (error) {
    console.error('Error enabling auto-start:', error)
    return false
  }
}

async function disableAutoStart() {
  if (!autoLauncher) {
    console.log('Auto-start not available in development mode')
    return false
  }
  try {
    await autoLauncher.disable()
    console.log('Auto-start disabled')
    return true
  } catch (error) {
    console.error('Error disabling auto-start:', error)
    return false
  }
}

function createContextMenu() {
  const menuItems = [
    {
      label: "Show Monitor",
      click: () => {
        if (win.isVisible()) {
          win.hide()
        } else {
          showWindow()
        }
      },
    },
  ]

  // Only add auto-start option in production
  if (autoLauncher) {
    menuItems.push(
      { type: "separator" },
      {
        label: "Start with Computer",
        type: "checkbox",
        checked: false, // Will be updated dynamically
        click: async (menuItem) => {
          if (menuItem.checked) {
            await enableAutoStart()
          } else {
            await disableAutoStart()
          }
          // Update the menu to reflect the current state
          updateContextMenu()
        },
      }
    )
  }

  menuItems.push(
    { type: "separator" },
    {
      label: "About",
      click: () => {
        createAboutWindow()
      },
    },
    {
      label: "Quit",
      click: () => {
        app.quit()
      },
    }
  )

  return Menu.buildFromTemplate(menuItems)
}

async function updateContextMenu() {
  if (tray) {
    const menu = createContextMenu()
    
    // Update the checkbox state only if auto-launch is available
    if (autoLauncher) {
      const isEnabled = await isAutoStartEnabled()
      const autoStartItem = menu.items.find(item => item.label === "Start with Computer")
      if (autoStartItem) {
        autoStartItem.checked = isEnabled
      }
    }
    
    tray.setContextMenu(menu)
  }
}

function showWindow() {
  // If window is destroyed, recreate it
  if (!win || win.isDestroyed()) {
    createWindow()
  }
  
  // Ensure window is ready before showing
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) {
      win.restore()
    }
    
  win.show()
  win.focus()
  }
  
  // Start stats updates if not already running
  // Stats should run continuously for WebSocket clients and tray, not just when window is open
  if (!statsInterval) {
  sendDetailedStatsToRenderer()
  statsInterval = setInterval(() => {sendDetailedStatsToRenderer()}, 1000)
  }
}

app.whenReady().then(async () => {
  // Load configuration from storage
  config.loadConfig()
  
  // Load app settings from config
  appSettings = config.getAppSettings()
  
  // Apply dock visibility setting
  updateDockVisibility()
  
  // Handle dock icon click (macOS only)
  if (process.platform === 'darwin') {
    app.on('activate', () => {
      // When dock icon is clicked, show the window
      showWindow()
    })
  }

  // Initialize history database
  try {
    await history.initDatabase()
    console.log('✅ History database initialized')
    
    // Clean up old data on startup
    await history.cleanupOldData()
  } catch (error) {
    console.error('Failed to initialize history database:', error)
  }

  // Initialize clipboard tracking database
  try {
    await clipboardTracker.initDatabase()
    console.log('✅ Clipboard tracking database initialized')
    
    // Set callback to broadcast clipboard updates via WebSocket
    clipboardTracker.setClipboardChangeCallback(() => {
      broadcastClipboardUpdate();
    });
    
    // Check accessibility permission before starting clipboard monitoring (macOS)
    if (process.platform === 'darwin') {
      const hasPermission = systemPreferences.isTrustedAccessibilityClient(false);
      if (!hasPermission) {
        console.warn('⚠️  Accessibility permission not granted. Clipboard source tracking may be limited.');
        console.warn('   Grant permission in System Settings → Privacy & Security → Accessibility');
      } else {
        console.log('✅ Accessibility permission granted');
      }
    }
    
    // Start clipboard monitoring
    clipboardTracker.startClipboardMonitoring()
    console.log('📋 Clipboard monitoring started')
  } catch (error) {
    console.error('Failed to initialize clipboard tracking:', error)
  }

  // Initialize authenticator database
  try {
    await authenticator.initDatabase()
    console.log('✅ Authenticator database initialized')
    
    // Start TOTP code broadcasting via WebSocket
    startTOTPBroadcasting()
  } catch (error) {
    console.error('Failed to initialize authenticator database:', error)
  }

  // Start WebSocket and HTTP servers for browser access if enabled
  if (appSettings.webAccess) {
    startBrowserServers()
  }

  createWindow()
  createTrayIconWindow()

  // Start stats updates immediately (for WebSocket clients and tray, not just window)
  // Stats should run continuously regardless of window state
  if (!statsInterval) {
    sendDetailedStatsToRenderer()
    statsInterval = setInterval(() => {sendDetailedStatsToRenderer()}, 1000)
  }

  // Create tray with our custom icon
  const trayIconPath = path.join(__dirname, 'assets/icons/tray-icon-22.png')
  tray = new Tray(trayIconPath)
  
  // Set tooltip based on environment
  const tooltip = process.env.NODE_ENV === 'development' 
    ? "DeskMaster - Desktop Productivity Tool (Development Mode)"
    : "DeskMaster - Desktop Productivity Tool"
  tray.setToolTip(tooltip)
  
  // Set up context menu with auto-start status
  updateContextMenu()
  tray.setIgnoreDoubleClickEvents(true)

  // Initial stats update
  updateTrayIcon()
  trayUpdateInterval = setInterval(updateTrayIcon, 2000)

  tray.on("click", (event, bounds) => {
    tray.setContextMenu(null)
    
    // Prevent rapid clicking
    if (tray._isProcessing) return
    tray._isProcessing = true
    
    setTimeout(() => {
      tray._isProcessing = false
    }, 100)
    
    // Check if window exists and is not destroyed
    if (win && !win.isDestroyed()) {
    if (win.isVisible()) {
        // Window is visible, hide it
      win.hide()
    } else {
        // Window exists but not visible, show it
        showWindow()
      }
    } else {
      // Window doesn't exist or is destroyed, create and show it
      showWindow()
    }
  })

  tray.on("right-click", (event, bounds) => {
    tray.setContextMenu(createContextMenu())
    console.log("Tray right-clicked", event, bounds)
    tray.popUpContextMenu()
  })

  nativeTheme.on("updated", () => {
    const effectiveTheme = getEffectiveTheme()
    console.log("Theme changed:", effectiveTheme, "(user setting:", appSettings.theme, ")")
    
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send("theme-changed", effectiveTheme)
    }
    // Update tray icon with new theme
    updateTrayIcon()
  })
})

ipcMain.handle("kill-process", async (event, pid) => {
  try {
    process.kill(pid, "SIGTERM")
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle("get-process-details", async (event, pid) => {
  try {
    const processes = await si.processes()
    const proc = processes.list.find((p) => p.pid === pid)
    return proc || null
  } catch (error) {
    return null
  }
})

// Timezone IPC handlers
ipcMain.on('get-timezones', (event) => {
  event.reply('timezones-loaded', config.getTimezones())
})

ipcMain.on('save-timezones', (event, newTimezones) => {
  config.setTimezones(newTimezones)
})

// IPC handlers
ipcMain.on("exit-app", () => {
  app.quit()
})


// IPC handler for About window
ipcMain.on('close-about-window', () => {
  if (aboutWindow) {
    aboutWindow.close()
  }
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

ipcMain.handle('get-app-icon-path', () => {
  return path.join(__dirname, 'assets/icons/app-icon-256.png')
})

// Settings IPC handlers
ipcMain.handle('get-settings', () => {
  return appSettings
})

// Function to update dock visibility
function updateDockVisibility() {
  if (process.platform === 'darwin') {
    if (appSettings.showInDock !== false) {
      app.dock.show()
    } else {
      app.dock.hide()
    }
  }
}

ipcMain.handle('update-settings', (event, newSettings) => {
  // Update settings in config storage
  config.setAppSettings(newSettings)
  
  // Reload settings from config to ensure consistency
  appSettings = config.getAppSettings()
  
  // Update dock visibility if setting changed
  if (newSettings.showInDock !== undefined) {
    updateDockVisibility()
  }
  
  // Check if theme changed and notify windows
  const effectiveTheme = getEffectiveTheme()
  
  // Notify all windows about settings update
  if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send('settings-updated', appSettings)
    // Also send theme change if theme was updated
    if (newSettings.theme !== undefined) {
      win.webContents.send('theme-changed', effectiveTheme)
  }
  }
  if (trayIconWindow && !trayIconWindow.isDestroyed() && trayIconWindow.webContents && !trayIconWindow.webContents.isDestroyed()) {
    trayIconWindow.webContents.send('settings-updated', appSettings)
  }
  
  // Update tray icon if theme changed
  if (newSettings.theme !== undefined) {
    updateTrayIcon()
  }
  
  // Broadcast settings update to WebSocket clients
  if (wss && connectedClients.size > 0) {
    const message = JSON.stringify({
      type: 'settings-updated',
      data: appSettings
    });
    const themeMessage = JSON.stringify({
      type: 'theme-changed',
      data: getEffectiveTheme()
    });
    connectedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        if (newSettings.theme !== undefined) {
          client.send(themeMessage);
        }
      }
    });
  }
  
  return appSettings
})

ipcMain.handle('toggle-web-access', async (event, enabled) => {
  appSettings.webAccess = enabled;
  config.updateAppSetting('webAccess', enabled);
  
  if (enabled) {
    // Start servers if not already running
    if (!wss || !httpServer) {
      startBrowserServers();
    }
  } else {
    // Stop servers
    if (staticServer) {
      staticServer.close();
      staticServer = null;
      console.log('🌐 Static file server stopped');
    }
    if (wss) {
      wss.close();
      wss = null;
      connectedClients.clear();
      console.log('🔌 WebSocket server stopped');
    }
    if (httpServer) {
      httpServer.close();
      httpServer = null;
      console.log('🌐 HTTP API server stopped');
    }
  }
  
  return true;
});

// Security: Provide API token to renderer process
ipcMain.handle('get-api-token', async () => {
  return API_SECRET_TOKEN;
});

// System Authentication Handler
// Prompts user for Touch ID or password authentication (macOS)
ipcMain.handle('authenticate-user', async (event, reason = 'Access to this feature requires authentication') => {
  try {
    // Check if we're on macOS
    if (process.platform === 'darwin') {
      // Use Touch ID or password prompt
      await systemPreferences.promptTouchID(reason);
      return { success: true, authenticated: true };
    } else {
      // For other platforms, use a dialog
      const response = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Cancel', 'Authenticate'],
        defaultId: 1,
        title: 'Authentication Required',
        message: reason,
        detail: 'Please authenticate to access this feature.',
        cancelId: 0
      });
      
      return { 
        success: response.response === 1, 
        authenticated: response.response === 1 
      };
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, authenticated: false, error: error.message };
  }
});

// Encryption helper functions
function encryptData(data, password) {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decryptData(encryptedData, password) {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

// Helper function to prompt for encryption key
async function promptEncryptionKey(title, message) {
  return new Promise((resolve) => {
    const inputWindow = new BrowserWindow({
      width: 400,
      height: 200,
      parent: win,
      modal: true,
      show: false,
      frame: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: ${getEffectiveTheme() === 'dark' ? '#1a1a1a' : '#ffffff'};
            color: ${getEffectiveTheme() === 'dark' ? '#ffffff' : '#000000'};
          }
          .container {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          label {
            font-size: 14px;
            font-weight: 500;
          }
          input {
            width: 100%;
            padding: 8px;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
          }
          .buttons {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 10px;
          }
          button {
            padding: 8px 16px;
            font-size: 14px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          .btn-primary {
            background: #007AFF;
            color: white;
          }
          .btn-secondary {
            background: #e0e0e0;
            color: #000;
          }
          button:hover {
            opacity: 0.8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <label>${message}</label>
          <input type="password" id="keyInput" placeholder="Encryption key..." autofocus />
          <div class="buttons">
            <button class="btn-secondary" onclick="cancel()">Cancel</button>
            <button class="btn-primary" onclick="submit()">OK</button>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          const input = document.getElementById('keyInput');
          
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              submit();
            }
          });
          
          function submit() {
            ipcRenderer.send('encryption-key-response', input.value);
            window.close();
          }
          
          function cancel() {
            ipcRenderer.send('encryption-key-response', null);
            window.close();
          }
        </script>
      </body>
      </html>
    `;

    inputWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    inputWindow.setTitle(title);
    inputWindow.once('ready-to-show', () => {
      inputWindow.show();
    });

    ipcMain.once('encryption-key-response', (event, key) => {
      inputWindow.close();
      resolve(key);
    });
  });
}

// Export all data handler
ipcMain.handle('export-all-data', async (event) => {
  try {
    // Prompt for encryption key (optional)
    const encryptionKey = await promptEncryptionKey('Export Encryption', 'Enter encryption key (leave empty to export without encryption):');
    
    // Collect all data
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      settings: config.getAppSettings(),
      authenticators: await authenticator.getAllAuthenticators(),
      clipboardHistory: await clipboardTracker.getClipboardHistory(10000), // Export all clipboard entries
      history: await history.getHistory(0, Date.now()) // Export all history
    };

    // Show save dialog
    const result = await dialog.showSaveDialog(win, {
      title: 'Export DeskMaster Data',
      defaultPath: `deskmaster-export-${new Date().toISOString().split('T')[0]}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, cancelled: true };
    }

    // Encrypt if key provided
    let fileContent;
    if (encryptionKey && encryptionKey.trim()) {
      const encrypted = encryptData(exportData, encryptionKey);
      fileContent = JSON.stringify({
        encrypted: true,
        ...encrypted
      }, null, 2);
    } else {
      fileContent = JSON.stringify(exportData, null, 2);
    }

    // Write to file
    fs.writeFileSync(result.filePath, fileContent, 'utf8');
    return { success: true, filePath: result.filePath, encrypted: !!encryptionKey };
  } catch (error) {
    console.error('Error exporting data:', error);
    throw error;
  }
});

// Import all data handler
ipcMain.handle('import-all-data', async (event) => {
  try {
    // Show open dialog
    const result = await dialog.showOpenDialog(win, {
      title: 'Import DeskMaster Data',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }

    const filePath = result.filePaths[0];
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsedContent = JSON.parse(fileContent);

    // Check if file is encrypted
    let importData;
    if (parsedContent.encrypted) {
      // Prompt for encryption key
      let encryptionKey = await promptEncryptionKey('Import Encryption Key', 'This file is encrypted. Enter encryption key:');
      
      if (!encryptionKey || !encryptionKey.trim()) {
        return { success: false, needsPassword: true, error: 'Encryption key is required for this file.' };
      }
      
      let decryptionAttempts = 0;
      while (decryptionAttempts < 3) {
        try {
          importData = decryptData(parsedContent, encryptionKey);
          break; // Success
        } catch (error) {
          decryptionAttempts++;
          if (decryptionAttempts >= 3) {
            return { success: false, needsPassword: true, error: 'Invalid encryption key. Maximum attempts reached.' };
          }
          encryptionKey = await promptEncryptionKey('Import Encryption Key', `Invalid key. Attempt ${decryptionAttempts + 1}/3. Enter encryption key:`);
          if (!encryptionKey || !encryptionKey.trim()) {
            return { success: false, needsPassword: true, error: 'Encryption key is required.' };
          }
        }
      }
    } else {
      importData = parsedContent;
    }

    // Validate import data structure
    if (!importData.settings || !importData.authenticators || !importData.clipboardHistory || !importData.history) {
      throw new Error('Invalid export file format');
    }

    // Import settings
    config.setAppSettings(importData.settings);
    appSettings = config.getAppSettings();

    // Import authenticators (clear existing and import new)
    const existingAuths = await authenticator.getAllAuthenticators();
    for (const auth of existingAuths) {
      await authenticator.deleteAuthenticator(auth.id);
    }
    for (const auth of importData.authenticators) {
      await authenticator.createAuthenticator({
        name: auth.name,
        secret: auth.secret,
        url: auth.url,
        username: auth.username,
        password: auth.password
      });
    }

    // Import clipboard history (clear existing and import new)
    await clipboardTracker.clearClipboardHistory();
    for (const entry of importData.clipboardHistory) {
      await clipboardTracker.storeClipboardEntry(entry.content, entry.source || 'imported');
    }

    // Import performance stats history (clear existing and import new)
    await history.clearAllHistory();
    if (importData.history && Array.isArray(importData.history) && importData.history.length > 0) {
      // Import history entries directly (preserves original timestamps)
      await history.importHistoryEntries(importData.history);
    }

    return { success: true };
  } catch (error) {
    console.error('Error importing data:', error);
    throw error;
  }
});

// Reset all data handler
ipcMain.handle('reset-all-data', async (event) => {
  try {
    // Clear authenticators
    const existingAuths = await authenticator.getAllAuthenticators();
    for (const auth of existingAuths) {
      await authenticator.deleteAuthenticator(auth.id);
    }

    // Clear clipboard history
    await clipboardTracker.clearClipboardHistory();

    // Clear performance stats history
    await history.clearAllHistory();

    // Reset settings to defaults
    const defaultSettings = {
      stats: {
        cpu: true,
        ram: true,
        disk: true,
        network: true,
        battery: true
      },
      timezones: [],
      datetimeFormat: 'HH:mm:ss',
      autoStart: false,
      theme: 'system',
      webAccess: false,
      apiKeys: {
        chatgpt: '',
        ipLocation: ''
      },
      toolOrder: []
    };
    config.setAppSettings(defaultSettings);
    appSettings = config.getAppSettings();

    return { success: true };
  } catch (error) {
    console.error('Error resetting data:', error);
    throw error;
  }
});

// Bcrypt IPC handlers
ipcMain.handle('bcrypt-generate', async (event, text) => {
  try {
    const saltRounds = 10;
    const hash = await bcrypt.hash(text, saltRounds);
    return hash;
  } catch (error) {
    console.error('Error generating bcrypt hash:', error);
    throw error;
  }
});

ipcMain.handle('bcrypt-verify', async (event, text, hash) => {
  try {
    const isValid = await bcrypt.compare(text, hash);
    return isValid;
  } catch (error) {
    console.error('Error verifying bcrypt hash:', error);
    return false;
  }
});

// Text Reformat IPC handler using ChatGPT API
// Translation IPC handler
ipcMain.handle('translate-text', async (event, text, targetLanguage) => {
  try {
    const https = require('https');
    const apiKey = appSettings.apiKeys?.chatgpt;
    
    if (!apiKey) {
      throw new Error('ChatGPT API key not found. Please set it in Settings > API Keys');
    }

    if (!targetLanguage || !targetLanguage.trim()) {
      throw new Error('Target language is required');
    }

    const requestData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the given text to ${targetLanguage.trim()}. Preserve the original meaning, tone, and style. Only provide the translation, no explanations or additional text.`
        },
        {
          role: 'user',
          content: `Translate the following text to ${targetLanguage.trim()}:\n\n${text}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(requestData)
        },
        timeout: 30000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              const error = JSON.parse(data);
              reject(new Error(error.error?.message || `API returned status ${res.statusCode}`));
              return;
            }
            const response = JSON.parse(data);
            if (response.choices && response.choices[0] && response.choices[0].message) {
              resolve(response.choices[0].message.content.trim());
            } else {
              reject(new Error('Invalid response from API'));
            }
          } catch (error) {
            reject(new Error('Failed to parse API response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(requestData);
      req.end();
    });
  } catch (error) {
    console.error('Error translating text:', error);
    throw error;
  }
});

ipcMain.handle('reformat-text', async (event, text) => {
  try {
    const https = require('https');
    const apiKey = appSettings.apiKeys?.chatgpt;
    
    if (!apiKey) {
      throw new Error('ChatGPT API key not found. Please set it in Settings > API Keys');
    }

    const requestData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that reformats text to be more readable, well-structured, and properly formatted. Preserve all important information while improving clarity and structure.'
        },
        {
          role: 'user',
          content: `Please reformat the following text to make it more readable and well-structured:\n\n${text}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(requestData)
        },
        timeout: 30000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              const error = JSON.parse(data);
              reject(new Error(error.error?.message || `API returned status ${res.statusCode}`));
              return;
            }
            const result = JSON.parse(data);
            if (result.choices && result.choices.length > 0) {
              resolve(result.choices[0].message.content);
            } else {
              reject(new Error('No response from ChatGPT API'));
            }
          } catch (error) {
            reject(new Error('Failed to parse API response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(requestData);
      req.end();
    });
  } catch (error) {
    console.error('Error reformatting text:', error);
    throw error;
  }
});

// Public IP IPC handler
ipcMain.handle('get-public-ip', async () => {
  try {
    const https = require('https');
    return new Promise((resolve, reject) => {
      https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result.ip);
          } catch (error) {
            reject(new Error('Failed to parse IP response'));
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('Error fetching public IP:', error);
    throw error;
  }
});

// IP Location IPC handler using IPGeolocation.io
ipcMain.handle('get-ip-location', async (event, ips) => {
  try {
    const https = require('https');
    const apiKey = appSettings.apiKeys?.ipLocation || process.env.IPGEOLOCATION_API_KEY;
    
    if (!apiKey) {
      throw new Error('IPGeolocation API key not found. Please set it in Settings > API Keys');
    }
    
    const results = await Promise.all(
      ips.map(ip => {
        return new Promise((resolve) => {
          const url = `https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&ip=${encodeURIComponent(ip)}`;
          https.get(url, { timeout: 10000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                const result = JSON.parse(data);
                if (result.message || result.error) {
                  resolve({ ip, error: result.message || result.error || 'Invalid IP address' });
                } else {
                  resolve({
                    ip: result.ip || ip,
                    country: result.country_name,
                    region: result.state_prov,
                    city: result.city,
                    zip: result.zipcode,
                    lat: result.latitude,
                    lon: result.longitude,
                    isp: result.isp,
                    org: result.organization || result.isp
                  });
                }
              } catch (error) {
                resolve({ ip, error: 'Failed to parse location data' });
              }
            });
          }).on('error', (error) => {
            resolve({ ip, error: error.message || 'Network error' });
          });
        });
      })
    );
    return results;
  } catch (error) {
    console.error('Error fetching IP locations:', error);
    throw error;
  }
});

ipcMain.handle('open-external-url', async (event, url) => {
  const { shell } = require('electron');
  await shell.openExternal(url);
  return true;
});

// Clipboard history IPC handlers
ipcMain.handle('get-clipboard-history', async (event, limit = 100) => {
  try {
    return await clipboardTracker.getClipboardHistory(limit);
  } catch (error) {
    console.error('Error getting clipboard history:', error);
    throw error;
  }
});

ipcMain.handle('search-clipboard-history', async (event, query, limit = 100) => {
  try {
    return await clipboardTracker.searchClipboardHistory(query, limit);
  } catch (error) {
    console.error('Error searching clipboard history:', error);
    throw error;
  }
});

ipcMain.handle('delete-clipboard-entry', async (event, id) => {
  try {
    await clipboardTracker.deleteClipboardEntry(id);
    return { success: true };
  } catch (error) {
    console.error('Error deleting clipboard entry:', error);
    throw error;
  }
});

ipcMain.handle('clear-clipboard-history', async (event) => {
  try {
    await clipboardTracker.clearClipboardHistory();
    return { success: true };
  } catch (error) {
    console.error('Error clearing clipboard history:', error);
    throw error;
  }
});

// Authenticator IPC handlers
ipcMain.handle('get-authenticators', async (event) => {
  try {
    return await authenticator.getAllAuthenticators();
  } catch (error) {
    console.error('Error getting authenticators:', error);
    throw error;
  }
});

ipcMain.handle('create-authenticator', async (event, data) => {
  try {
    return await authenticator.createAuthenticator(data);
  } catch (error) {
    console.error('Error creating authenticator:', error);
    throw error;
  }
});

ipcMain.handle('update-authenticator', async (event, id, data) => {
  try {
    return await authenticator.updateAuthenticator(id, data);
  } catch (error) {
    console.error('Error updating authenticator:', error);
    throw error;
  }
});

ipcMain.handle('delete-authenticator', async (event, id) => {
  try {
    return await authenticator.deleteAuthenticator(id);
  } catch (error) {
    console.error('Error deleting authenticator:', error);
    throw error;
  }
});

ipcMain.handle('get-totp-code', async (event, secret) => {
  try {
    return authenticator.getTOTPCode(secret);
  } catch (error) {
    console.error('Error getting TOTP code:', error);
    throw error;
  }
});

ipcMain.handle('get-all-totp-codes', async (event, secrets) => {
  try {
    if (!Array.isArray(secrets)) {
      throw new Error('secrets must be an array');
    }
    return authenticator.getAllTOTPCodes(secrets);
  } catch (error) {
    console.error('Error getting all TOTP codes:', error);
    throw error;
  }
});

ipcMain.handle('get-totp-time-remaining', async (event) => {
  try {
    return authenticator.getTimeRemaining();
  } catch (error) {
    console.error('Error getting TOTP time remaining:', error);
    throw error;
  }
});

// Trash IPC handlers
ipcMain.handle('get-trash-entries', async (event) => {
  try {
    return await authenticator.getTrashEntries();
  } catch (error) {
    console.error('Error getting trash entries:', error);
    throw error;
  }
});

ipcMain.handle('restore-from-trash', async (event, trashId) => {
  try {
    return await authenticator.restoreFromTrash(trashId);
  } catch (error) {
    console.error('Error restoring from trash:', error);
    throw error;
  }
});

ipcMain.handle('permanently-delete-from-trash', async (event, trashId) => {
  try {
    return await authenticator.permanentlyDeleteFromTrash(trashId);
  } catch (error) {
    console.error('Error permanently deleting from trash:', error);
    throw error;
  }
});

ipcMain.handle('copy-to-clipboard', async (event, text) => {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    throw error;
  }
});

// Helper function to start Pinggy tunnel
async function startPinggyTunnel({ port, options }) {
  try {
    const instanceId = randomUUID();
    
    // Build pinggy command
    // Using pinggy CLI: ssh -p 443 -R0:localhost:PORT -L4300:localhost:4300 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 b8EbbC073Sv@free.pinggy.io
    // -R0:localhost:PORT: Remote port forwarding (tunnel)
    // -L4300:localhost:4300: Local port forwarding (debug portal)
    // -N: Don't execute remote command, just forward ports (keeps connection alive)
    // -o StrictHostKeyChecking=no: Don't prompt for host key verification
    // -o ServerAliveInterval=30: Keep connection alive
    const args = [
      '-p', '443',
      `-R0:localhost:${port}`, // Remote port forwarding (no space between -R and value)
      '-L4300:localhost:4300', // Local port forwarding for debug portal (no space)
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=30',
      'b8EbbC073Sv@free.pinggy.io'
    ];
    
    // Log the command being executed
    const command = `ssh ${args.join(' ')}`;
    console.log('[Pinggy] Executing command:', command);
    console.log('[Pinggy] Command args:', args);
    
    // Start SSH process
    const pinggyProcess = spawn('ssh', args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Log SSH output for debugging
    pinggyProcess.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) {
        console.log('[Pinggy]', text.trim());
      }
    });
    
    pinggyProcess.stderr.on('data', (data) => {
      const text = data.toString();
      // Filter out noise messages
      if (!text.includes('Pseudo-terminal') && 
          !text.includes('Allocated port') && 
          !text.includes('authenticated') &&
          !text.includes('expire') &&
          !text.includes('Upgrade to Pinggy Pro')) {
        if (text.trim()) {
          console.log('[Pinggy]', text.trim());
        }
      }
    });
    
    // Fetch URLs from Web Debugger API
    // According to https://pinggy.io/docs/api/web_debugger_api/
    // We can get URLs by calling http://localhost:4300/urls
    const fetchUrlsFromAPI = async () => {
      const maxRetries = 20; // Try for up to 20 seconds
      const retryDelay = 1000; // 1 second between retries
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          // Check if process is still running
          if (pinggyProcess.killed || pinggyProcess.exitCode !== null) {
            throw new Error('SSH tunnel process exited before URLs could be fetched');
          }
          
          const apiUrls = await new Promise((resolve, reject) => {
            const req = http.get('http://localhost:4300/urls', (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () => {
                if (res.statusCode === 200) {
                  try {
                    const json = JSON.parse(data);
                    resolve(json.urls || []);
                  } catch (error) {
                    reject(new Error('Failed to parse URLs response'));
                  }
                } else {
                  reject(new Error(`API returned status ${res.statusCode}`));
                }
              });
            });
            
            req.on('error', (error) => {
              // Connection refused means API is not ready yet
              if (error.code === 'ECONNREFUSED') {
                resolve(null); // Return null to retry
              } else {
                reject(error);
              }
            });
            
            req.setTimeout(2000, () => {
              req.destroy();
              resolve(null); // Timeout, retry
            });
          });
          
          if (apiUrls && Array.isArray(apiUrls) && apiUrls.length > 0) {
            return apiUrls;
          }
        } catch (error) {
          if (i === maxRetries - 1) {
            throw error;
          }
          // Continue retrying
        }
      }
      
      throw new Error('Timeout waiting for Web Debugger API to be ready');
    };
    
    let urls = {};
    
    // Set up exit handler
    pinggyProcess.on('exit', (code) => {
      console.log(`[Pinggy] Process exited with code ${code} for port ${port}, instanceId: ${instanceId}`);
      const instance = pinggyInstances.get(instanceId);
      if (instance) {
        console.log('[Pinggy] Removing instance from map due to process exit');
        pinggyInstances.delete(instanceId);
        // Notify renderer
        if (win && !win.isDestroyed()) {
          win.webContents.send('pinggy-instance-updated');
        }
      } else {
        console.log('[Pinggy] Instance already removed from map');
      }
    });
    
    pinggyProcess.on('error', (error) => {
      console.error('[Pinggy] Process error:', error, 'instanceId:', instanceId);
      const instance = pinggyInstances.get(instanceId);
      if (instance) {
        pinggyInstances.delete(instanceId);
        if (win && !win.isDestroyed()) {
          win.webContents.send('pinggy-instance-updated');
        }
      }
    });
    
    // Fetch URLs from Web Debugger API
    try {
      const apiUrls = await fetchUrlsFromAPI();
      
      // Parse URLs from API response
      if (apiUrls && Array.isArray(apiUrls)) {
        for (const url of apiUrls) {
          if (url.startsWith('http://') && options.http && !urls.http) {
            urls.http = url;
          } else if (url.startsWith('https://') && options.https && !urls.https) {
            urls.https = url;
          }
        }
      }
      
      // Debug URL is localhost:4300 (local port forwarding)
      if (options.debug && !urls.debug) {
        urls.debug = 'http://localhost:4300';
      }
      
      console.log('[Pinggy] Fetched URLs from API:', urls);
    } catch (error) {
      console.warn('[Pinggy] Failed to fetch URLs from API:', error.message);
      // Continue anyway - tunnel might still work, URLs might be available later
    }
    
    // If no URLs found, check if process is still running
    if (Object.keys(urls).length === 0) {
      // Check if process is still running
      if (pinggyProcess.killed || pinggyProcess.exitCode !== null) {
        throw new Error('SSH tunnel process exited before URLs were received. Check if SSH is properly configured.');
      }
      // Process is running but no URLs - might still be connecting
      console.warn('[Pinggy] No URLs received yet, but process is still running. Tunnel may still be active.');
    }
    
    // Check if process exited unexpectedly
    if (pinggyProcess.killed || pinggyProcess.exitCode !== null) {
      throw new Error(`SSH tunnel process exited unexpectedly with code ${pinggyProcess.exitCode}`);
    }
    
    const instance = {
      id: instanceId,
      port,
      process: pinggyProcess,
      urls,
      options,
      startTime: Date.now()
    };
    
    pinggyInstances.set(instanceId, instance);
    
    // Notify renderer
    if (win && !win.isDestroyed()) {
      win.webContents.send('pinggy-instance-updated');
    }
    
    return {
      id: instanceId,
      port,
      urls
    };
  } catch (error) {
    console.error('Error starting Pinggy tunnel:', error);
    throw error;
  }
}

// Helper function to stop Pinggy tunnel
async function stopPinggyTunnel(instanceId) {
  try {
    console.log('[Pinggy] Attempting to stop tunnel with instanceId:', instanceId);
    console.log('[Pinggy] Available instances:', Array.from(pinggyInstances.keys()));
    
    const instance = pinggyInstances.get(instanceId);
    if (!instance) {
      // Try to find by port if instanceId doesn't match
      const instancesArray = Array.from(pinggyInstances.entries());
      const foundByPort = instancesArray.find(([id, inst]) => inst.port === instanceId);
      
      if (foundByPort) {
        console.log('[Pinggy] Found instance by port, using ID:', foundByPort[0]);
        const actualInstance = foundByPort[1];
        
        // Kill the process
        if (actualInstance.process && !actualInstance.process.killed) {
          actualInstance.process.kill();
        }
        
        pinggyInstances.delete(foundByPort[0]);
        
        // Notify renderer
        if (win && !win.isDestroyed()) {
          win.webContents.send('pinggy-instance-updated');
        }
        
        return true;
      }
      
      throw new Error(`Tunnel instance not found. ID: ${instanceId}, Available: ${Array.from(pinggyInstances.keys()).join(', ')}`);
    }
    
    console.log('[Pinggy] Found instance, stopping process...');
    
    // Kill the process
    if (instance.process && !instance.process.killed) {
      instance.process.kill();
      console.log('[Pinggy] Process killed');
    } else {
      console.log('[Pinggy] Process already killed or not found');
    }
    
    pinggyInstances.delete(instanceId);
    console.log('[Pinggy] Instance removed from map');
    
    // Notify renderer
    if (win && !win.isDestroyed()) {
      win.webContents.send('pinggy-instance-updated');
    }
    
    return true;
  } catch (error) {
    console.error('Error stopping Pinggy tunnel:', error);
    throw error;
  }
}

// Pinggy Tunnel IPC handlers
ipcMain.handle('start-pinggy-tunnel', async (event, { port, options }) => {
  return await startPinggyTunnel({ port, options });
});

ipcMain.handle('stop-pinggy-tunnel', async (event, instanceId) => {
  return await stopPinggyTunnel(instanceId);
});

ipcMain.handle('get-pinggy-instances', async (event) => {
  try {
    const instances = Array.from(pinggyInstances.values()).map(instance => ({
      id: instance.id,
      port: instance.port,
      urls: instance.urls,
      options: instance.options,
      startTime: instance.startTime
    }));
    return instances;
  } catch (error) {
    console.error('Error getting Pinggy instances:', error);
    return [];
  }
});

ipcMain.handle('get-history', async (event, startTime, endTime) => {
  try {
    const historyData = await history.getHistory(startTime, endTime);
    return historyData;
  } catch (error) {
    console.error('Error getting history:', error);
    return [];
  }
});

ipcMain.handle('get-history-range', async (event) => {
  try {
    const timeRange = await history.getTimeRange();
    return timeRange;
  } catch (error) {
    console.error('Error getting history range:', error);
    return { oldest: null, newest: null, count: 0 };
  }
});

ipcMain.handle('toggle-auto-start', async (event, enabled) => {
  if (!autoLauncher) {
    console.log('Auto-start not available in development mode')
    return false
  }
  
  try {
    if (enabled) {
      await autoLauncher.enable()
    } else {
      await autoLauncher.disable()
    }
    return true
  } catch (error) {
    console.error('Error toggling auto-start:', error)
    return false
  }
})


app.on("window-all-closed", (e) => {
  e.preventDefault()
})

app.on("before-quit", async () => {
  // Kill all Pinggy tunnel processes
  console.log('[Pinggy] Cleaning up all tunnel processes...');
  for (const [instanceId, instance] of pinggyInstances.entries()) {
    try {
      if (instance.process && !instance.process.killed) {
        console.log(`[Pinggy] Killing tunnel process for port ${instance.port} (${instanceId})`);
        instance.process.kill();
        // Wait a bit for graceful shutdown, then force kill if needed
        setTimeout(() => {
          if (!instance.process.killed) {
            console.log(`[Pinggy] Force killing tunnel process for port ${instance.port}`);
            instance.process.kill('SIGKILL');
          }
        }, 1000);
      }
    } catch (error) {
      console.error(`[Pinggy] Error killing tunnel ${instanceId}:`, error);
    }
  }
  pinggyInstances.clear();
  console.log('[Pinggy] All tunnel processes cleaned up');
  
  // Close authenticator database
  try {
    await authenticator.closeDatabase();
    console.log('🔐 Authenticator database closed');
  } catch (error) {
    console.error('Error closing authenticator database:', error);
  }

  // Close all servers
  if (staticServer) {
    staticServer.close();
    console.log('🌐 Static file server closed');
  }
  if (wss) {
    wss.close();
    console.log('🔌 WebSocket server closed');
  }
  if (httpServer) {
    httpServer.close();
    console.log('🌐 HTTP API server closed');
  }
  if (statsInterval) clearInterval(statsInterval)
  if (trayUpdateInterval) clearInterval(trayUpdateInterval)
  
  // Close database connections
  try {
    await history.closeDatabase();
    console.log('💾 History database closed');
  } catch (error) {
    console.error('Error closing history database:', error);
  }
  
  try {
    await clipboardTracker.closeDatabase();
    console.log('📋 Clipboard database closed');
  } catch (error) {
    console.error('Error closing clipboard database:', error);
  }
})

// Handle process termination signals to ensure Pinggy processes are killed
process.on('SIGTERM', () => {
  console.log('[Pinggy] SIGTERM received, cleaning up tunnels...');
  for (const [instanceId, instance] of pinggyInstances.entries()) {
    if (instance.process && !instance.process.killed) {
      instance.process.kill('SIGTERM');
    }
  }
  pinggyInstances.clear();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Pinggy] SIGINT received, cleaning up tunnels...');
  for (const [instanceId, instance] of pinggyInstances.entries()) {
    if (instance.process && !instance.process.killed) {
      instance.process.kill('SIGINT');
    }
  }
  pinggyInstances.clear();
  process.exit(0);
});

// Handle uncaught exceptions to clean up before crash
process.on('uncaughtException', (error) => {
  console.error('[Pinggy] Uncaught exception, cleaning up tunnels...', error);
  for (const [instanceId, instance] of pinggyInstances.entries()) {
    if (instance.process && !instance.process.killed) {
      instance.process.kill('SIGKILL');
    }
  }
  pinggyInstances.clear();
});

// Add IPC handler for tray icon screenshot from renderer
ipcMain.on('tray-icon-screenshot', (event, dataUrl) => {
  try {
    // Convert base64 data URL to nativeImage
    const image = nativeImage.createFromDataURL(dataUrl)
    // Resize to tray icon size
    const resizedImage = image.resize({
      width: process.platform === 'darwin' ? 22 : 32,
      height: process.platform === 'darwin' ? 22 : 32,
      quality: 'best'
    })
    if (tray) {
      tray.setImage(resizedImage)
    }
  } catch (err) {
    console.error('Failed to set tray icon from html2canvas:', err)
  }
})

