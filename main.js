const { app, BrowserWindow, Tray, nativeImage, ipcMain, Menu, nativeTheme } = require("electron")
const path = require("path")
const config = require("./config")
const stats = require("./stats")

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
let statsInterval = null
let trayUpdateInterval = null


function createTrayIconWindow() {
  trayIconWindow = new BrowserWindow({
    width: 200,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
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

  let blurHandlerActive = false;
  
  win.on("blur", () => {
    if (!blurHandlerActive) return;
    setTimeout(() => {
      if (!win.isFocused()) {
        win.hide()
      }
    }, 100)
  })

  win.on("hide", () => {
    blurHandlerActive = false;
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

    const width = 105 + (timezones.length * 70) + (currentStats.battery ? 25 : 0) + ((4+timezones.length+(currentStats.battery ? 1 : 0))*4)
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

function createContextMenu() {
  return Menu.buildFromTemplate([
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
    { type: "separator" },
    {
      label: "About",
      click: () => {
        // Could show about dialog
      },
    },
    {
      label: "Quit",
      click: () => {
        app.quit()
      },
    },
  ])
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
  
  // Enable blur handler after a short delay to prevent immediate hiding
  setTimeout(() => {
    blurHandlerActive = true;
  }, 500);
  
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

  // Create tray with empty image initially
  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip("System Monitor - Loading...")
  tray.setContextMenu(createContextMenu())
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

