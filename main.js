const { app, BrowserWindow, Tray, nativeImage, ipcMain, Menu, nativeTheme } = require("electron")
const path = require("path")
const config = require("./config")
const stats = require("./stats")

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
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  })
}

let tray = null
let win = null
let trayIconWindow = null
let aboutWindow = null
let statsInterval = null
let trayUpdateInterval = null

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
      offscreen: true
    },
  })

  trayIconWindow.loadFile("dist/tray-icon.html")
  
  trayIconWindow.webContents.on('did-finish-load', () => {
    console.log('Tray icon window loaded')
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
      webSecurity: false,
    },
  })

  aboutWindow.loadFile("dist/about.html")

  aboutWindow.once('ready-to-show', () => {
    aboutWindow.show()
    aboutWindow.focus()
  })

  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 680,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'assets/icons/app-icon-256.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // Load React app from dist folder
  win.loadFile("dist/index.html")

  // Open DevTools for debugging
  // win.webContents.openDevTools()

  win.webContents.on('did-finish-load', () => {
    // TODO 
  })
  
  win.on("blur", () => {
    console.log("Window blurred")
    setTimeout(() => {
      if (!win.isFocused()) {
        console.log("Window is not focused, hiding")
        win.hide()
      }
    }, 100)
  })

  win.on("hide", () => {
    if (statsInterval) clearInterval(statsInterval)
  })
}

async function updateTrayIcon() {
  if (!trayIconWindow || !tray) return

  try {
    const currentStats = await stats.updateTrayStats();
    const timezones = config.getTimezones();

    // Debug: Log timezone data
    console.log('Tray timezones:', timezones.length, timezones.map(tz => tz.label));

    // Send current stats to tray icon window
    trayIconWindow.webContents.send('update-tray-stats', {
      ...currentStats,
      timezones: timezones,
      theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    })
    // log all html contents of trayIconWindow
    // console.log(await trayIconWindow.webContents.executeJavaScript('document.documentElement.outerHTML'))

    const width = 105 + (timezones.length * 72) + (currentStats.battery ? 25 : 0) + ((4+timezones.length+(currentStats.battery ? 1 : 0))*4)
    const height = 17
    
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
      console.log("Resized image:", resizedImage.getSize())
    }
  } catch (error) {
    console.error('Error updating tray icon:', error)
    tray.setTitle("")
  }
}

async function sendDetailedStatsToRenderer() {
  if (!win || !win.webContents) return

  try {
    const detailedStats = await stats.getDetailedStats();
    const timezones = config.getTimezones();

    // Add theme info to stats object
    detailedStats.theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
    detailedStats.timezones = timezones;

    win.webContents.send("detailed-stats-update", detailedStats);
  } catch (error) {
    console.error("Error sending detailed stats:", error);
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
  const bounds = tray.getBounds()
  const windowBounds = win.getBounds()

  // Position window near tray icon
  let x = bounds.x - windowBounds.width / 2 + bounds.width / 2
  let y = bounds.y + bounds.height + 4

  // Adjust for screen boundaries
  const { screen } = require("electron")
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })

  if (x + windowBounds.width > display.workArea.x + display.workArea.width) {
    x = display.workArea.x + display.workArea.width - windowBounds.width - 10
  }
  if (x < display.workArea.x) {
    x = display.workArea.x + 10
  }
  if (y + windowBounds.height > display.workArea.y + display.workArea.height) {
    y = bounds.y - windowBounds.height - 4
  }

  win.setPosition(Math.round(x), Math.round(y))
  win.show()
  win.focus()
  
  sendDetailedStatsToRenderer()
  statsInterval = setInterval(() => {sendDetailedStatsToRenderer()}, 1000)
}

app.whenReady().then(() => {
  // Hide from Dock (macOS only)
  if (process.platform === "darwin") {
    app.dock.hide()
  }

  // Load configuration from storage
  config.loadConfig()

  createWindow()
  createTrayIconWindow()

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
    // event.preventDefault();
    if (win.isVisible()) {
      win.hide()
    } else {
      showWindow()
    }
  })

  tray.on("right-click", (event, bounds) => {
    tray.setContextMenu(createContextMenu())
    console.log("Tray right-clicked", event, bounds)
    tray.popUpContextMenu()
  })

  nativeTheme.on("updated", () => {
    if (win && win.webContents) {
      win.webContents.send("theme-changed", nativeTheme.shouldUseDarkColors ? "dark" : "light")
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

ipcMain.on("hide-window", () => {
  win.hide()
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

app.on("window-all-closed", (e) => {
  e.preventDefault()
})

app.on("before-quit", () => {
  if (statsInterval) clearInterval(statsInterval)
  if (trayUpdateInterval) clearInterval(trayUpdateInterval)
})

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

