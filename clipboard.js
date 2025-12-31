const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app, clipboard, BrowserWindow, systemPreferences } = require('electron');
let activeWin = null;
try {
  activeWin = require('active-win');
} catch (error) {
  console.warn('active-win package not available:', error.message);
}

// Check if accessibility permission is granted (macOS)
function hasAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return true; // Not needed on other platforms
  }
  try {
    return systemPreferences.isTrustedAccessibilityClient(false);
  } catch (error) {
    console.warn('Error checking accessibility permission:', error);
    return false;
  }
}

// Database path
function getDbPath() {
  const userDataPath = app ? app.getPath('userData') : path.join(__dirname, 'data');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'clipboard_history.db');
}

let db = null;
let isInitialized = false;
let clipboardMonitor = null;
let lastClipboardText = '';
let lastClipboardTimestamp = 0;
let lastStoredText = ''; // Track what we last stored to prevent duplicates

// Get active window/app name (platform-specific)
async function getActiveWindowInfo() {
  try {
    // First check if our Electron window is focused
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      return focusedWindow.getTitle() || 'DeskMaster';
    }
    
    // Try to get active window from system using active-win package
    // Only attempt if accessibility permission is granted (macOS)
    if (activeWin && hasAccessibilityPermission()) {
      try {
        const windowInfo = await activeWin();
        if (windowInfo) {
          // Return app name (e.g., "Chrome", "VS Code") or window title
          return windowInfo.owner?.name || windowInfo.title || 'System';
        }
      } catch (error) {
        // active-win might fail due to permissions or other issues
        // Don't log this as a warning if permission is not granted
        if (hasAccessibilityPermission()) {
          console.warn('Error getting active window with active-win:', error.message);
        }
      }
    }
    
    // Fallback to generic name
    return 'System';
  } catch (error) {
    console.error('Error getting active window info:', error);
    return 'System';
  }
}

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    if (isInitialized && db) {
      resolve();
      return;
    }

    const dbPath = getDbPath();
    
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening clipboard database:', err);
        reject(err);
        return;
      }
      
      // Create table if it doesn't exist
      db.run(`
        CREATE TABLE IF NOT EXISTS clipboard_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err) {
          console.error('Error creating clipboard table:', err);
          reject(err);
          return;
        }
        
        // Create indexes for faster queries
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_timestamp ON clipboard_history(timestamp)
        `, (err) => {
          if (err) {
            console.error('Error creating timestamp index:', err);
          }
        });
        
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_source ON clipboard_history(source)
        `, (err) => {
          if (err) {
            console.error('Error creating source index:', err);
          }
          isInitialized = true;
          resolve();
        });
      });
    });
  });
}

// Store clipboard entry
function storeClipboardEntry(content, source) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const timestamp = Date.now();
    
    // Insert new entry
    db.run(
      'INSERT INTO clipboard_history (timestamp, content, source) VALUES (?, ?, ?)',
      [timestamp, content, source],
      function(err) {
        if (err) {
          console.error('Error storing clipboard entry:', err);
          reject(err);
          return;
        }
        
        // Check if we have more than 333 entries (reduced from 1000 to decrease data)
        db.get('SELECT COUNT(*) as count FROM clipboard_history', (err, row) => {
          if (err) {
            console.error('Error counting clipboard entries:', err);
            resolve();
            return;
          }
          
          if (row && row.count > 333) {
            // Delete oldest entries, keeping only the last 333 (reduced from 1000 to decrease data)
            const deleteCount = row.count - 333;
            db.run(
              'DELETE FROM clipboard_history WHERE id IN (SELECT id FROM clipboard_history ORDER BY timestamp ASC LIMIT ?)',
              [deleteCount],
              (err) => {
                if (err) {
                  console.error('Error cleaning old clipboard entries:', err);
                }
                resolve();
              }
            );
          } else {
            resolve();
          }
        });
      }
    );
  });
}

// Get clipboard history
function getClipboardHistory(limit = 100) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all(
      'SELECT id, timestamp, content, source FROM clipboard_history ORDER BY timestamp DESC LIMIT ?',
      [limit],
      (err, rows) => {
        if (err) {
          console.error('Error getting clipboard history:', err);
          reject(err);
          return;
        }
        resolve(rows || []);
      }
    );
  });
}

// Search clipboard history
function searchClipboardHistory(query, limit = 100) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all(
      'SELECT id, timestamp, content, source FROM clipboard_history WHERE content LIKE ? OR source LIKE ? ORDER BY timestamp DESC LIMIT ?',
      [`%${query}%`, `%${query}%`, limit],
      (err, rows) => {
        if (err) {
          console.error('Error searching clipboard history:', err);
          reject(err);
          return;
        }
        resolve(rows || []);
      }
    );
  });
}

// Monitor clipboard changes
function startClipboardMonitoring() {
  if (clipboardMonitor) {
    return; // Already monitoring
  }

  // Initialize last clipboard state
  try {
    lastClipboardText = clipboard.readText() || '';
    lastClipboardTimestamp = Date.now();
  } catch (error) {
    console.error('Error reading initial clipboard:', error);
  }

  // Monitor clipboard every 3 seconds (reduced frequency to decrease data collection)
  clipboardMonitor = setInterval(() => {
    try {
      const currentText = clipboard.readText() || '';
      const currentTime = Date.now();
      
      // Only store if:
      // 1. Content is not empty
      // 2. Content changed from what we're currently tracking
      // 3. Content is different from what we last stored (prevent duplicates)
      // 4. Debounce: ignore if changed within last 100ms (rapid changes)
      if (currentText && 
          currentText !== lastClipboardText && 
          currentText !== lastStoredText &&
          currentTime - lastClipboardTimestamp > 100) {
        // Get active window info asynchronously and store
        (async () => {
          try {
            const source = await getActiveWindowInfo();
            await storeClipboardEntry(currentText, source);
            console.log(`📋 Clipboard tracked: ${currentText.substring(0, 50)}... from ${source}`);
            lastStoredText = currentText; // Update what we last stored
            
            // Notify callback if registered (for WebSocket broadcasting)
            if (typeof onClipboardChange === 'function') {
              onClipboardChange();
            }
          } catch (error) {
            console.error('Error storing clipboard entry:', error);
          }
        })();
        
        lastClipboardText = currentText;
        lastClipboardTimestamp = currentTime;
      } else if (currentText === lastClipboardText) {
        // Update timestamp even if content hasn't changed (for debouncing)
        lastClipboardTimestamp = currentTime;
      }
    } catch (error) {
      console.error('Error monitoring clipboard:', error);
    }
  }, 3000); // Check every 3 seconds (reduced from 1 second to decrease data collection)
}

// Stop clipboard monitoring
function stopClipboardMonitoring() {
  if (clipboardMonitor) {
    clearInterval(clipboardMonitor);
    clipboardMonitor = null;
  }
}

// Delete a clipboard entry
function deleteClipboardEntry(id) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.run(
      'DELETE FROM clipboard_history WHERE id = ?',
      [id],
      function(err) {
        if (err) {
          console.error('Error deleting clipboard entry:', err);
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
}

// Clear all clipboard history
function clearClipboardHistory() {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.run('DELETE FROM clipboard_history', (err) => {
      if (err) {
        console.error('Error clearing clipboard history:', err);
        reject(err);
        return;
      }
      resolve();
    });
  });
}

// Close database connection
function closeDatabase() {
  return new Promise((resolve) => {
    stopClipboardMonitoring();
    
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing clipboard database:', err);
        }
        db = null;
        isInitialized = false;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Initialize on module load (for Electron)
if (typeof app !== 'undefined' && app) {
  app.on('will-quit', () => {
    closeDatabase();
  });
}

// Set callback for clipboard change notifications
function setClipboardChangeCallback(callback) {
  onClipboardChange = callback;
}

module.exports = {
  initDatabase,
  startClipboardMonitoring,
  stopClipboardMonitoring,
  storeClipboardEntry,
  getClipboardHistory,
  searchClipboardHistory,
  deleteClipboardEntry,
  clearClipboardHistory,
  closeDatabase,
  setClipboardChangeCallback
};

