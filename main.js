// Load environment variables
require('dotenv').config()

const { app, BrowserWindow, Tray, nativeImage, ipcMain, Menu, nativeTheme, systemPreferences, dialog, shell } = require("electron")
const path = require("path")
const fs = require("fs")
const http = require("http")
const WebSocket = require("ws")
const config = require("./config")
const stats = require("./stats")
const history = require("./history")
const clipboardTracker = require("./clipboard")
const authenticator = require("./authenticator")
const authenticatorLogo = require("./authenticatorLogo")
const uptimeMonitor = require("./uptimeMonitor")
const notesSearch = require("./notesSearch")
const { registerAgentHandlers } = require("./agentHandlers")
const agentKnowledge = require("./agentKnowledge")
const agentHttp = require("./agentHttp")
const agentOrchestrator = require("./agentOrchestrator")
const textLlmService = require("./textLlmService")
const bcrypt = require("bcryptjs")
const { spawn } = require("child_process")
const { randomUUID } = require("crypto")
const gdriveBackup = require('./gdriveBackup')
const archiver = require('archiver')
const appDataExport = require('./appDataExport')

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
let windowBlurHideEnabled = false
let appIsQuitting = false
let mainWindowSaveTimer = null

const MAIN_WINDOW_MIN_WIDTH = 480
const MAIN_WINDOW_MIN_HEIGHT = 360

// Settings management - will be loaded from config
let appSettings = {};

// Google Drive backup
let gdriveBackupTimer = null
let gdriveBackupRunning = false
const GDRIVE_BACKUP_MIN_DELAY_MS = 10000
const GDRIVE_BACKUP_RETRY_MS = 60000

const GDRIVE_OAUTH_PORT = 8765

function getGdriveAuthConfig() {
  return config.getConfigSection('gdriveAuth') || null
}

function setGdriveAuthConfig(next) {
  return config.setConfigSection('gdriveAuth', next || null)
}

function clearGdriveConnection() {
  setGdriveAuthConfig(null)
  restartGdriveBackupScheduler()
}

function isGdriveAuthError(message = '') {
  const text = String(message).toLowerCase()
  return (
    text.includes('session expired') ||
    text.includes('invalid_grant') ||
    text.includes('invalid_client') ||
    text.includes('reconnect google drive') ||
    text.includes('missing google drive refresh token')
  )
}

function syncGdriveAuthWithSettings(cloudBackup = {}) {
  const auth = getGdriveAuthConfig()
  if (!auth?.refresh_token) return

  const nextClientId = String(cloudBackup.clientId || '').trim()
  const nextClientSecret = String(cloudBackup.clientSecret || '').trim()
  const storedClientId = String(auth.client_id || '').trim()

  if (nextClientId && storedClientId && nextClientId !== storedClientId) {
    clearGdriveConnection()
    return
  }

  if (nextClientSecret && storedClientId) {
    setGdriveAuthConfig({
      ...auth,
      client_secret: nextClientSecret
    })
  }
}

function getCloudBackupSettings() {
  const s = config.getAppSettings()
  return s?.cloudBackup || { provider: 'gdrive', clientId: '', clientSecret: '', enabled: false, intervalHours: 4, keepLast: 10 }
}

function setCloudBackupSettings(patch) {
  const s = config.getAppSettings()
  const next = { ...(s?.cloudBackup || {}), ...(patch || {}) }
  if (patch?.intervalHours !== undefined) {
    next.intervalHours = normalizeBackupIntervalHours(patch.intervalHours)
  }
  config.setAppSettings({ cloudBackup: next })
  appSettings = config.getAppSettings()
  // Start Drive backup scheduler if enabled.
  restartGdriveBackupScheduler()
  return next
}

function getGdriveOAuthCredentials() {
  const cloudBackup = getCloudBackupSettings()
  const authCfg = getGdriveAuthConfig()
  const clientId = (
    cloudBackup?.clientId ||
    process.env.GDRIVE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    authCfg?.client_id ||
    ''
  ).trim()
  const clientSecret = (
    cloudBackup?.clientSecret ||
    process.env.GDRIVE_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    authCfg?.client_secret ||
    ''
  ).trim()
  return { clientId, clientSecret }
}

function getGdriveOAuthCredentialsForRefresh() {
  const authCfg = getGdriveAuthConfig()
  const settings = getGdriveOAuthCredentials()

  if (authCfg?.client_id) {
    const clientId = String(authCfg.client_id).trim()
    let clientSecret = String(authCfg.client_secret || '').trim()

    if (!clientSecret && settings.clientId === clientId && settings.clientSecret) {
      clientSecret = settings.clientSecret
    }

    if (clientId && clientSecret) {
      return { clientId, clientSecret }
    }

    throw new Error(
      'Saved Google Drive connection is missing OAuth credentials. Disconnect, re-enter Client ID and Client Secret in Settings, then connect again.'
    )
  }

  if (!settings.clientId || !settings.clientSecret) {
    throw new Error(
      'Missing Google OAuth credentials. Add the Google Drive Client ID and Client Secret in Settings > Cloud Backup, then connect Google Drive.'
    )
  }

  return settings
}

function hasGdriveOAuthCredentials() {
  const { clientId, clientSecret } = getGdriveOAuthCredentials()
  return Boolean(clientId && clientSecret)
}

function getGdriveOAuthClient(redirectUri) {
  const { clientId, clientSecret } = getGdriveOAuthCredentials()
  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials. Add the Google Drive Client ID and Client Secret in Settings > Cloud Backup, or set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET in the environment.')
  }
  return { clientId, clientSecret, redirectUri }
}

async function uploadBackupToDrive() {
  if (gdriveBackupRunning) return { success: false, running: true }
  gdriveBackupRunning = true
  try {
    const authCfg = getGdriveAuthConfig()
    const refreshToken = authCfg?.refresh_token
    if (!refreshToken) throw new Error('Google Drive not connected')

    const { clientId, clientSecret } = getGdriveOAuthCredentialsForRefresh()
    const { zipPath, baseName } = await createBackupZipToTemp()

    const file = await gdriveBackup.uploadBackup({
      clientId,
      clientSecret,
      refreshToken,
      zipPath,
      fileName: baseName
    })

    setCloudBackupSettings({ lastBackupAt: new Date().toISOString(), lastBackupStatus: 'success', lastBackupError: null })
    return { success: true, file }
  } catch (e) {
    if (isGdriveAuthError(e?.message)) {
      clearGdriveConnection()
    }
    setCloudBackupSettings({ lastBackupAt: new Date().toISOString(), lastBackupStatus: 'error', lastBackupError: e?.message || String(e) })
    return { success: false, error: e?.message || String(e), needsReconnect: isGdriveAuthError(e?.message) }
  } finally {
    gdriveBackupRunning = false
  }
}
async function getAppExportDeps() {
  return {
    getAppSettings: () => config.getAppSettings(),
    getAllAuthenticators: () => authenticator.getAllAuthenticators(),
    getClipboardHistory: (limit) => clipboardTracker.getClipboardHistory(limit),
    getHistory: (from, to) => history.getHistory(from, to),
    getNotesExportPayload: () => getNotesExportPayload()
  }
}

function getAppImportDeps() {
  return {
    setAppSettings: (settings) => config.setAppSettings(settings),
    getAllAuthenticators: () => authenticator.getAllAuthenticators(),
    deleteAuthenticator: (id) => authenticator.deleteAuthenticator(id),
    createAuthenticator: (data) => authenticator.createAuthenticator(data),
    clearClipboardHistory: () => clipboardTracker.clearClipboardHistory(),
    storeClipboardEntry: (content, source) => clipboardTracker.storeClipboardEntry(content, source),
    clearAllHistory: () => history.clearAllHistory(),
    importHistoryEntries: (entries) => history.importHistoryEntries(entries),
    importNotesFromPayload: (payload) => importNotesFromPayload(payload),
    reindexKnowledge: async () => {
      const settings = config.getAppSettings()
      if (!settings?.agent?.capabilities?.knowledgeBase) return
      try {
        await agentKnowledge.reindexAll(
          { agent: settings.agent, apiKeys: settings.apiKeys },
          settings.agent?.knowledgeBase
        )
      } catch (err) {
        console.warn('Agent KB reindex after import failed:', err.message)
      }
    }
  }
}

async function createBackupZipToTemp() {
  const backupData = await appDataExport.buildExportPayload(await getAppExportDeps())

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const baseName = `deskmaster-backup-${ts}.zip`
  const tmpDir = path.join(app.getPath('userData'), 'tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  const zipPath = path.join(tmpDir, baseName)

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.append(JSON.stringify(backupData, null, 2), { name: 'deskmaster-backup.json' })
    archive.finalize()
  })

  return { zipPath, baseName }
}

function clearGdriveBackupTimer() {
  if (gdriveBackupTimer) {
    clearTimeout(gdriveBackupTimer)
    gdriveBackupTimer = null
  }
}

function normalizeBackupIntervalHours(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours)) return 4
  return Math.max(1, Math.min(24, Math.round(hours)))
}

