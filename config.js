const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let timezones = [];

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
    
    // Load timezones from config
    timezones = config.timezones || [
      { id: '1', label: 'Local', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      { id: '2', label: 'UTC', timezone: 'UTC' }
    ];
    
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
      // Add other configuration sections here as needed
      // theme: currentTheme,
      // settings: otherSettings,
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
  removeTimezone
};
