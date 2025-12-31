const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let timezones = [];
let appSettings = {
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

// Configuration storage functions
function getConfigStoragePath() {
  return path.join(app.getPath('userData'), '.config.json');
}

function loadConfig() {
  try {
    const storagePath = getConfigStoragePath();
    let config = {};
    
    if (fs.existsSync(storagePath)) {
      const data = fs.readFileSync(storagePath, 'utf8');
      config = JSON.parse(data);
    }
    
    // Load app settings from config first
    if (config.appSettings) {
      appSettings = { ...appSettings, ...config.appSettings };
    }
    
    // Load timezones - prioritize appSettings.timezones if it exists, otherwise use config.timezones
    if (appSettings.timezones && appSettings.timezones.length > 0) {
      timezones = appSettings.timezones;
    } else if (config.timezones && config.timezones.length > 0) {
      timezones = config.timezones;
    } else {
      timezones = [];
    }
    
    // Keep timezones in sync
    appSettings.timezones = timezones;
    
    // Save default config if it didn't exist
    if (!fs.existsSync(storagePath)) {
      saveConfig();
    }
  } catch (error) {
    console.error('Error loading config:', error);
    timezones = [];
  }
}

function saveConfig() {
  try {
    const storagePath = getConfigStoragePath();
    const config = {
      timezones: timezones,
      appSettings: appSettings
    };
    fs.writeFileSync(storagePath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Helper functions for working with config sections
function getConfigSection(section) {
  try {
    const storagePath = getConfigStoragePath();
    if (fs.existsSync(storagePath)) {
      const data = fs.readFileSync(storagePath, 'utf8');
      const config = JSON.parse(data);
      return config[section] || null;
    }
  } catch (error) {
    console.error(`Error loading config section ${section}:`, error);
  }
  return null;
}

function setConfigSection(section, data) {
  try {
    const storagePath = getConfigStoragePath();
    let config = {};
    
    if (fs.existsSync(storagePath)) {
      const fileData = fs.readFileSync(storagePath, 'utf8');
      config = JSON.parse(fileData);
    }
    
    config[section] = data;
    fs.writeFileSync(storagePath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving config section ${section}:`, error);
    return false;
  }
}

// Timezone management functions
function getTimezones() {
  return timezones;
}

function setTimezones(newTimezones) {
  timezones = newTimezones;
  saveConfig();
}

function addTimezone(timezone) {
  timezones.push(timezone);
  saveConfig();
}

function removeTimezone(id) {
  timezones = timezones.filter(tz => tz.id !== id);
  saveConfig();
}

// App settings management functions
function getAppSettings() {
  return appSettings;
}

function setAppSettings(newSettings) {
  appSettings = { ...appSettings, ...newSettings };
  // Update timezones variable if timezones are provided in newSettings
  if (newSettings.timezones !== undefined) {
    timezones = newSettings.timezones;
  }
  // Keep timezones in sync
  appSettings.timezones = timezones;
  saveConfig();
}

function updateAppSetting(key, value) {
  appSettings[key] = value;
  saveConfig();
}

module.exports = {
  // Config functions
  getConfigStoragePath,
  loadConfig,
  saveConfig,
  getConfigSection,
  setConfigSection,
  
  // Timezone functions
  getTimezones,
  setTimezones,
  addTimezone,
  removeTimezone,
  
  // App settings functions
  getAppSettings,
  setAppSettings,
  updateAppSetting
};