function getNextGdriveBackupDelayMs(settings = getCloudBackupSettings()) {
  const intervalMs = normalizeBackupIntervalHours(settings?.intervalHours) * 60 * 60 * 1000
  const lastBackupAt = settings?.lastBackupAt ? Date.parse(settings.lastBackupAt) : NaN

  if (!Number.isFinite(lastBackupAt) || lastBackupAt <= 0) {
    return GDRIVE_BACKUP_MIN_DELAY_MS
  }

  const dueAt = lastBackupAt + intervalMs
  return Math.max(GDRIVE_BACKUP_MIN_DELAY_MS, dueAt - Date.now())
}

function restartGdriveBackupScheduler() {
  clearGdriveBackupTimer()

  const s = getCloudBackupSettings()
  const enabled = Boolean(s?.enabled)
  const auth = getGdriveAuthConfig()
  if (!enabled || !auth?.refresh_token) return

  const delayMs = getNextGdriveBackupDelayMs(s)
  gdriveBackupTimer = setTimeout(() => {
    gdriveBackupTimer = null
    void uploadBackupToDrive().then((result) => {
      if (result?.running) {
        gdriveBackupTimer = setTimeout(() => {
          gdriveBackupTimer = null
          restartGdriveBackupScheduler()
        }, GDRIVE_BACKUP_RETRY_MS)
      }
    })
  }, delayMs)
}

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

function getDefaultMainWindowBounds() {
  const { screen } = require('electron')
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize
  const { x: areaX, y: areaY } = display.workArea
  const width = Math.min(Math.floor(screenWidth * 0.8), 1100)
  const height = Math.min(Math.floor(screenHeight * 0.8), 700)

  return {
    x: areaX + Math.floor((screenWidth - width) / 2),
    y: areaY + Math.floor((screenHeight - height) / 2),
    width,
    height,
    isMaximized: false
  }
}

function sanitizeMainWindowBounds(raw) {
  if (!raw || typeof raw.width !== 'number' || typeof raw.height !== 'number') {
    return getDefaultMainWindowBounds()
  }

  const { screen } = require('electron')
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const area = primary.workArea

  let width = Math.round(Math.max(MAIN_WINDOW_MIN_WIDTH, Math.min(raw.width, area.width)))
  let height = Math.round(Math.max(MAIN_WINDOW_MIN_HEIGHT, Math.min(raw.height, area.height)))
  let x = typeof raw.x === 'number' ? Math.round(raw.x) : null
  let y = typeof raw.y === 'number' ? Math.round(raw.y) : null

  if (x === null || y === null) {
    x = area.x + Math.floor((area.width - width) / 2)
    y = area.y + Math.floor((area.height - height) / 2)
  }

  const bounds = {
    x,
    y,
    width,
    height,
    isMaximized: Boolean(raw.isMaximized)
  }

  const minVisible = 64
  const visibleOnSomeDisplay = displays.some((display) => {
    const workArea = display.workArea
    const overlapX = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
    const overlapY = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
    return overlapX >= minVisible && overlapY >= minVisible
  })

  if (!visibleOnSomeDisplay) {
    return getDefaultMainWindowBounds()
  }

  return bounds
}

function saveMainWindowState() {
  if (!win || win.isDestroyed()) return

  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized()
  }

  const prev = appSettings.mainWindow
  if (
    prev &&
    prev.x === state.x &&
    prev.y === state.y &&
    prev.width === state.width &&
    prev.height === state.height &&
    prev.isMaximized === state.isMaximized
  ) {
    return
  }

  config.updateAppSetting('mainWindow', state)
  appSettings.mainWindow = state
}

function scheduleSaveMainWindowState() {
  if (mainWindowSaveTimer) clearTimeout(mainWindowSaveTimer)
  mainWindowSaveTimer = setTimeout(() => {
    mainWindowSaveTimer = null
    saveMainWindowState()
  }, 400)
}

