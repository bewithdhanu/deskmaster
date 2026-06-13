const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app, clipboard } = require('electron');

// Retention: keep clipboard history for the last 1 month (time-based, not record count)
const CLIPBOARD_RETENTION_DAYS = 30;
const MAX_CLIPBOARD_CONTENT_LENGTH = 50000;
const SKIP_CAPTURE_MS = 8000;

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
let skipClipboardCaptureUntil = 0;
let skipClipboardCaptureText = '';

function skipClipboardCapture(text, durationMs = SKIP_CAPTURE_MS) {
  const value = String(text ?? '');
  skipClipboardCaptureUntil = Date.now() + durationMs;
  skipClipboardCaptureText = value;
  lastClipboardText = value;
}

function shouldSkipClipboardCapture(text) {
  if (Date.now() >= skipClipboardCaptureUntil) return false;
  if (!skipClipboardCaptureText) return true;
  return String(text ?? '') === skipClipboardCaptureText;
}

function isClipboardContentAllowed(content) {
  const value = String(content ?? '');
  return value.length > 0 && value.length <= MAX_CLIPBOARD_CONTENT_LENGTH;
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

// Store clipboard entry (dedupe by content: remove older rows, insert fresh timestamp)
function storeClipboardEntry(content, source = '') {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const normalizedContent = String(content ?? '');
    if (!isClipboardContentAllowed(normalizedContent)) {
      resolve();
      return;
    }

    const timestamp = Date.now();

    db.run('DELETE FROM clipboard_history WHERE content = ?', [normalizedContent], (deleteErr) => {
      if (deleteErr) {
        console.error('Error deduplicating clipboard entry:', deleteErr);
        reject(deleteErr);
        return;
      }

      db.run(
        'INSERT INTO clipboard_history (timestamp, content, source) VALUES (?, ?, ?)',
        [timestamp, normalizedContent, String(source ?? '')],
        function (insertErr) {
          if (insertErr) {
            console.error('Error storing clipboard entry:', insertErr);
            reject(insertErr);
            return;
          }

          const retentionMs = CLIPBOARD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
          const cutoff = timestamp - retentionMs;
          db.run(
            'DELETE FROM clipboard_history WHERE timestamp < ?',
            [cutoff],
            (cleanupErr) => {
              if (cleanupErr) {
                console.error('Error cleaning old clipboard entries:', cleanupErr);
              }
              resolve();
            }
          );
        }
      );
    });
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
      'SELECT id, timestamp, content, source FROM clipboard_history WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?',
      [`%${query}%`, limit],
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
      
      // Only store if content changed, within size limit, and not an in-app copy we should ignore.
      if (currentText &&
          currentText !== lastClipboardText &&
          currentTime - lastClipboardTimestamp > 100 &&
          isClipboardContentAllowed(currentText) &&
          !shouldSkipClipboardCapture(currentText)) {
        (async () => {
          try {
            await storeClipboardEntry(currentText, '');
            console.log(`📋 Clipboard tracked: ${currentText.substring(0, 50)}...`);

            if (typeof onClipboardChange === 'function') {
              onClipboardChange();
            }
          } catch (error) {
            console.error('Error storing clipboard entry:', error);
          }
        })();

        lastClipboardText = currentText;
        lastClipboardTimestamp = currentTime;
      } else if (currentText === lastClipboardText || shouldSkipClipboardCapture(currentText)) {
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
  skipClipboardCapture,
  getClipboardHistory,
  searchClipboardHistory,
  deleteClipboardEntry,
  clearClipboardHistory,
  closeDatabase,
  setClipboardChangeCallback
};

