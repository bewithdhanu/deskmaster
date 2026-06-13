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
  showInDock: true,
  apiKeys: {
    chatgpt: '',
    ipLocation: ''
  },
  uptimeKuma: {
    enabled: true,
    url: '',
    username: '',
    password: ''
  },
  toolOrder: [],
  activeTools: {
    'bcrypt-generate': true,
    'bcrypt-verify': true,
    'public-ip': true,
    'ip-location': true,
    'pinggy': true,
    'text-reformat': true,
    'password-generator': true,
    'onetimesecret': true
  },
  notesUi: {
    mode: 'notes',
    selectedId: null,
    expandedIds: [],
    newPageType: 'canvas'
  },
  cloudBackup: {
    provider: 'gdrive',
    clientId: '',
    clientSecret: '',
    enabled: false,
    intervalHours: 4,
    keepLast: 10,
    lastBackupAt: null,
    lastBackupStatus: null,
    lastBackupError: null
  },
  agent: {
    enabled: true,
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    capabilities: {
      knowledgeBase: false,
      deskMasterTools: false,
      composioIntegrations: false
    },
    knowledgeBase: {
      includeNotes: true,
      includeCustomDocs: true,
      maxContextChunks: 8
    },
    composio: {
      apiKey: '',
      userId: 'deskmaster-local-user',
      customToolkits: [],
      enabledToolkits: []
    },
    providers: {
      openai: { enabled: false, apiKey: '', baseUrl: '', model: 'gpt-4o-mini' },
      anthropic: { enabled: false, apiKey: '', model: 'claude-sonnet-4-20250514' },
      openrouter: { enabled: false, apiKey: '', model: 'openai/gpt-4o-mini' },
      gemini: { enabled: false, apiKey: '', model: 'gemini-2.0-flash' },
      bedrock: { enabled: false, accessKeyId: '', secretAccessKey: '', region: 'us-east-1', model: 'anthropic.claude-3-haiku-20240307-v1:0' },
      local: { enabled: false, baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2', apiKey: 'ollama' }
    }
  }
};

// Configuration storage functions
function getDefaultAgentSettings() {
  return JSON.parse(JSON.stringify(appSettings.agent || {
    enabled: true,
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    capabilities: {
      knowledgeBase: false,
      deskMasterTools: false,
      composioIntegrations: false
    },
    knowledgeBase: {
      includeNotes: true,
      includeCustomDocs: true,
      maxContextChunks: 8
    },
    composio: {
      apiKey: '',
      userId: 'deskmaster-local-user',
      customToolkits: [],
      enabledToolkits: []
    },
    providers: {
      openai: { enabled: false, apiKey: '', baseUrl: '', model: 'gpt-4o-mini' },
      anthropic: { enabled: false, apiKey: '', model: 'claude-sonnet-4-20250514' },
      openrouter: { enabled: false, apiKey: '', model: 'openai/gpt-4o-mini' },
      gemini: { enabled: false, apiKey: '', model: 'gemini-2.0-flash' },
      bedrock: { enabled: false, accessKeyId: '', secretAccessKey: '', region: 'us-east-1', model: 'anthropic.claude-3-haiku-20240307-v1:0' },
      local: { enabled: false, baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2', apiKey: 'ollama' }
    }
  }))
}

function providerHasCredentials(providerId, p) {
  if (!p) return false
  switch (providerId) {
    case 'openai':
    case 'anthropic':
    case 'openrouter':
      return Boolean(p.apiKey)
    case 'gemini':
      return Boolean(p.apiKey)
    case 'bedrock':
      return Boolean(p.accessKeyId && p.secretAccessKey)
    case 'local':
      return Boolean(p.baseUrl)
    default:
      return false
  }
}

function migrateAgentSettings(settings) {
  const defaults = getDefaultAgentSettings()
  const agent = { ...defaults, ...(settings.agent || {}) }
  agent.capabilities = { ...defaults.capabilities, ...(settings.agent?.capabilities || {}) }
  agent.knowledgeBase = { ...defaults.knowledgeBase, ...(settings.agent?.knowledgeBase || {}) }
  agent.composio = { ...defaults.composio, ...(settings.agent?.composio || {}) }
  if (!agent.composio.customToolkits?.length && agent.composio.enabledToolkits?.length) {
    agent.composio.customToolkits = [...agent.composio.enabledToolkits]
  }
  if (!agent.composio.customToolkits) {
    agent.composio.customToolkits = []
  }
  agent.providers = {
    openai: { ...defaults.providers.openai, ...(settings.agent?.providers?.openai || {}) },
    anthropic: { ...defaults.providers.anthropic, ...(settings.agent?.providers?.anthropic || {}) },
    openrouter: { ...defaults.providers.openrouter, ...(settings.agent?.providers?.openrouter || {}) },
    gemini: { ...defaults.providers.gemini, ...(settings.agent?.providers?.gemini || {}) },
    bedrock: { ...defaults.providers.bedrock, ...(settings.agent?.providers?.bedrock || {}) },
    local: { ...defaults.providers.local, ...(settings.agent?.providers?.local || {}) }
  }

  for (const id of Object.keys(agent.providers)) {
    const p = agent.providers[id]
    if (p.enabled === undefined) {
      p.enabled = providerHasCredentials(id, p)
    }
  }

  if (settings.apiKeys?.chatgpt && !agent.providers.openai.apiKey) {
    agent.providers.openai.apiKey = settings.apiKeys.chatgpt
    if (!agent.providers.openai.enabled) agent.providers.openai.enabled = true
  }

  settings.agent = agent
  return settings
}

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
      appSettings = migrateAgentSettings({ ...appSettings, ...config.appSettings })
    } else {
      appSettings = migrateAgentSettings(appSettings)
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
    let config = {};

    if (fs.existsSync(storagePath)) {
      const data = fs.readFileSync(storagePath, 'utf8');
      config = JSON.parse(data);
    }

    config = {
      ...config,
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
  appSettings = migrateAgentSettings({ ...appSettings, ...newSettings });
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
