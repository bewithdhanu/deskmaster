const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Database path
function getDbPath() {
  const userDataPath = app ? app.getPath('userData') : path.join(__dirname, 'data');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'stats_history.db');
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
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      
      // Create table if it doesn't exist
      db.run(`
        CREATE TABLE IF NOT EXISTS stats_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          cpu REAL NOT NULL,
          ram REAL NOT NULL,
          disk REAL NOT NULL,
          network_kbs REAL NOT NULL,
          battery_percent REAL,
          temperature REAL,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          reject(err);
          return;
        }
        
        // Create index on timestamp for faster queries
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_timestamp ON stats_history(timestamp)
        `, (err) => {
          if (err) {
            console.error('Error creating index:', err);
            reject(err);
            return;
          }
          
          // Clean up old data (older than 30 days)
          const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
          db.run('DELETE FROM stats_history WHERE timestamp < ?', [thirtyDaysAgo], (err) => {
            if (err) {
              console.error('Error cleaning old data:', err);
            }
            isInitialized = true;
            resolve();
          });
        });
      });
    });
  });
}

// Determine if we should store this data point based on time-based intervals
// Strategy: Check the age of the most recent data point and decide based on that
function shouldStoreDataPoint(lastStoredTimestamp) {
  if (!lastStoredTimestamp) return true;
  
  const now = Date.now();
  const timeSinceLastStore = now - lastStoredTimestamp;
  const ageOfLastStore = now - lastStoredTimestamp;
  
  // Determine interval based on age of the last stored point
  // This ensures we maintain the right sampling rate for each time range
  if (ageOfLastStore <= 60 * 60 * 1000) {
    // Last 1 hour: store every 5 seconds
    return timeSinceLastStore >= 5000;
  } else if (ageOfLastStore <= 4 * 60 * 60 * 1000) {
    // 1-4 hours: store every 1 minute
    return timeSinceLastStore >= 60 * 1000;
  } else if (ageOfLastStore <= 24 * 60 * 60 * 1000) {
    // 4 hours - 1 day: store every 5 minutes
    return timeSinceLastStore >= 5 * 60 * 1000;
  } else {
    // 1 day - 30 days: store every 15 minutes
    return timeSinceLastStore >= 15 * 60 * 1000;
  }
}

