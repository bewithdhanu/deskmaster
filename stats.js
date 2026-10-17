const si = require('systeminformation');
const os = require('os');

// Performance data storage
const performanceData = {
  cpu: [],
  ram: [],
  network: [],
  timestamps: [],
};

// Current stats storage
let currentStats = {
  cpu: 0,
  ram: 0,
  disk: 0,
  net: { kbs: 0, human: "0 B", up: "0 B", down: "0 B" },
  temperature: null,
  battery: null,
  uptime: 0
};

// Helper function to convert bytes to human readable format
function formatBytes(bytes, decimals = 0) {
  // systeminformation reports null rx_sec/tx_sec on the first sample
  if (!Number.isFinite(bytes) || bytes < 1) return '0 B';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const percent = (part, total) => (total > 0 ? Math.min(100, Math.max(0, Math.round((part / total) * 100))) : 0);

// Main data drive - /System/Volumes/Data holds user data on APFS; fall back to the root volume.
function mainDrive(fs = []) {
  return fs.find(drive => drive.mount === '/System/Volumes/Data') || fs.find(drive => drive.mount === '/') || fs[0];
}

// Default-interface throughput. rx_sec/tx_sec are null on the first sample.
function netRates(net = []) {
  const rx = Number.isFinite(net[0]?.rx_sec) ? net[0].rx_sec : 0;
  const tx = Number.isFinite(net[0]?.tx_sec) ? net[0].tx_sec : 0;
  return {
    rx,
    tx,
    summary: { kbs: Math.round((rx + tx) / 1024), human: formatBytes(rx + tx), up: formatBytes(tx), down: formatBytes(rx) }
  };
}

function updatePerformanceData(cpu, ram, network) {
  const now = new Date();
  performanceData.timestamps.push(now.toLocaleTimeString());
  performanceData.cpu.push(cpu);
  performanceData.ram.push(ram);
  performanceData.network.push(network);

  // Keep only last 20 data points
  if (performanceData.timestamps.length > 20) {
    performanceData.timestamps.shift();
    performanceData.cpu.shift();
    performanceData.ram.shift();
    performanceData.network.shift();
  }
}

// Disk usage and battery shell out to system tools and change slowly, so the tray
// (polled every 2s) reuses them for a while. CPU, RAM and network stay live.
const TRAY_DISK_TTL_MS = 60 * 1000;
const TRAY_BATTERY_TTL_MS = 30 * 1000;
let trayDiskCache = { at: 0, value: null };
let trayBatteryCache = { at: 0, value: null };

async function cached(cache, ttlMs, fetch) {
  if (!cache.value || Date.now() - cache.at > ttlMs) {
    cache.value = await fetch();
    cache.at = Date.now();
  }
  return cache.value;
}

async function updateTrayStats() {
  try {
    // Only fetch stats needed for tray icon
    const [cpu, mem, fs, net, battery] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      cached(trayDiskCache, TRAY_DISK_TTL_MS, () => si.fsSize()),
      si.networkStats(),
      cached(trayBatteryCache, TRAY_BATTERY_TTL_MS, () => si.battery()),
    ]);

    const drive = mainDrive(fs);

    currentStats = {
      cpu: percent(cpu.currentLoad, 100),
      ram: percent(mem.active, mem.total),
      disk: drive ? percent(drive.used, drive.size) : 0,
      net: netRates(net).summary,
      temperature: null, // Not used in tray
      battery: battery.hasBattery ? {
        percent: Math.round(battery.percent),
        charging: battery.isCharging
      } : null,
      uptime: os.uptime()
    };

    return currentStats;
  } catch (error) {
    console.error("Error updating tray stats:", error);
    throw error;
  }
}

async function getDetailedStats() {
  try {
    // Only fetch stats actually used in the main window
    const [cpu, mem, fs, net, battery, temp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.battery(),
      si.cpuTemperature(),
    ]);

    const drive = mainDrive(fs);
    const rates = netRates(net);

    const stats = {
      // Basic stats
      cpu: percent(cpu.currentLoad, 100),
      ram: percent(mem.active, mem.total),
      disk: drive ? percent(drive.used, drive.size) : 0,
      net: rates.summary,

      // Detailed memory (only used fields)
      memoryDetails: {
        total: Math.round((mem.total / 1024 / 1024 / 1024) * 10) / 10,
        used: Math.round((mem.active / 1024 / 1024 / 1024) * 10) / 10,
      },

      // CPU details (only used fields)
      cpuDetails: {
        cores: cpu.cpus ? cpu.cpus.length : os.cpus().length,
        speed: Math.round(((os.cpus()[0]?.speed || 0) / 1000) * 10) / 10,
        temperature: temp.main ? Math.round(temp.main) : null,
      },

      // Storage details (main drive with better precision)
      storageDetails: drive ? [{
        total: Math.round((drive.size / 1024 / 1024 / 1024) * 10) / 10,
        used: Math.round((drive.used / 1024 / 1024 / 1024) * 10) / 10,
      }] : [{ total: 0, used: 0 }],

      // Network details (only first interface used)
      networkDetails: net.length ? [{ rx: Math.round(rates.rx / 1024), tx: Math.round(rates.tx / 1024) }] : [],

      // Battery (only used fields)
      battery: battery.hasBattery
        ? {
            percent: Math.round(battery.percent),
            charging: battery.isCharging,
          }
        : null,
    };

    // Update performance data
    updatePerformanceData(stats.cpu, stats.ram, stats.net.kbs);

    // Add performance data to stats object
    stats.performanceData = performanceData;

    // Store in history database (async, don't wait)
    if (typeof require !== 'undefined') {
      try {
        const history = require('./history');
        history.storeStats(stats).catch(err => {
          // Silently fail - history storage shouldn't block stats
          console.warn('Failed to store stats history:', err.message);
        });
      } catch (err) {
        // history module might not be available in all contexts
      }
    }

    return stats;
  } catch (error) {
    console.error("Error getting detailed stats:", error);
    throw error;
  }
}

function getCurrentStats() {
  return currentStats;
}

function getPerformanceData() {
  return performanceData;
}

module.exports = {
  updateTrayStats,
  getDetailedStats,
  getCurrentStats,
  getPerformanceData,
  formatBytes,
  percent,
  netRates
};