function createWindow() {
  const initialBounds = sanitizeMainWindowBounds(appSettings.mainWindow)
  
  win = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
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

  // Load React app over localhost so Monaco workers/assets load correctly (file:// breaks them).
  const rendererUrl = `http://127.0.0.1:${STATIC_PORT}/index.html`;
  win.loadURL(rendererUrl).catch((err) => {
    console.error('Failed to load renderer over localhost, falling back to file://', err);
    const distPath = app.isPackaged ? app.getAppPath() : __dirname;
    win.loadFile(path.join(distPath, 'dist', 'index.html'));
  });

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
    if (initialBounds.isMaximized && !win.isMaximized()) {
      win.maximize()
    }
  })

  win.on('resize', scheduleSaveMainWindowState)
  win.on('move', scheduleSaveMainWindowState)

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
  
  win.on('close', (event) => {
    if (appIsQuitting) return
    saveMainWindowState()
    event.preventDefault()
    win.hide()
  })

  win.on('blur', () => {
    if (!isTrayOnlyMode() || !windowBlurHideEnabled) return

    setTimeout(() => {
      if (!win || win.isDestroyed() || win.isFocused()) return
      if (aboutWindow && !aboutWindow.isDestroyed() && aboutWindow.isVisible()) return
      win.hide()
    }, 100)
  })

  win.on("hide", () => {
    saveMainWindowState()
    windowBlurHideEnabled = false
    // Don't stop stats updates when window is hidden
    // Stats need to continue for WebSocket clients and tray
  })

  win.on("closed", () => {
    win = null
    windowBlurHideEnabled = false
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
    const uptimeEnabled = appSettings?.uptimeKuma?.enabled !== false
    const uptimeTraySummary = uptimeEnabled ? uptimeMonitor.getTraySummary() : { down: 0, sslAttention: 0, domainAttention: 0 };
    
    // Send current stats to tray icon window
    trayIconWindow.webContents.send('update-tray-stats', {
      ...currentStats,
      timezones: timezones,
      uptime: uptimeTraySummary,
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
    const hasUptimeNotification = uptimeEnabled && (uptimeTraySummary.down > 0 || uptimeTraySummary.sslAttention > 0 || uptimeTraySummary.domainAttention > 0);
    const uptimeWidth = hasUptimeNotification ? 50 : 0;
    const padding = (enabledStatsCount + timezones.length + (hasUptimeNotification ? 1 : 0)) * 4; // 4px padding between items
    
    const width = baseWidth + statWidth + timezoneWidth + uptimeWidth + padding;
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

// Broadcast TOTP codes to Electron renderer and WebSocket clients
function broadcastTOTPCodes(codes, nextCodes, timeRemaining) {
  const payload = { codes, nextCodes, timeRemaining };

  if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send('totp-codes-update', payload);
  }

  if (wss && connectedClients.size > 0) {
    const message = JSON.stringify({
      type: 'totp-codes-update',
      data: payload
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

function broadcastAgentStream(payload) {
  if (wss && connectedClients.size > 0) {
    const message = JSON.stringify({
      type: 'agent:stream',
      data: payload
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
      
      // Live current + computed next at the same instant (T0)
      const { codes, nextCodes } = authenticator.getAllTOTPCodes(secrets);
      const timeRemaining = authenticator.getTimeRemaining();
      
      // Only broadcast if current codes changed (next rolls over with current)
      const codesString = JSON.stringify(codes);
      if (codesString !== lastTOTPCodes) {
        lastTOTPCodes = codesString;
        broadcastTOTPCodes(codes, nextCodes, timeRemaining);
      } else if (wss && connectedClients.size > 0) {
        // Keep countdown in sync for browser clients (Electron timer is client-side).
        broadcastTOTPCodes(codes, nextCodes, timeRemaining);
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

// Localhost-only static server for Electron renderer + optional browser UI.
let staticServerStartupPromise = null;

function startInternalStaticServer() {
  if (staticServer) return Promise.resolve();
  if (staticServerStartupPromise) return staticServerStartupPromise;

  staticServerStartupPromise = new Promise((resolve) => {
    const fs = require('fs');
    const { URL } = require('url');
    const distPath = getDistPath();

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

    try {
      staticServer = http.createServer((req, res) => {
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

        if (!isLocalhost) {
          console.warn(`🚫 Blocked unauthorized static file request from ${remoteAddress} - ${req.url}`);
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden: Access restricted to localhost only');
          return;
        }

        const parsedUrl = new URL(req.url, `http://localhost:${STATIC_PORT}`);
        let pathname = parsedUrl.pathname;

        if (pathname === '/favicon.ico' || pathname === '/assets/icons/app-icon-256.png') {
          const faviconPath = path.join(distPath, 'assets', 'icons', 'app-icon-256.png');
          fs.readFile(faviconPath, (err, data) => {
            if (err) {
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

        if (pathname === '/') {
          pathname = '/index.html';
        }

        const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(distPath, safePath);

        fs.access(filePath, fs.constants.F_OK, (err) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
          }

          fs.readFile(filePath, (readErr, data) => {
            if (readErr) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('500 Internal Server Error');
              return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';

            let fileData = data;
            if (ext === '.html') {
              const htmlContent = data.toString();
              const tokenScript = `<script>window.DESKMASTER_API_TOKEN = '${API_SECRET_TOKEN}'; localStorage.setItem('deskmaster_api_token', '${API_SECRET_TOKEN}');</script>`;
              if (htmlContent.includes('</head>')) {
                fileData = Buffer.from(htmlContent.replace('</head>', `${tokenScript}</head>`));
              } else if (htmlContent.includes('<body>')) {
                fileData = Buffer.from(htmlContent.replace('<body>', `<body>${tokenScript}`));
              } else {
                fileData = Buffer.from(`${tokenScript}${htmlContent}`);
              }
            }

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

      staticServer.listen(STATIC_PORT, '127.0.0.1', () => {
        console.log(`🌐 Static file server started on http://127.0.0.1:${STATIC_PORT} (localhost only)`);
        resolve();
      });

      staticServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.warn(`⚠️  Static server port ${STATIC_PORT} is already in use.`);
        } else {
          console.error('Static server error:', error);
        }
        resolve();
      });
    } catch (error) {
      console.error('Failed to start static file server:', error);
      resolve();
    }
  });

  return staticServerStartupPromise;
}

function stopBrowserApiServers() {
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

// Start WebSocket and HTTP servers for browser access
function startBrowserApiServers() {
  if (wss && httpServer) return;
  const { URL } = require('url');
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
      if (agentHttp.handleAgentGet(req, res, appSettings, agentHttpDeps)) return

      if (req.url === '/api/get-settings') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(appSettings));
      } else if (req.url.startsWith('/api/uptime/monitors')) {
        try {
          const url = new URL(req.url, `http://localhost:${HTTP_PORT}`)
          const data = await uptimeMonitor.getMonitorResponse({ force: url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true' })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (error) {
          res.writeHead(error.status || 500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: error.message || 'Unable to load uptime monitors' }))
        }
      } else if (req.url === '/api/gdrive/status') {
        const auth = getGdriveAuthConfig()
        const s = getCloudBackupSettings()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            connected: Boolean(auth?.refresh_token),
            enabled: Boolean(s?.enabled),
            intervalHours: Number(s?.intervalHours) || 4,
            keepLast: Number(s?.keepLast) || 10,
            oauthConfigured: hasGdriveOAuthCredentials(),
            lastBackupAt: s?.lastBackupAt || null,
            lastBackupStatus: s?.lastBackupStatus || null,
            lastBackupError: s?.lastBackupError || null,
            running: Boolean(gdriveBackupRunning)
          })
        )
      } else if (req.url === '/api/notes/has-pages') {
        try {
          ensureNotesDirs();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasPages: notesHasPages() }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/tree') {
        try {
          ensureNotesDirs();
          const tree = getNotesTreePayload();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(tree));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url.startsWith('/api/notes/search')) {
        try {
          const url = new URL(req.url, `http://localhost:${HTTP_PORT}`)
          const query = url.searchParams.get('q') || url.searchParams.get('query') || ''
          const results = notesSearch.searchNotesPages(query)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ results }))
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: error.message || 'Unable to search notes' }))
        }
      } else if (req.url.startsWith('/api/notes/page')) {
        try {
          const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
          const id = url.searchParams.get('id');
          ensureNotesDirs();
          const dir = id ? findPageDirById(getNotesRootDir(), id) : null;
          const state = dir ? readJsonFile(getContentPath(dir), null) : null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(state));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
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
      if (await agentHttp.handleAgentPost(req, res, body, appSettings, agentHttpDeps)) return

      if (req.url === '/api/update-settings') {
        const newSettings = JSON.parse(body);
        config.setAppSettings(newSettings);
        appSettings = config.getAppSettings();

        if (newSettings.uptimeKuma !== undefined) {
          uptimeMonitor.restartBackgroundSync()
        }
        
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
      } else if (req.url === '/api/notes/save-page-state') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          const id = payload?.id;
          const state = payload?.state;
          const dir = id ? findPageDirById(getNotesRootDir(), id) : null;
          if (!dir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          writeJsonFile(getContentPath(dir), state || { blocks: [] });
          const metaPath = getMetaPath(dir);
          const meta = readJsonFile(metaPath, null);
          if (meta) {
            writeJsonFile(metaPath, { ...meta, updatedAt: new Date().toISOString() });
            updateFolderNameToMatchMeta(dir);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/create-page') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          const parentDir = resolveParentDir(payload?.parentId);
          if (!parentDir) throw new Error('Invalid parent');
          const title = payload?.title || 'New page';
          const type = payload?.type;
          const id = createPageOnDisk({ parentDir, title, type });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/rename-page') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          const id = payload?.id;
          const title = String(payload?.title || '').trim();
          if (!id || !title) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const dir = findPageDirById(getNotesRootDir(), id);
          if (!dir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const metaPath = getMetaPath(dir);
          const meta = readJsonFile(metaPath, null);
          if (!meta) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          writeJsonFile(metaPath, { ...meta, title, updatedAt: new Date().toISOString() });
          updateFolderNameToMatchMeta(dir);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/delete-page') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          const id = payload?.id;
          if (!id || id === 'notes_archived_root') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const dir = findPageDirById(getNotesRootDir(), id);
          if (!dir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          deleteDirRecursive(dir);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/move-page') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          const id = payload?.id;
          const targetParentId = payload?.targetParentId ?? null;
          const beforeId = payload?.beforeId || null;
          const afterId = payload?.afterId || null;
          if (!id || id === 'notes_archived_root') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const srcDir = findPageDirById(getNotesRootDir(), id);
          if (!srcDir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const destParentDir = resolveParentDir(targetParentId);
          if (!destParentDir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const metaPath = getMetaPath(srcDir);
          const meta = readJsonFile(metaPath, null);
          if (!meta) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const provisionalOrder = getNextOrder(destParentDir);
          const provisionalMeta = { ...meta, order: provisionalOrder, updatedAt: new Date().toISOString() };
          const provisionalName = makePageFolderName({ order: provisionalMeta.order, title: provisionalMeta.title || 'Untitled', id: provisionalMeta.id });
          const provisionalDir = path.join(destParentDir, provisionalName);
          fs.renameSync(srcDir, provisionalDir);
          writeJsonFile(getMetaPath(provisionalDir), provisionalMeta);
          updateFolderNameToMatchMeta(provisionalDir);

          if (beforeId || afterId) {
            const children = listDirectChildrenMeta(destParentDir).map((c) => c.meta.id).filter((x) => x !== id);
            const insertIdx = (() => {
              const pivot = beforeId || afterId;
              const at = children.indexOf(pivot);
              if (at === -1) return children.length;
              return beforeId ? at : at + 1;
            })();
            children.splice(insertIdx, 0, id);
            resequenceChildrenInDir(destParentDir, children);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/copy-page') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          const id = payload?.id;
          const targetParentId = payload?.targetParentId ?? null;
          if (!id || id === 'notes_archived_root') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: null }));
            return;
          }
          const srcDir = findPageDirById(getNotesRootDir(), id);
          if (!srcDir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: null }));
            return;
          }
          const destParentDir = resolveParentDir(targetParentId);
          if (!destParentDir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: null }));
            return;
          }
          const nextOrder = getNextOrder(destParentDir);
          const newId = copyDirWithNewIds(srcDir, destParentDir, nextOrder);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: newId }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/cut-page') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          const id = payload?.id;
          if (!id || id === 'notes_archived_root') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const srcDir = findPageDirById(getNotesRootDir(), id);
          if (!srcDir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
            return;
          }
          const clipboardDir = getNotesClipboardDir();
          deleteDirRecursive(clipboardDir);
          fs.mkdirSync(clipboardDir, { recursive: true });
          const dest = path.join(clipboardDir, path.basename(srcDir));
          fs.renameSync(srcDir, dest);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/paste-cut') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          const targetParentId = payload?.targetParentId ?? null;
          const clipboardDir = getNotesClipboardDir();
          const entries = listChildPageDirs(clipboardDir);
          const srcDir = entries[0];
          if (!srcDir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: null }));
            return;
          }
          const meta = readJsonFile(getMetaPath(srcDir), null);
          if (!meta || !meta.id) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: null }));
            return;
          }
          const destParentDir = resolveParentDir(targetParentId);
          if (!destParentDir) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: null }));
            return;
          }
          const nextOrder = getNextOrder(destParentDir);
          const nextMeta = { ...meta, order: nextOrder, updatedAt: new Date().toISOString() };
          const destName = makePageFolderName({ order: nextMeta.order, title: nextMeta.title || 'Untitled', id: nextMeta.id });
          const destDir = path.join(destParentDir, destName);
          fs.renameSync(srcDir, destDir);
          writeJsonFile(getMetaPath(destDir), nextMeta);
          deleteDirRecursive(clipboardDir);
          fs.mkdirSync(clipboardDir, { recursive: true });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: nextMeta.id }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/api/notes/migrate-legacy') {
        try {
          const payload = JSON.parse(body);
          ensureNotesDirs();
          importNotesFromLegacy(payload?.tree, payload?.pageStatesById);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
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
            startBrowserApiServers();
          }
        } else {
          stopBrowserApiServers();
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
      } else if (req.url === '/api/gdrive/connect') {
        try {
          const r = await gdriveConnectFlow()
          res.writeHead(r?.success ? 200 : 500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(r))
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: error.message }))
        }
      } else if (req.url === '/api/uptime/monitors') {
        try {
          const payload = JSON.parse(body || '{}')
          const r = await uptimeMonitor.addMonitor(payload)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(r))
        } catch (error) {
          res.writeHead(error.status || 500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: error.message || 'Unable to create monitor' }))
        }
      } else if (/^\/api\/uptime\/monitors\/\d+$/.test(req.url)) {
        try {
          const monitorId = Number(req.url.split('/').pop())
          const payload = JSON.parse(body || '{}')
          const r = payload?._method === 'DELETE'
            ? await uptimeMonitor.deleteMonitor(monitorId, { deleteChildren: Boolean(payload.deleteChildren) })
            : await uptimeMonitor.updateMonitor(monitorId, payload)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(r))
        } catch (error) {
          res.writeHead(error.status || 500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: error.message || 'Unable to update monitor' }))
        }
      } else if (/^\/api\/uptime\/monitors\/\d+\/pause$/.test(req.url)) {
        try {
          const monitorId = Number(req.url.split('/').at(-2))
          const payload = JSON.parse(body || '{}')
          const r = await uptimeMonitor.pauseMonitor(monitorId, Boolean(payload.paused))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(r))
        } catch (error) {
          res.writeHead(error.status || 500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: error.message || 'Unable to update monitor pause state' }))
        }
      } else if (req.url === '/api/export-all-data') {
        const exportData = await appDataExport.buildExportPayload(await getAppExportDeps())
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: exportData }))
      } else if (req.url === '/api/import-all-data') {
        const payload = JSON.parse(body || '{}')
        const importData = payload?.data || payload

        if (!appDataExport.validateExportPayload(importData)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Invalid export file format' }))
          return
        }

        await appDataExport.importExportPayload(importData, getAppImportDeps())
        appSettings = config.getAppSettings()

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
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
            toolOrder: [],
            activeTools: {
              'bcrypt-generate': true,
              'bcrypt-verify': true,
              'public-ip': true,
              'ip-location': true,
              'pinggy': true,
              'text-reformat': true,
              'password-generator': true,
              'onetimesecret': true
            },
            notesUi: {
              mode: 'notes',
              selectedId: null,
              expandedIds: [],
              newPageType: 'canvas'
            }
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
      } else if (req.url === '/api/gdrive/disconnect') {
        try {
          setGdriveAuthConfig(null)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: error.message }))
        }
      } else if (req.url === '/api/gdrive/backup-now') {
        try {
          const r = await uploadBackupToDrive()
          res.writeHead(r?.success ? 200 : 500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(r))
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: error.message }))
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
          const { fetchIpLocationResults } = require('./ipGeolocation')
          const apiKey = appSettings.apiKeys?.ipLocation || process.env.IPGEOLOCATION_API_KEY
          const results = await fetchIpLocationResults(ips, apiKey)
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
        } catch (error) {
          const status = error.message?.includes('API key') ? 400 : 500
          res.writeHead(status, { 'Content-Type': 'application/json' });
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
          const translated = await textLlmService.translateText(appSettings, text, targetLanguage);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text: translated }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
        }
      } else if (req.url === '/api/create-onetimesecret') {
        const { secret, ttl } = JSON.parse(body);
        try {
          if (!secret || !secret.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Secret is required' }));
            return;
          }

          const https = require('https');
          const querystring = require('querystring');
          
          const postData = querystring.stringify({
            secret: secret.trim(),
            ttl: ttl || 3600
          });

          const options = {
            hostname: 'us.onetimesecret.com',
            port: 443,
            path: '/api/v1/share',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 10000
          };

          const apiReq = https.request(options, (apiRes) => {
            let data = '';
            apiRes.on('data', (chunk) => {
              data += chunk;
            });
            apiRes.on('end', () => {
              try {
                if (apiRes.statusCode !== 200) {
                  res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `OneTimeSecret API returned status ${apiRes.statusCode}` }));
                  return;
                }
                const result = JSON.parse(data);
                if (result.secret_key) {
                  const secretUrl = `https://us.onetimesecret.com/secret/${result.secret_key}`;
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ 
                    url: secretUrl,
                    secretKey: result.secret_key,
                    metadataKey: result.metadata_key
                  }));
                } else {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Invalid response from OneTimeSecret API' }));
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

          apiReq.write(postData);
          apiReq.end();
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'Failed to create OneTimeSecret' }));
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
          const { codes, nextCodes } = authenticator.getAllTOTPCodes(secrets);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ codes, nextCodes }));
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
        const bodyData = JSON.parse(body);
        const text = bodyData.text;
        const tones = Array.isArray(bodyData.tones) ? bodyData.tones : (bodyData.tone != null ? [bodyData.tone] : ['professional']);
        try {
          const reformatted = await textLlmService.reformatText(appSettings, text, tones);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text: reformatted }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'Failed to reformat text' }));
        }
      } else if (req.url === '/api/ai-edit-text') {
        const bodyData = JSON.parse(body);
        const text = bodyData.text;
        const action = typeof bodyData.action === 'string' ? bodyData.action : 'improve';
        const extra = {
          instruction: typeof bodyData.instruction === 'string' ? bodyData.instruction : undefined,
          targetLanguage: typeof bodyData.targetLanguage === 'string' ? bodyData.targetLanguage : undefined
        };
        try {
          const edited = await textLlmService.aiEditText(appSettings, text, action, extra);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text: edited }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'Failed to apply AI edit' }));
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