// Store stats data point
async function storeStats(stats) {
  if (!isInitialized || !db) {
    await initDatabase();
  }
  
  return new Promise((resolve, reject) => {
    // Get last stored timestamp
    db.get('SELECT MAX(timestamp) as lastTimestamp FROM stats_history', (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      const lastTimestamp = row?.lastTimestamp || null;
      
      // Check if we should store this data point
      const shouldStore = shouldStoreDataPoint(lastTimestamp);
      
      if (!shouldStore) {
        resolve(false); // Skipped
        return;
      }
      
      const timestamp = Date.now();
      db.run(
        `INSERT INTO stats_history (timestamp, cpu, ram, disk, network_kbs, battery_percent, temperature)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          timestamp,
          stats.cpu || 0,
          stats.ram || 0,
          stats.disk || 0,
          stats.net?.kbs || 0,
          stats.battery?.percent || null,
          stats.cpuDetails?.temperature || null
        ],
        (err) => {
          if (err) {
            console.error('Error storing stats:', err);
            reject(err);
            return;
          }
          resolve(true); // Stored
        }
      );
    });
  });
}

// Get history data for a time range
function getHistory(startTime, endTime) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      initDatabase().then(() => {
        fetchHistory(startTime, endTime, resolve, reject);
      }).catch(reject);
    } else {
      fetchHistory(startTime, endTime, resolve, reject);
    }
  });
}

function fetchHistory(startTime, endTime, resolve, reject) {
  db.all(
    `SELECT timestamp, cpu, ram, disk, network_kbs, battery_percent, temperature
     FROM stats_history
     WHERE timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp ASC`,
    [startTime, endTime],
    (err, rows) => {
      if (err) {
        console.error('Error fetching history:', err);
        reject(err);
        return;
      }
      
      const history = rows.map(row => ({
        timestamp: row.timestamp,
        time: new Date(row.timestamp).toISOString(),
        cpu: row.cpu,
        ram: row.ram,
        disk: row.disk,
        network: row.network_kbs,
        battery: row.battery_percent,
        temperature: row.temperature
      }));
      
      resolve(history);
    }
  );
}

// Get available time range (oldest and newest timestamps)
function getTimeRange() {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      initDatabase().then(() => {
        fetchTimeRange(resolve, reject);
      }).catch(reject);
    } else {
      fetchTimeRange(resolve, reject);
    }
  });
}

function fetchTimeRange(resolve, reject) {
  db.get(
    `SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest, COUNT(*) as count
     FROM stats_history`,
    (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      resolve({
        oldest: row?.oldest || null,
        newest: row?.newest || null,
        count: row?.count || 0
      });
    }
  );
}

function analyzeHistory(startTime, endTime, options = {}) {
  const cpuThreshold = typeof options.cpuThreshold === 'number' ? options.cpuThreshold : null;

  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      initDatabase().then(() => {
        runAnalyzeHistory(startTime, endTime, cpuThreshold, resolve, reject);
      }).catch(reject);
    } else {
      runAnalyzeHistory(startTime, endTime, cpuThreshold, resolve, reject);
    }
  });
}

function runAnalyzeHistory(startTime, endTime, cpuThreshold, resolve, reject) {
  let thresholdSql = '';
  const params = cpuThreshold !== null
    ? [cpuThreshold, startTime, endTime]
    : [startTime, endTime];

  if (cpuThreshold !== null) {
    thresholdSql = ', SUM(CASE WHEN cpu >= ? THEN 1 ELSE 0 END) as cpuAboveThreshold';
  }

  db.get(
    `SELECT
      COUNT(*) as sampleCount,
      AVG(cpu) as avgCpu,
      MIN(cpu) as minCpu,
      MAX(cpu) as maxCpu,
      AVG(ram) as avgRam,
      MIN(ram) as minRam,
      MAX(ram) as maxRam,
      AVG(disk) as avgDisk,
      MIN(disk) as minDisk,
      MAX(disk) as maxDisk,
      AVG(network_kbs) as avgNetwork,
      MIN(network_kbs) as minNetwork,
      MAX(network_kbs) as maxNetwork,
      AVG(battery_percent) as avgBattery,
      AVG(temperature) as avgTemperature,
      MAX(temperature) as maxTemperature
      ${thresholdSql}
     FROM stats_history
     WHERE timestamp >= ? AND timestamp <= ?`,
    params,
    (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      const sampleCount = row?.sampleCount || 0;
      const result = {
        sampleCount,
        range: {
          startTime,
          endTime,
          startISO: new Date(startTime).toISOString(),
          endISO: new Date(endTime).toISOString()
        },
        cpu: {
          avg: roundStat(row?.avgCpu),
          min: roundStat(row?.minCpu),
          max: roundStat(row?.maxCpu)
        },
        ram: {
          avg: roundStat(row?.avgRam),
          min: roundStat(row?.minRam),
          max: roundStat(row?.maxRam)
        },
        disk: {
          avg: roundStat(row?.avgDisk),
          min: roundStat(row?.minDisk),
          max: roundStat(row?.maxDisk)
        },
        networkKbs: {
          avg: roundStat(row?.avgNetwork),
          min: roundStat(row?.minNetwork),
          max: roundStat(row?.maxNetwork)
        },
        battery: {
          avg: roundStat(row?.avgBattery)
        },
        temperature: {
          avg: roundStat(row?.avgTemperature),
          max: roundStat(row?.maxTemperature)
        }
      };

      if (cpuThreshold !== null) {
        const count = row?.cpuAboveThreshold || 0;
        result.cpuAboveThreshold = {
          threshold: cpuThreshold,
          count,
          percentOfSamples: sampleCount > 0 ? roundStat((count / sampleCount) * 100) : 0
        };
      }

      resolve(result);
    }
  );
}

function roundStat(value) {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 100) / 100;
}

// Clean up old data (older than 30 days)
function cleanupOldData() {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      resolve();
      return;
    }
    
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    db.run('DELETE FROM stats_history WHERE timestamp < ?', [thirtyDaysAgo], (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

// Clear all history data
function clearAllHistory() {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      // Initialize if needed
      initDatabase().then(() => {
        db.run('DELETE FROM stats_history', (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      }).catch(reject);
      return;
    }
    
    db.run('DELETE FROM stats_history', (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

// Import history entries directly (bypasses time-based filtering)
function importHistoryEntries(entries) {
  return new Promise((resolve, reject) => {
    if (!isInitialized || !db) {
      initDatabase().then(() => {
        importEntries(entries, resolve, reject);
      }).catch(reject);
      return;
    }
    importEntries(entries, resolve, reject);
  });
}

function importEntries(entries, resolve, reject) {
  if (!entries || entries.length === 0) {
    resolve();
    return;
  }

  // Use a transaction for better performance
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (beginErr) => {
      if (beginErr) {
        reject(beginErr);
        return;
      }
      
      const stmt = db.prepare(`
        INSERT INTO stats_history (timestamp, cpu, ram, disk, network_kbs, battery_percent, temperature)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      let completed = 0;
      let hasError = false;
      
      const checkComplete = () => {
        if (completed === entries.length && !hasError) {
          stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
              db.run('ROLLBACK');
              reject(finalizeErr);
              return;
            }
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                reject(commitErr);
                return;
              }
              resolve();
            });
          });
        }
      };
      
      entries.forEach((entry) => {
        stmt.run([
          entry.timestamp || Date.now(),
          entry.cpu || 0,
          entry.ram || 0,
          entry.disk || 0,
          entry.network || entry.network_kbs || 0,
          entry.battery !== undefined && entry.battery !== null ? entry.battery : null,
          entry.temperature !== undefined && entry.temperature !== null ? entry.temperature : null
        ], (err) => {
          if (err && !hasError) {
            hasError = true;
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          if (!hasError) {
            completed++;
            checkComplete();
          }
        });
      });
    });
  });
}

// Close database connection
function closeDatabase() {
  return new Promise((resolve) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
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

module.exports = {
  initDatabase,
  storeStats,
  getHistory,
  getTimeRange,
  analyzeHistory,
  cleanupOldData,
  clearAllHistory,
  importHistoryEntries,
  closeDatabase
};

