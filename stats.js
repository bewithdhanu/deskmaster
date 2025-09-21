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
  net: { kbs: 0, human: "0 B" },
  temperature: null,
  battery: null,
  uptime: 0
};

// Helper function to convert bytes to human readable format
function formatBytes(bytes, decimals = 0) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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

async function updateTrayStats() {
  try {
    // Only fetch stats needed for tray icon
    const [cpu, mem, fs, net, battery] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.battery(),
    ]);

    const cpuUsage = Math.round(cpu.currentLoad);
    const memUsage = Math.round((mem.active / mem.total) * 100);
    const diskUsage = fs[0] ? Math.round((fs[0].used / fs[0].size) * 100) : 0;
    const netSpeedKbs = net[0] ? Math.round((net[0].rx_sec + net[0].tx_sec) / 1024) : 0;
    const netSpeedHuman = formatBytes((net[0] ? (net[0].rx_sec + net[0].tx_sec) : 0));

    // Update current stats
    currentStats = {
      cpu: cpuUsage,
      ram: memUsage,
      disk: diskUsage,
      net: { kbs: netSpeedKbs, human: netSpeedHuman },
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

    const netSpeedKbs = net[0] ? Math.round((net[0].rx_sec + net[0].tx_sec) / 1024) : 0;
    const netSpeedHuman = formatBytes((net[0] ? (net[0].rx_sec + net[0].tx_sec) : 0));

    const stats = {
      // Basic stats
      cpu: Math.round(cpu.currentLoad),
      ram: Math.round((mem.active / mem.total) * 100),
      disk: fs[0] ? Math.round((fs[0].used / fs[0].size) * 100) : 0,
      net: { kbs: netSpeedKbs, human: netSpeedHuman },

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

      // Storage details (only first drive used)
      storageDetails: fs.slice(0, 1).map((drive) => ({
        total: Math.round(drive.size / 1024 / 1024 / 1024),
        used: Math.round(drive.used / 1024 / 1024 / 1024),
      })),

      // Network details (only first interface used)
      networkDetails: net.slice(0, 1).map((iface) => ({
        rx: Math.round(iface.rx_sec / 1024),
        tx: Math.round(iface.tx_sec / 1024),
      })),

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
  formatBytes
};
