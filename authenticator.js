const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { authenticator: totp } = require('otplib');

// Database path
function getDbPath() {
  let userDataPath;
  if (app) {
    userDataPath = app.getPath('userData');
  } else if (process.env.ELECTRON_USER_DATA) {
    // Allow override for scripts (like import script)
    userDataPath = process.env.ELECTRON_USER_DATA;
  } else {
    userDataPath = path.join(__dirname, 'data');
  }
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'authenticator.db');
}

let db = null;
let isInitialized = false;

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
        console.error('Error opening authenticator database:', err);
        reject(err);
        return;
      }
      
      // Create authenticators table
      db.run(`
        CREATE TABLE IF NOT EXISTS authenticators (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          secret TEXT NOT NULL,
          url TEXT,
          username TEXT,
          password TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err) {
          console.error('Error creating authenticators table:', err);
          reject(err);
          return;
        }
        
        // Create trash table for deleted items (30-day retention)
        db.run(`
          CREATE TABLE IF NOT EXISTS authenticator_trash (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            secret TEXT NOT NULL,
            url TEXT,
            username TEXT,
            password TEXT,
            deleted_at INTEGER DEFAULT (strftime('%s', 'now')),
            original_id INTEGER
          )
        `, (err) => {
          if (err) {
            console.error('Error creating authenticator_trash table:', err);
            reject(err);
            return;
          }
          
          // Create indexes
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_deleted_at ON authenticator_trash(deleted_at)
          `, (err) => {
            if (err) {
              console.error('Error creating deleted_at index:', err);
            }
            
            // Clean up old trash entries (older than 30 days)
            const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
            db.run('DELETE FROM authenticator_trash WHERE deleted_at < ?', [thirtyDaysAgo], (err) => {
              if (err) {
                console.error('Error cleaning old trash entries:', err);
              }
              isInitialized = true;
              resolve();
            });
          });
        });
      });
    });
  });
}

// Get all authenticators
function getAllAuthenticators() {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all('SELECT * FROM authenticators ORDER BY name ASC', [], (err, rows) => {
      if (err) {
        console.error('Error fetching authenticators:', err);
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

// Get authenticator by ID
function getAuthenticatorById(id) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.get('SELECT * FROM authenticators WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('Error fetching authenticator:', err);
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

// Create new authenticator
function createAuthenticator(data) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const { name, secret, url, username, password } = data;
    
    if (!name || !secret) {
      reject(new Error('Name and secret are required'));
      return;
    }

    db.run(
      'INSERT INTO authenticators (name, secret, url, username, password) VALUES (?, ?, ?, ?, ?)',
      [name, secret, url || null, username || null, password || null],
      function(err) {
        if (err) {
          console.error('Error creating authenticator:', err);
          reject(err);
          return;
        }
        resolve({ id: this.lastID, ...data });
      }
    );
  });
}

// Update authenticator
function updateAuthenticator(id, data) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const { name, secret, url, username, password } = data;
    
    if (!name || !secret) {
      reject(new Error('Name and secret are required'));
      return;
    }

    db.run(
      'UPDATE authenticators SET name = ?, secret = ?, url = ?, username = ?, password = ?, updated_at = ? WHERE id = ?',
      [name, secret, url || null, username || null, password || null, Math.floor(Date.now() / 1000), id],
      function(err) {
        if (err) {
          console.error('Error updating authenticator:', err);
          reject(err);
          return;
        }
        if (this.changes === 0) {
          reject(new Error('Authenticator not found'));
          return;
        }
        resolve({ id, ...data });
      }
    );
  });
}