async function startBrowserServers() {
  await startInternalStaticServer();
  startBrowserApiServers();
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

function isTrayOnlyMode() {
  return process.platform === 'darwin' && appSettings.showInDock === false
}

function scheduleTrayOnlyBlurHide() {
  windowBlurHideEnabled = false
  if (!isTrayOnlyMode()) return

  // Brief delay so opening from the tray does not immediately hide on blur.
  setTimeout(() => {
    if (win && !win.isDestroyed() && win.isVisible()) {
      windowBlurHideEnabled = true
    }
  }, 300)
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
  scheduleTrayOnlyBlurHide()
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

  // Register agent IPC handlers first so Agent tab works even if KB DB init fails
  try {
    setupAgentModule()
    console.log('✅ Agent IPC handlers registered')
  } catch (error) {
    console.error('Failed to register agent handlers:', error)
  }

  try {
    await agentKnowledge.initDatabase()
    console.log('✅ Agent knowledge database initialized')

    try {
      const chokidar = require('chokidar')
      const notesRoot = path.join(app.getPath('userData'), 'notes')
      let reindexTimer = null
      chokidar.watch(notesRoot, { ignoreInitial: true, depth: 10 }).on('all', () => {
        clearTimeout(reindexTimer)
        reindexTimer = setTimeout(() => {
          if (appSettings?.agent?.capabilities?.knowledgeBase) {
            agentKnowledge.reindexAll(appSettings, appSettings?.agent?.knowledgeBase).catch(() => {})
          }
        }, 5000)
      })
    } catch (watchErr) {
      console.warn('Notes watch for agent KB unavailable:', watchErr.message)
    }
  } catch (error) {
    console.error('Failed to initialize agent module:', error)
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

  // Static server for Electron renderer; API servers when browser access is enabled.
  await startInternalStaticServer();
  if (appSettings.webAccess) {
    startBrowserApiServers();
  }

  restartGdriveBackupScheduler()
  if (uptimeMonitor.isUptimeKumaEnabled()) {
    uptimeMonitor.startBackgroundSync()
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

async function gdriveConnectFlow() {
  // Starts an OAuth flow in the user's browser and stores refresh token.
  const server = http.createServer()
  const codePromise = new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1')
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        const code = url.searchParams.get('code')
        if (!code) {
          res.writeHead(400)
          res.end('Missing code')
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body><h3>DeskMaster</h3><p>Google Drive connected. You can close this window.</p></body></html>')
        resolve(code)
      } catch (e) {
        reject(e)
      } finally {
        try {
          server.close()
        } catch {}
      }
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err?.code === 'EADDRINUSE') {
        reject(new Error(`OAuth port ${GDRIVE_OAUTH_PORT} is already in use. Close other DeskMaster instances and try again.`))
        return
      }
      reject(err)
    })
    server.listen(GDRIVE_OAUTH_PORT, '127.0.0.1', () => resolve())
  })
  const redirectUri = `http://127.0.0.1:${GDRIVE_OAUTH_PORT}/oauth2callback`
  const { clientId, clientSecret } = getGdriveOAuthClient(redirectUri)
  const authUrl = gdriveBackup.buildAuthUrl({ clientId, redirectUri })

  await shell.openExternal(authUrl)
  const code = await codePromise
  const tokenRes = await gdriveBackup.exchangeAuthCode({ clientId, clientSecret, redirectUri, code })
  const refresh = tokenRes?.refresh_token
  if (!refresh) throw new Error('Google did not return a refresh token. Try connecting again.')
  setGdriveAuthConfig({
    refresh_token: refresh,
    client_id: clientId,
    client_secret: clientSecret,
    connectedAt: new Date().toISOString()
  })
  await gdriveBackup.verifyCredentials({ clientId, clientSecret, refreshToken: refresh })
  restartGdriveBackupScheduler()
  return { success: true }
}

ipcMain.handle('gdrive:connect', async () => {
  return await gdriveConnectFlow()
})

ipcMain.handle('gdrive:disconnect', async () => {
  setGdriveAuthConfig(null)
  restartGdriveBackupScheduler()
  return { success: true }
})

ipcMain.handle('gdrive:backup-now', async () => {
  return await uploadBackupToDrive()
})

ipcMain.handle('gdrive:status', async () => {
  const auth = getGdriveAuthConfig()
  const s = getCloudBackupSettings()
  return {
    connected: Boolean(auth?.refresh_token),
    enabled: Boolean(s?.enabled),
    intervalHours: Number(s?.intervalHours) || 4,
    keepLast: Number(s?.keepLast) || 10,
    oauthConfigured: hasGdriveOAuthCredentials(),
    lastBackupAt: s?.lastBackupAt || null,
    lastBackupStatus: s?.lastBackupStatus || null,
    lastBackupError: s?.lastBackupError || null,
    running: Boolean(gdriveBackupRunning)
  }
})

ipcMain.handle('uptime:get-monitors', async (event, payload) => {
  return await uptimeMonitor.getMonitorResponse({ force: Boolean(payload?.refresh) })
})

ipcMain.handle('uptime:create-monitor', async (event, payload) => {
  return await uptimeMonitor.addMonitor(payload || {})
})

ipcMain.handle('uptime:update-monitor', async (event, payload) => {
  return await uptimeMonitor.updateMonitor(payload?.id, payload?.monitor || {})
})

ipcMain.handle('uptime:delete-monitor', async (event, payload) => {
  return await uptimeMonitor.deleteMonitor(payload?.id, { deleteChildren: Boolean(payload?.deleteChildren) })
})

ipcMain.handle('uptime:pause-monitor', async (event, payload) => {
  return await uptimeMonitor.pauseMonitor(payload?.id, Boolean(payload?.paused))
})