// Delete authenticator (move to trash)
function deleteAuthenticator(id) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    // First get the authenticator
    db.get('SELECT * FROM authenticators WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('Error fetching authenticator for deletion:', err);
        reject(err);
        return;
      }

      if (!row) {
        reject(new Error('Authenticator not found'));
        return;
      }

      // Move to trash
      db.run(
        'INSERT INTO authenticator_trash (name, secret, url, username, password, original_id) VALUES (?, ?, ?, ?, ?, ?)',
        [row.name, row.secret, row.url, row.username, row.password, row.id],
        (err) => {
          if (err) {
            console.error('Error moving to trash:', err);
            reject(err);
            return;
          }

          // Delete from main table
          db.run('DELETE FROM authenticators WHERE id = ?', [id], (err) => {
            if (err) {
              console.error('Error deleting authenticator:', err);
              reject(err);
              return;
            }
            resolve(true);
          });
        }
      );
    });
  });
}

// Get TOTP code for an authenticator
function getTOTPCode(secret) {
  try {
    return totp.generate(secret);
  } catch (error) {
    console.error('Error generating TOTP code:', error);
    return null;
  }
}

function getAllTOTPCodes(secrets) {
  try {
    const codes = {};
    secrets.forEach(secret => {
      try {
        codes[secret] = totp.generate(secret);
      } catch (error) {
        console.error(`Error generating TOTP code for secret:`, error);
        codes[secret] = null;
      }
    });
    return codes;
  } catch (error) {
    console.error('Error generating TOTP codes:', error);
    return {};
  }
}

// Get time remaining until next code (in seconds)
function getTimeRemaining() {
  const period = 30; // TOTP period is 30 seconds
  const now = Math.floor(Date.now() / 1000);
  return period - (now % period);
}

// Get trash entries
function getTrashEntries() {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all('SELECT * FROM authenticator_trash ORDER BY deleted_at DESC', [], (err, rows) => {
      if (err) {
        console.error('Error fetching trash entries:', err);
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

// Restore from trash
function restoreFromTrash(trashId) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    // Get trash entry
    db.get('SELECT * FROM authenticator_trash WHERE id = ?', [trashId], (err, row) => {
      if (err) {
        console.error('Error fetching trash entry:', err);
        reject(err);
        return;
      }

      if (!row) {
        reject(new Error('Trash entry not found'));
        return;
      }

      // Restore to main table
      db.run(
        'INSERT INTO authenticators (name, secret, url, username, password) VALUES (?, ?, ?, ?, ?)',
        [row.name, row.secret, row.url, row.username, row.password],
        function(err) {
          if (err) {
            console.error('Error restoring authenticator:', err);
            reject(err);
            return;
          }

          // Delete from trash
          db.run('DELETE FROM authenticator_trash WHERE id = ?', [trashId], (err) => {
            if (err) {
              console.error('Error removing from trash:', err);
              reject(err);
              return;
            }
            resolve({ id: this.lastID, name: row.name, secret: row.secret, url: row.url, username: row.username, password: row.password });
          });
        }
      );
    });
  });
}

// Permanently delete from trash
function permanentlyDeleteFromTrash(trashId) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.run('DELETE FROM authenticator_trash WHERE id = ?', [trashId], function(err) {
      if (err) {
        console.error('Error permanently deleting from trash:', err);
        reject(err);
        return;
      }
      resolve(true);
    });
  });
}

// Clean up old trash entries (called periodically)
function cleanupTrash() {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    db.run('DELETE FROM authenticator_trash WHERE deleted_at < ?', [thirtyDaysAgo], function(err) {
      if (err) {
        console.error('Error cleaning up trash:', err);
        reject(err);
        return;
      }
      console.log(`Cleaned up ${this.changes} old trash entries`);
      resolve(this.changes);
    });
  });
}

// Close database
function closeDatabase() {
  return new Promise((resolve) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing authenticator database:', err);
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

module.exports = {
  initDatabase,
  getAllAuthenticators,
  getAuthenticatorById,
  createAuthenticator,
  updateAuthenticator,
  deleteAuthenticator,
  getTOTPCode,
  getAllTOTPCodes,
  getTimeRemaining,
  getTrashEntries,
  restoreFromTrash,
  permanentlyDeleteFromTrash,
  cleanupTrash,
  closeDatabase
};