// Show or hide the macOS Dock icon (tray-only vs regular app).
function updateDockVisibility() {
  if (process.platform !== 'darwin') return

  if (appSettings.showInDock !== false) {
    windowBlurHideEnabled = false
    app.dock.show()
  } else {
    app.dock.hide()
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

  // Restart cloud backup scheduler when backup settings change.
  if (newSettings.cloudBackup !== undefined) {
    syncGdriveAuthWithSettings(newSettings.cloudBackup)
    restartGdriveBackupScheduler()
  }

  if (newSettings.uptimeKuma !== undefined) {
    uptimeMonitor.restartBackgroundSync()
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
    // Start API servers if not already running (static server always stays up for Electron).
    if (!wss || !httpServer) {
      startBrowserApiServers();
    }
  } else {
    stopBrowserApiServers();
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

function getNotesRootDir() {
  return path.join(app.getPath('userData'), 'notes');
}

function getNotesArchivedDir() {
  return path.join(getNotesRootDir(), 'Archived');
}

function getNotesClipboardDir() {
  return path.join(getNotesRootDir(), '_clipboard');
}

function ensureNotesDirs() {
  fs.mkdirSync(getNotesRootDir(), { recursive: true });
  fs.mkdirSync(getNotesArchivedDir(), { recursive: true });
  fs.mkdirSync(getNotesClipboardDir(), { recursive: true });
}

function sanitizeFolderPart(value) {
  const v = String(value || '').trim();
  const cleaned = v.replace(/[\\/:"*?<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Untitled';
}

function createNoteId() {
  return `note_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function getMetaPath(dir) {
  return path.join(dir, 'meta.json');
}

function getContentPath(dir) {
  return path.join(dir, 'content.json');
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function makePageFolderName({ order, title, id }) {
  const orderPart = String(order || 0).padStart(6, '0');
  const titlePart = sanitizeFolderPart(title);
  return `${orderPart}__${titlePart}__${id}`;
}

function listChildPageDirs(parentDir) {
  try {
    return fs
      .readdirSync(parentDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(parentDir, d.name));
  } catch {
    return [];
  }
}

function findPageDirById(rootDir, id) {
  const scan = (startDir) => {
    const stack = [startDir];
    while (stack.length) {
      const dir = stack.pop();
      const meta = readJsonFile(getMetaPath(dir), null);
      if (meta && meta.id === id) return dir;
      const children = listChildPageDirs(dir);
      for (const child of children) stack.push(child);
    }
    return null;
  };

  const inRoot = scan(rootDir);
  if (inRoot) return inRoot;
  const inArchived = scan(getNotesArchivedDir());
  if (inArchived) return inArchived;
  const inClipboard = scan(getNotesClipboardDir());
  if (inClipboard) return inClipboard;
  return null;
}

function buildTreeFromDir(parentDir) {
  const dirs = listChildPageDirs(parentDir)
    .filter((p) => p !== getNotesArchivedDir() && p !== getNotesClipboardDir())
    .map((dir) => {
      const meta = readJsonFile(getMetaPath(dir), null);
      if (!meta || !meta.id) return null;
      const order = typeof meta.order === 'number' ? meta.order : 0;
      const type = meta.type || 'canvas';
      const children = buildTreeFromDir(dir);
      return { id: meta.id, title: meta.title || 'Untitled', type, order, children };
    })
    .filter(Boolean)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return dirs.map(({ order, ...rest }) => rest);
}

function getNotesTreePayload() {
  ensureNotesDirs();
  const rootNodes = buildTreeFromDir(getNotesRootDir());
  const archivedChildren = buildTreeFromDir(getNotesArchivedDir());
  return [...rootNodes, { id: 'notes_archived_root', title: 'Archived', children: archivedChildren }];
}

const AI_RESPONSES_FOLDER_TITLE = 'AI responses';

function pageExistsInNotesTree(nodes, id) {
  if (!id) return false;
  for (const n of nodes || []) {
    if (n.id === id) return true;
    if (n.children?.length && pageExistsInNotesTree(n.children, id)) return true;
  }
  return false;
}

function findRootNotesPageIdByTitle(title) {
  ensureNotesDirs();
  const dirs = listChildPageDirs(getNotesRootDir())
    .filter((p) => p !== getNotesArchivedDir() && p !== getNotesClipboardDir());
  for (const dir of dirs) {
    const meta = readJsonFile(getMetaPath(dir), null);
    if (meta?.title === title && meta.id) return meta.id;
  }
  return null;
}

function persistAgentSettingPatch(patch) {
  const current = config.getAppSettings();
  config.setAppSettings({
    ...current,
    agent: { ...current.agent, ...patch }
  });
  appSettings = config.getAppSettings();
}

function ensureAgentAiResponsesFolderId() {
  ensureNotesDirs();
  const stored = appSettings.agent?.aiResponsesFolderId;
  if (stored && findPageDirById(getNotesRootDir(), stored)) {
    return stored;
  }
  const byTitle = findRootNotesPageIdByTitle(AI_RESPONSES_FOLDER_TITLE);
  if (byTitle) {
    persistAgentSettingPatch({ aiResponsesFolderId: byTitle });
    return byTitle;
  }
  const id = createPageOnDisk({
    parentDir: getNotesRootDir(),
    title: AI_RESPONSES_FOLDER_TITLE,
    type: 'text'
  });
  persistAgentSettingPatch({ aiResponsesFolderId: id });
  return id;
}

function getNotesTreeForAgentPicker() {
  return getNotesTreePayload().filter((n) => n.id !== 'notes_archived_root');
}

function resolveAgentNotesSaveParentId(tree) {
  const defaultId = ensureAgentAiResponsesFolderId();
  const lastId = appSettings.agent?.lastNotesSaveParentId;
  if (lastId && pageExistsInNotesTree(tree, lastId)) return lastId;
  return defaultId;
}

function getAgentNotesSaveContext() {
  ensureNotesDirs();
  const tree = getNotesTreeForAgentPicker();
  const aiResponsesFolderId = ensureAgentAiResponsesFolderId();
  const selectedParentId = resolveAgentNotesSaveParentId(tree);
  return { tree, aiResponsesFolderId, selectedParentId };
}

function setAgentNotesSaveParent(parentId) {
  const tree = getNotesTreeForAgentPicker();
  if (!parentId || !pageExistsInNotesTree(tree, parentId)) {
    throw new Error('Invalid notes location');
  }
  persistAgentSettingPatch({ lastNotesSaveParentId: parentId });
  return { parentId };
}

function saveAgentResponseToNotes({ parentId, title, markdown }) {
  ensureNotesDirs();
  const tree = getNotesTreeForAgentPicker();
  let resolvedParent = parentId;
  if (!resolvedParent || !pageExistsInNotesTree(tree, resolvedParent)) {
    resolvedParent = resolveAgentNotesSaveParentId(tree);
  }
  const parentDir = resolveParentDir(resolvedParent);
  if (!parentDir) throw new Error('Invalid parent location');
  const pageTitle = String(title || '').trim().slice(0, 80) || 'Agent response';
  const content = String(markdown || '').trim();
  if (!content) throw new Error('Nothing to save');
  const id = createPageOnDisk({ parentDir, title: pageTitle, type: 'markdown' });
  const dir = findPageDirById(getNotesRootDir(), id);
  if (!dir) throw new Error('Failed to create note');
  writeJsonFile(getContentPath(dir), { text: content });
  persistAgentSettingPatch({ lastNotesSaveParentId: resolvedParent });
  return { id, parentId: resolvedParent, title: pageTitle };
}

function notesHasPages() {
  ensureNotesDirs();
  const rootDirs = listChildPageDirs(getNotesRootDir()).filter((p) => p !== getNotesArchivedDir() && p !== getNotesClipboardDir());
  const archivedDirs = listChildPageDirs(getNotesArchivedDir());
  return rootDirs.length > 0 || archivedDirs.length > 0;
}

function resolveParentDir(targetParentId) {
  if (!targetParentId) return getNotesRootDir();
  if (targetParentId === 'notes_archived_root') return getNotesArchivedDir();
  return findPageDirById(getNotesRootDir(), targetParentId);
}

function getNextOrder(parentDir) {
  const children = listChildPageDirs(parentDir);
  let maxOrder = 0;
  for (const c of children) {
    const meta = readJsonFile(getMetaPath(c), null);
    if (meta && typeof meta.order === 'number') maxOrder = Math.max(maxOrder, meta.order);
  }
  return maxOrder + 1;
}

function listDirectChildrenMeta(parentDir) {
  const children = listChildPageDirs(parentDir);
  const out = [];
  for (const dir of children) {
    if (dir === getNotesArchivedDir() || dir === getNotesClipboardDir()) continue;
    const meta = readJsonFile(getMetaPath(dir), null);
    if (!meta || !meta.id) continue;
    out.push({ dir, meta });
  }
  out.sort((a, b) => (Number(a.meta.order) || 0) - (Number(b.meta.order) || 0));
  return out;
}

function resequenceChildrenInDir(parentDir, orderedIds) {
  const children = listDirectChildrenMeta(parentDir);
  const byId = new Map(children.map((c) => [c.meta.id, c]));

  const ids = Array.isArray(orderedIds) && orderedIds.length ? orderedIds.filter((id) => byId.has(id)) : children.map((c) => c.meta.id);
  // Ensure we keep any children not mentioned in orderedIds (append them).
  for (const c of children) {
    if (!ids.includes(c.meta.id)) ids.push(c.meta.id);
  }

  const tmpPrefix = `__tmp__${Date.now()}__`;
  const tempMoves = [];

  // First pass: rename everything to temporary names to avoid collisions.
  ids.forEach((id) => {
    const entry = byId.get(id);
    if (!entry) return;
    const tmpDir = path.join(parentDir, `${tmpPrefix}${id}`);
    try {
      fs.renameSync(entry.dir, tmpDir);
      entry.dir = tmpDir;
      tempMoves.push(entry);
    } catch {}
  });

  // Second pass: write new orders and rename to final names.
  let order = 1;
  ids.forEach((id) => {
    const entry = byId.get(id);
    if (!entry) return;
    const nextMeta = { ...entry.meta, order, updatedAt: new Date().toISOString() };
    order += 1;
    writeJsonFile(getMetaPath(entry.dir), nextMeta);
    entry.meta = nextMeta;
    updateFolderNameToMatchMeta(entry.dir);
  });
}

function createPageOnDisk({ parentDir, title, type }) {
  const id = createNoteId();
  const order = getNextOrder(parentDir);
  const dirName = makePageFolderName({ order, title, id });
  const dir = path.join(parentDir, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const normalizedType = ['canvas', 'markdown', 'text'].includes(String(type)) ? String(type) : 'canvas';
  writeJsonFile(getMetaPath(dir), { id, title, type: normalizedType, order, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (normalizedType === 'canvas') writeJsonFile(getContentPath(dir), { blocks: [] });
  else writeJsonFile(getContentPath(dir), { text: '' });
  return id;
}

function updateFolderNameToMatchMeta(dir) {
  const meta = readJsonFile(getMetaPath(dir), null);
  if (!meta || !meta.id) return dir;
  const parent = path.dirname(dir);
  const nextName = makePageFolderName({ order: meta.order || 0, title: meta.title || 'Untitled', id: meta.id });
  const nextDir = path.join(parent, nextName);
  if (nextDir === dir) return dir;
  try {
    fs.renameSync(dir, nextDir);
    return nextDir;
  } catch {
    return dir;
  }
}

function deleteDirRecursive(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function copyDirWithNewIds(srcDir, destParentDir, overrideOrder) {
  const srcMeta = readJsonFile(getMetaPath(srcDir), null);
  if (!srcMeta || !srcMeta.id) return null;
  const newId = createNoteId();
  const order = typeof overrideOrder === 'number' ? overrideOrder : (typeof srcMeta.order === 'number' ? srcMeta.order : 0);
  const title = srcMeta.title || 'Untitled';
  const destDirName = makePageFolderName({ order, title, id: newId });
  const destDir = path.join(destParentDir, destDirName);
  fs.mkdirSync(destDir, { recursive: true });

  const nextMeta = { ...srcMeta, id: newId, order, updatedAt: new Date().toISOString() };
  writeJsonFile(getMetaPath(destDir), nextMeta);

  const srcContent = readJsonFile(getContentPath(srcDir), { blocks: [] });
  writeJsonFile(getContentPath(destDir), srcContent);

  const children = listChildPageDirs(srcDir);
  for (const child of children) {
    copyDirWithNewIds(child, destDir);
  }

  return newId;
}

async function getNotesExportPayload() {
  ensureNotesDirs();
  const root = getNotesRootDir();
  const files = [];

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (full === getNotesClipboardDir()) continue;
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        const data = fs.readFileSync(full);
        files.push({ path: rel, data: data.toString('base64') });
      }
    }
  };

  walk(root);
  return { version: 1, files };
}

function clearNotesStorage() {
  ensureNotesDirs();
  const root = getNotesRootDir();
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
  ensureNotesDirs();
}

function importNotesFromPayload(notesPayload) {
  if (!notesPayload || !Array.isArray(notesPayload.files)) return;
  clearNotesStorage();
  const root = getNotesRootDir();

  for (const f of notesPayload.files) {
    const rel = String(f.path || '');
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue;
    const safeRel = rel.split('/').join(path.sep);
    const dest = path.join(root, safeRel);
    if (!dest.startsWith(root)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = Buffer.from(String(f.data || ''), 'base64');
    fs.writeFileSync(dest, buf);
  }
}

function importNotesFromLegacy(tree, pageStatesById) {
  if (!Array.isArray(tree)) return;
  clearNotesStorage();
  ensureNotesDirs();

  const writeNode = (node, parentDir) => {
    if (!node || !node.id) return;
    const title = node.title || 'Untitled';
    const order = getNextOrder(parentDir);
    const dirName = makePageFolderName({ order, title, id: node.id });
    const dir = path.join(parentDir, dirName);
    fs.mkdirSync(dir, { recursive: true });
    writeJsonFile(getMetaPath(dir), { id: node.id, title, type: 'canvas', order, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const raw = pageStatesById && pageStatesById[node.id];
    if (raw) {
      try {
        writeJsonFile(getContentPath(dir), JSON.parse(raw));
      } catch {
        writeJsonFile(getContentPath(dir), { blocks: [] });
      }
    } else {
      writeJsonFile(getContentPath(dir), { blocks: [] });
    }
    if (Array.isArray(node.children)) node.children.forEach((c) => writeNode(c, dir));
  };

  const archiveNode = tree.find((n) => n && n.id === 'notes_archived_root');
  const rootNodes = tree.filter((n) => n && n.id !== 'notes_archived_root');
  rootNodes.forEach((n) => writeNode(n, getNotesRootDir()));
  if (archiveNode && Array.isArray(archiveNode.children)) {
    archiveNode.children.forEach((n) => writeNode(n, getNotesArchivedDir()));
  }
}

ipcMain.handle('notes:search', async (event, query) => {
  return notesSearch.searchNotesPages(query)
})

ipcMain.handle('notes:has-pages', async () => {
  try {
    ensureNotesDirs();
    return notesHasPages();
  } catch {
    return false;
  }
});

ipcMain.handle('notes:list-tree', async () => {
  ensureNotesDirs();
  return getNotesTreePayload();
});

ipcMain.handle('notes:get-page-state', async (event, id) => {
  ensureNotesDirs();
  const dir = findPageDirById(getNotesRootDir(), id);
  if (!dir) return null;
  return readJsonFile(getContentPath(dir), null);
});

ipcMain.handle('notes:save-page-state', async (event, payload) => {
  try {
    ensureNotesDirs();
    const id = payload?.id;
    const state = payload?.state;
    const dir = findPageDirById(getNotesRootDir(), id);
    if (!dir) return false;
    writeJsonFile(getContentPath(dir), state || { blocks: [] });
    const metaPath = getMetaPath(dir);
    const meta = readJsonFile(metaPath, null);
    if (meta) {
      writeJsonFile(metaPath, { ...meta, updatedAt: new Date().toISOString() });
      updateFolderNameToMatchMeta(dir);
    }
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('notes:create-page', async (event, payload) => {
  ensureNotesDirs();
  const parentDir = resolveParentDir(payload?.parentId);
  if (!parentDir) throw new Error('Invalid parent');
  const title = payload?.title || 'New page';
  const type = payload?.type;
  const id = createPageOnDisk({ parentDir, title, type });
  return { id };
});

ipcMain.handle('notes:rename-page', async (event, payload) => {
  ensureNotesDirs();
  const id = payload?.id;
  const title = String(payload?.title || '').trim();
  if (!id || !title) return false;
  const dir = findPageDirById(getNotesRootDir(), id);
  if (!dir) return false;
  const metaPath = getMetaPath(dir);
  const meta = readJsonFile(metaPath, null);
  if (!meta) return false;
  writeJsonFile(metaPath, { ...meta, title, updatedAt: new Date().toISOString() });
  updateFolderNameToMatchMeta(dir);
  return true;
});

ipcMain.handle('notes:delete-page', async (event, id) => {
  ensureNotesDirs();
  if (!id || id === 'notes_archived_root') return false;
  const dir = findPageDirById(getNotesRootDir(), id);
  if (!dir) return false;
  deleteDirRecursive(dir);
  return true;
});

ipcMain.handle('notes:move-page', async (event, payload) => {
  ensureNotesDirs();
  const id = payload?.id;
  const targetParentId = payload?.targetParentId ?? null;
  const beforeId = payload?.beforeId || null;
  const afterId = payload?.afterId || null;
  if (!id || id === 'notes_archived_root') return false;
  const srcDir = findPageDirById(getNotesRootDir(), id);
  if (!srcDir) return false;
  const destParentDir = resolveParentDir(targetParentId);
  if (!destParentDir) return false;
  const metaPath = getMetaPath(srcDir);
  const meta = readJsonFile(metaPath, null);
  if (!meta) return false;

  // Move into destination first (with a temporary order/name); we'll resequence next.
  const provisionalOrder = getNextOrder(destParentDir);
  const provisionalMeta = { ...meta, order: provisionalOrder, updatedAt: new Date().toISOString() };
  const provisionalName = makePageFolderName({ order: provisionalMeta.order, title: provisionalMeta.title || 'Untitled', id: provisionalMeta.id });
  const provisionalDir = path.join(destParentDir, provisionalName);
  fs.renameSync(srcDir, provisionalDir);
  writeJsonFile(getMetaPath(provisionalDir), provisionalMeta);
  updateFolderNameToMatchMeta(provisionalDir);

  // Reorder within destination if requested.
  if (beforeId || afterId) {
    const children = listDirectChildrenMeta(destParentDir).map((c) => c.meta.id).filter((x) => x !== id);
    const insertIdx = (() => {
      const pivot = beforeId || afterId;
      const at = children.indexOf(pivot);
      if (at === -1) return children.length;
      return beforeId ? at : at + 1;
    })();
    children.splice(insertIdx, 0, id);
    resequenceChildrenInDir(destParentDir, children);
  }

  return true;
});

ipcMain.handle('notes:copy-page', async (event, payload) => {
  ensureNotesDirs();
  const id = payload?.id;
  const targetParentId = payload?.targetParentId ?? null;
  if (!id || id === 'notes_archived_root') return null;
  const srcDir = findPageDirById(getNotesRootDir(), id);
  if (!srcDir) return null;
  const destParentDir = resolveParentDir(targetParentId);
  if (!destParentDir) return null;
  const nextOrder = getNextOrder(destParentDir);
  const newId = copyDirWithNewIds(srcDir, destParentDir, nextOrder);
  return newId ? { id: newId } : null;
});

ipcMain.handle('notes:cut-page', async (event, id) => {
  ensureNotesDirs();
  if (!id || id === 'notes_archived_root') return false;
  const srcDir = findPageDirById(getNotesRootDir(), id);
  if (!srcDir) return false;
  const clipboardDir = getNotesClipboardDir();
  deleteDirRecursive(clipboardDir);
  fs.mkdirSync(clipboardDir, { recursive: true });
  const dest = path.join(clipboardDir, path.basename(srcDir));
  fs.renameSync(srcDir, dest);
  return true;
});

ipcMain.handle('notes:paste-cut', async (event, payload) => {
  ensureNotesDirs();
  const targetParentId = payload?.targetParentId ?? null;
  const clipboardDir = getNotesClipboardDir();
  const entries = listChildPageDirs(clipboardDir);
  const srcDir = entries[0];
  if (!srcDir) return null;
  const meta = readJsonFile(getMetaPath(srcDir), null);
  if (!meta || !meta.id) return null;
  const destParentDir = resolveParentDir(targetParentId);
  if (!destParentDir) return null;
  const nextOrder = getNextOrder(destParentDir);
  const nextMeta = { ...meta, order: nextOrder, updatedAt: new Date().toISOString() };
  const destName = makePageFolderName({ order: nextMeta.order, title: nextMeta.title || 'Untitled', id: nextMeta.id });
  const destDir = path.join(destParentDir, destName);
  fs.renameSync(srcDir, destDir);
  writeJsonFile(getMetaPath(destDir), nextMeta);
  deleteDirRecursive(clipboardDir);
  fs.mkdirSync(clipboardDir, { recursive: true });
  return { id: nextMeta.id };
});

ipcMain.handle('notes:migrate-legacy', async (event, payload) => {
  ensureNotesDirs();
  importNotesFromLegacy(payload?.tree, payload?.pageStatesById);
  return true;
});

// Export all data handler
ipcMain.handle('export-all-data', async (event) => {
  try {
    // Prompt for encryption key (optional)
    const encryptionKey = await promptEncryptionKey('Export Encryption', 'Enter encryption key (leave empty to export without encryption):');
    
    // Collect all data
    const exportData = await appDataExport.buildExportPayload(await getAppExportDeps());

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
    if (!appDataExport.validateExportPayload(importData)) {
      throw new Error('Invalid export file format');
    }

    await appDataExport.importExportPayload(importData, getAppImportDeps());
    appSettings = config.getAppSettings();

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
      toolOrder: [],
      activeTools: {
        'bcrypt-generate': true,
        'bcrypt-verify': true,
        'public-ip': true,
        'ip-location': true,
        'pinggy': true,
        'text-reformat': true,
        'password-generator': true,
        'onetimesecret': true
      },
      notesUi: {
        mode: 'notes',
        selectedId: null,
        expandedIds: [],
        newPageType: 'canvas'
      }
    };
    config.setAppSettings(defaultSettings);
    appSettings = config.getAppSettings();

    clearNotesStorage();

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

// Text tools IPC handlers (use AI Agent provider + fallback)
ipcMain.handle('translate-text', async (event, text, targetLanguage) => {
  try {
    return await textLlmService.translateText(appSettings, text, targetLanguage);
  } catch (error) {
    console.error('Error translating text:', error);
    throw error;
  }
});

ipcMain.handle('ai-edit-text', async (event, text, action, extra = {}) => {
  try {
    return await textLlmService.aiEditText(appSettings, text, action, extra);
  } catch (error) {
    console.error('Error applying AI edit:', error);
    throw error;
  }
});

ipcMain.handle('reformat-text', async (event, text, tones) => {
  try {
    return await textLlmService.reformatText(appSettings, text, tones);
  } catch (error) {
    console.error('Error reformatting text:', error);
    throw error;
  }
});

// OneTimeSecret IPC handler
ipcMain.handle('create-onetimesecret', async (event, secret, ttl = 3600) => {
  try {
    if (!secret || !secret.trim()) {
      throw new Error('Secret is required');
    }

    const https = require('https');
    const querystring = require('querystring');
    
    const postData = querystring.stringify({
      secret: secret.trim(),
      ttl: ttl || 3600
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'us.onetimesecret.com',
        port: 443,
        path: '/api/v1/share',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`OneTimeSecret API returned status ${res.statusCode}`));
              return;
            }
            const result = JSON.parse(data);
            if (result.secret_key) {
              const secretUrl = `https://us.onetimesecret.com/secret/${result.secret_key}`;
              resolve({
                url: secretUrl,
                secretKey: result.secret_key,
                metadataKey: result.metadata_key
              });
            } else {
              reject(new Error('Invalid response from OneTimeSecret API'));
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

      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error('Error creating OneTimeSecret:', error);
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
    const { fetchIpLocationResults } = require('./ipGeolocation')
    const apiKey = appSettings.apiKeys?.ipLocation || process.env.IPGEOLOCATION_API_KEY
    return await fetchIpLocationResults(ips, apiKey)
  } catch (error) {
    console.error('Error fetching IP locations:', error)
    throw error
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

ipcMain.handle('fetch-authenticator-logo', async (event, domain) => {
  try {
    return await authenticatorLogo.fetchFaviconDataUrl(domain);
  } catch (error) {
    console.error('Error fetching authenticator logo:', error);
    return null;
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

ipcMain.handle('copy-to-clipboard', async (event, text, options) => {
  try {
    const { clipboard } = require('electron');
    const value = String(text ?? '');
    clipboard.writeText(value);
    if (options?.skipHistory) {
      clipboardTracker.skipClipboardCapture(value);
    }
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
  appIsQuitting = true
  if (mainWindowSaveTimer) {
    clearTimeout(mainWindowSaveTimer)
    mainWindowSaveTimer = null
  }
  saveMainWindowState()
  clearGdriveBackupTimer()
  uptimeMonitor.stopBackgroundSync()

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

const STATS_HISTORY_RANGE_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

async function querySystemStatsHistoryForAgent(args = {}) {
  const now = Date.now();
  let endTime = now;
  let startTime;

  if (args.range && STATS_HISTORY_RANGE_MS[args.range]) {
    startTime = now - STATS_HISTORY_RANGE_MS[args.range];
  } else if (args.startTime) {
    startTime = new Date(args.startTime).getTime();
    if (Number.isNaN(startTime)) throw new Error('Invalid startTime');
    if (args.endTime) {
      endTime = new Date(args.endTime).getTime();
      if (Number.isNaN(endTime)) throw new Error('Invalid endTime');
    }
  } else {
    startTime = now - STATS_HISTORY_RANGE_MS['24h'];
  }

  if (startTime > endTime) {
    const swap = startTime;
    startTime = endTime;
    endTime = swap;
  }

  const availableRange = await history.getTimeRange();
  const analysis = await history.analyzeHistory(startTime, endTime, {
    cpuThreshold: typeof args.cpuThreshold === 'number' ? args.cpuThreshold : undefined
  });

  return {
    availableDataRange: {
      oldest: availableRange.oldest,
      newest: availableRange.newest,
      oldestISO: availableRange.oldest ? new Date(availableRange.oldest).toISOString() : null,
      newestISO: availableRange.newest ? new Date(availableRange.newest).toISOString() : null,
      totalSamplesInDatabase: availableRange.count
    },
    query: {
      range: args.range || null,
      cpuThreshold: typeof args.cpuThreshold === 'number' ? args.cpuThreshold : null
    },
    ...analysis,
    note: analysis.sampleCount === 0
      ? 'No samples in the requested range. DeskMaster stores up to ~30 days of performance history (same as Performance screen).'
      : 'Each row is one stored sample (interval varies: ~5s recent, up to ~15min for older data). cpuAboveThreshold counts samples where CPU was >= threshold.'
  };
}

function updateAgentComposioToolkits(toolkits) {
  const next = {
    ...appSettings,
    agent: {
      ...(appSettings.agent || {}),
      composio: {
        ...(appSettings.agent?.composio || {}),
        enabledToolkits: toolkits
      }
    }
  }
  config.setAppSettings(next)
  appSettings = config.getAppSettings()
}

const agentHttpDeps = {
  updateAgentComposioToolkits,
  getAgentNotesSaveContext: () => getAgentNotesSaveContext(),
  setAgentNotesSaveParent: (parentId) => setAgentNotesSaveParent(parentId),
  saveAgentResponseToNotes: (payload) => saveAgentResponseToNotes(payload)
}

function getNotesPageForAgent(id) {
  ensureNotesDirs()
  const dir = findPageDirById(getNotesRootDir(), id)
  if (!dir) return null
  const meta = readJsonFile(getMetaPath(dir), null)
  const content = readJsonFile(getContentPath(dir), {})
  const body = notesSearch.extractPageBodyText(meta?.type || 'canvas', content)
  return { id: meta?.id, title: meta?.title, type: meta?.type, body, content }
}

function saveNotesPageTextForAgent(id, text) {
  ensureNotesDirs()
  const dir = findPageDirById(getNotesRootDir(), id)
  if (!dir) return { success: false, error: 'Page not found' }
  const meta = readJsonFile(getMetaPath(dir), null)
  const type = meta?.type || 'canvas'
  if (type === 'canvas') {
    return { success: false, error: 'Canvas pages cannot be saved as plain text via agent. Use text or markdown pages.' }
  }
  const state = type === 'text' ? { text } : { text, blocknote: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
  writeJsonFile(getContentPath(dir), state)
  writeJsonFile(getMetaPath(dir), { ...meta, updatedAt: new Date().toISOString() })
  return { success: true, id }
}

function setupAgentModule() {
  agentOrchestrator.setBrowserStreamBroadcast(broadcastAgentStream)
  registerAgentHandlers({
    getAppSettings: () => appSettings,
    openExternal: (url) => shell.openExternal(url),
    updateAgentComposioToolkits,
    getAgentNotesSaveContext: () => getAgentNotesSaveContext(),
    setAgentNotesSaveParent: (parentId) => setAgentNotesSaveParent(parentId),
    saveAgentResponseToNotes: (payload) => saveAgentResponseToNotes(payload),
    getSystemStats: async () => {
      await stats.updateTrayStats()
      return stats.getCurrentStats()
    },
    querySystemStatsHistory: (args) => querySystemStatsHistoryForAgent(args),
    getAppVersion: () => app.getVersion(),
    notesSearch: (query) => notesSearch.searchNotesPages(query),
    notesGetPage: (id) => getNotesPageForAgent(id),
    notesCreatePage: (args) => {
      ensureNotesDirs()
      const parentDir = resolveParentDir(args?.parentId)
      const id = createPageOnDisk({ parentDir, title: args?.title || 'New page', type: args?.type || 'text' })
      return { id }
    },
    notesSavePage: (id, text) => saveNotesPageTextForAgent(id, text),
    bcryptGenerate: async (text) => {
      const hash = await bcrypt.hash(text, 10)
      return { hash }
    },
    bcryptVerify: async (text, hash) => ({ isValid: await bcrypt.compare(text, hash) }),
    getPublicIp: async () => {
      const https = require('https')
      return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (res) => {
          let data = ''
          res.on('data', (c) => { data += c })
          res.on('end', () => {
            try { resolve(JSON.parse(data).ip) } catch { reject(new Error('Failed to parse IP')) }
          })
        }).on('error', reject)
      })
    },
    getIpLocation: async (ips) => {
      const { fetchIpLocationResults } = require('./ipGeolocation')
      const apiKey = appSettings.apiKeys?.ipLocation || process.env.IPGEOLOCATION_API_KEY
      return fetchIpLocationResults(ips, apiKey)
    },
    translateText: (text, targetLanguage) => textLlmService.translateText(appSettings, text, targetLanguage),
    reformatText: (text, tones) => textLlmService.reformatText(appSettings, text, tones),
    aiEditText: (text, action, extra) => textLlmService.aiEditText(appSettings, text, action, extra),
    uptimeListMonitors: async () => {
      if (appSettings.uptimeKuma?.enabled === false) return { enabled: false, monitors: [] }
      return uptimeMonitor.getMonitorResponse({ force: false })
    },
    gdriveStatus: async () => {
      const auth = getGdriveAuthConfig()
      const s = getCloudBackupSettings()
      return {
        connected: Boolean(auth?.refresh_token),
        enabled: Boolean(s?.enabled),
        lastBackupAt: s?.lastBackupAt || null,
        lastBackupStatus: s?.lastBackupStatus || null
      }
    },
    gdriveBackupNow: () => uploadBackupToDrive(),
    getSettingsSummary: () => ({
      theme: appSettings.theme,
      stats: appSettings.stats,
      timezoneCount: (appSettings.timezones || []).length,
      uptimeKumaEnabled: appSettings.uptimeKuma?.enabled !== false,
      webAccess: appSettings.webAccess
    }),
    kbSearch: (query, limit, agentSettings) => agentKnowledge.searchKnowledge(query, { agent: agentSettings, apiKeys: appSettings.apiKeys }, limit || 8),
    kbListDocuments: () => agentKnowledge.listCustomDocuments(),
    kbCreateDocument: async (title, content, agentSettings) => {
      const doc = agentKnowledge.createCustomDocument({ title, content })
      await agentKnowledge.reindexAll({ agent: agentSettings, apiKeys: appSettings.apiKeys }, appSettings.agent?.knowledgeBase)
      return doc
    },
    kbUpdateDocument: async (id, args, agentSettings) => {
      const doc = agentKnowledge.updateCustomDocument(id, args)
      await agentKnowledge.reindexAll({ agent: agentSettings, apiKeys: appSettings.apiKeys }, appSettings.agent?.knowledgeBase)
      return doc
    },
    generatePdf: (args) => require('./agentDocumentGenerator').generatePdf(args),
    generateDocx: (args) => require('./agentDocumentGenerator').generateDocx(args),
    generateXlsx: (args) => require('./agentDocumentGenerator').generateXlsx(args),
    generatePptx: (args) => require('./agentDocumentGenerator').generatePptx(args),
    openGeneratedFile: (filePath) => shell.openPath(filePath)
  })
}

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
