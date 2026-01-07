// Utility to safely access Electron APIs with browser fallbacks

const WS_PORT = 65531;
const HTTP_PORT = 65532;
const API_BASE = `http://localhost:${HTTP_PORT}/api`;

// Security: API token (will be injected by Electron main process via IPC)
let API_SECRET_TOKEN = null;

// Get API token from Electron main process (only available in Electron context)
const getApiToken = async () => {
  if (API_SECRET_TOKEN) return API_SECRET_TOKEN;
  
  // First check if token was injected into window (browser mode)
  if (typeof window !== 'undefined' && window.DESKMASTER_API_TOKEN) {
    API_SECRET_TOKEN = window.DESKMASTER_API_TOKEN;
    localStorage.setItem('deskmaster_api_token', API_SECRET_TOKEN);
    return API_SECRET_TOKEN;
  }
  
  // Try to get token from Electron IPC if available
  if (typeof window !== 'undefined' && window.require) {
    try {
      const { ipcRenderer } = window.require('electron');
      API_SECRET_TOKEN = await ipcRenderer.invoke('get-api-token');
      if (API_SECRET_TOKEN) {
        // Store in localStorage for browser mode fallback
        localStorage.setItem('deskmaster_api_token', API_SECRET_TOKEN);
      }
      return API_SECRET_TOKEN;
    } catch (error) {
      // Fallback: try to get from localStorage (set by Electron app or injected script)
      API_SECRET_TOKEN = localStorage.getItem('deskmaster_api_token');
      return API_SECRET_TOKEN;
    }
  }
  
  // Fallback: try localStorage
  API_SECRET_TOKEN = localStorage.getItem('deskmaster_api_token');
  return API_SECRET_TOKEN;
};

// Helper function to add API token to fetch headers
const addApiTokenToHeaders = async (headers = {}) => {
  const token = await getApiToken();
  if (token) {
    headers['X-Api-Token'] = token;
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// Singleton instance for browser IPC renderer
let browserIpcRendererInstance = null;

// Check if we're running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && 
         typeof window.require === 'function' && 
         typeof window.process !== 'undefined' && 
         window.process.type === 'renderer';
};

// Get ipcRenderer safely
export const getIpcRenderer = () => {
  if (isElectron()) {
    try {
      return window.require('electron').ipcRenderer;
    } catch (error) {
      console.warn('Failed to get ipcRenderer:', error);
      return getBrowserIpcRenderer();
    }
  }
  return getBrowserIpcRenderer();
};

// Get or create browser IPC renderer (singleton)
const getBrowserIpcRenderer = () => {
  if (!browserIpcRendererInstance) {
    browserIpcRendererInstance = createBrowserIpcRenderer();
  }
  return browserIpcRendererInstance;
};

// Global WebSocket instance (singleton)
let globalWebSocket = null;
let globalListeners = new Map();
let globalReconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Initialize WebSocket connection (singleton)
const connectWebSocket = async () => {
  // If already connected or connecting, don't create another
  if (globalWebSocket && (globalWebSocket.readyState === WebSocket.CONNECTING || globalWebSocket.readyState === WebSocket.OPEN)) {
    return;
  }
  
  try {
    // Get API token before connecting
    const token = await getApiToken();
    if (!token) {
      console.error('❌ API token not available. Cannot connect to WebSocket.');
      return;
    }
    
    // Connect with token in protocol header
    globalWebSocket = new WebSocket(`ws://localhost:${WS_PORT}`, [token]);
    
    globalWebSocket.onopen = () => {
      console.log('✅ Connected to DeskMaster desktop app via WebSocket');
      globalReconnectAttempts = 0;
    };
    
    globalWebSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'detailed-stats-update') {
          const callbacks = globalListeners.get('detailed-stats-update');
          if (callbacks) {
            callbacks.forEach(cb => cb(null, message.data));
          }
        } else if (message.type === 'settings-updated') {
          const callbacks = globalListeners.get('settings-updated');
          if (callbacks) {
            callbacks.forEach(cb => cb(null, message.data));
          }
        } else if (message.type === 'theme-changed') {
          const callbacks = globalListeners.get('theme-changed');
          if (callbacks) {
            callbacks.forEach(cb => cb(null, message.data));
          }
        } else if (message.type === 'totp-codes-update') {
          const callbacks = globalListeners.get('totp-codes-update');
          if (callbacks) {
            callbacks.forEach(cb => cb(null, message.data));
          }
        } else if (message.type === 'clipboard-updated') {
          const callbacks = globalListeners.get('clipboard-updated');
          if (callbacks) {
            callbacks.forEach(cb => cb(null, message.data));
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    globalWebSocket.onerror = (error) => {
      console.warn('WebSocket error:', error);
    };
    
    globalWebSocket.onclose = () => {
      console.warn('WebSocket connection closed. Attempting to reconnect...');
      globalWebSocket = null;
      
      if (globalReconnectAttempts < maxReconnectAttempts) {
        globalReconnectAttempts++;
        setTimeout(() => {
          connectWebSocket();
        }, 2000 * globalReconnectAttempts);
      } else {
        console.error('❌ Failed to connect to DeskMaster desktop app. Make sure the app is running.');
      }
    };
  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
  }
};

// Create browser IPC renderer that connects to Electron app via WebSocket/HTTP
const createBrowserIpcRenderer = () => {
  // Initialize WebSocket connection (singleton - only creates if not already exists)
  if (!globalWebSocket || globalWebSocket.readyState === WebSocket.CLOSED) {
    connectWebSocket().catch(err => console.error('Failed to connect WebSocket:', err));
  }
  
  return {
    send: (channel, ...args) => {
      console.log('[Browser Mode] IPC send:', channel, args);
    },
    invoke: async (channel, ...args) => {
      try {
        if (channel === 'get-settings') {
          const headers = await addApiTokenToHeaders();
          const response = await fetch(`${API_BASE}/get-settings`, { headers });
          if (response.ok) {
            return await response.json();
          }
          throw new Error('Failed to get settings');
        } else if (channel === 'update-settings') {
          const [newSettings] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/update-settings`, {
            method: 'POST',
            headers,
            body: JSON.stringify(newSettings)
          });
          if (response.ok) {
            return await response.json();
          }
          throw new Error('Failed to update settings');
        } else if (channel === 'toggle-auto-start') {
          const [enabled] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/toggle-auto-start`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ enabled })
          });
          if (response.ok) {
            const result = await response.json();
            return result.success;
          }
          throw new Error('Failed to toggle auto-start');
        } else if (channel === 'toggle-web-access') {
          const [enabled] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/toggle-web-access`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ enabled })
          });
          if (response.ok) {
            return true;
          }
          throw new Error('Failed to toggle web access');
        } else if (channel === 'open-external-url') {
          const [url] = args;
          // In browser, just open the URL
          window.open(url, '_blank');
          return true;
        } else if (channel === 'get-history') {
          const [startTime, endTime] = args;
          const headers = await addApiTokenToHeaders();
          const response = await fetch(`${API_BASE}/history?startTime=${startTime}&endTime=${endTime}`, { headers });
          if (response.ok) {
            return await response.json();
          }
          throw new Error('Failed to get history');
        } else if (channel === 'get-history-range') {
          const headers = await addApiTokenToHeaders();
          const response = await fetch(`${API_BASE}/history/range`, { headers });
          if (response.ok) {
            return await response.json();
          }
          throw new Error('Failed to get history range');
        } else if (channel === 'bcrypt-generate') {
          const [text] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/bcrypt-generate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ text })
          });
          if (response.ok) {
            const result = await response.json();
            return result.hash;
          }
          throw new Error('Failed to generate bcrypt hash');
        } else if (channel === 'bcrypt-verify') {
          const [text, hash] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/bcrypt-verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ text, hash })
          });
          if (response.ok) {
            const result = await response.json();
            return result.isValid;
          }
          throw new Error('Failed to verify bcrypt hash');
        } else if (channel === 'get-public-ip') {
          const headers = await addApiTokenToHeaders();
          const response = await fetch(`${API_BASE}/get-public-ip`, { headers });
          if (response.ok) {
            const result = await response.json();
            return result.ip;
          }
          throw new Error('Failed to get public IP');
        } else if (channel === 'get-ip-location') {
          const [ips] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/get-ip-location`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ips })
          });
          if (response.ok) {
            return await response.json();
          }
          throw new Error('Failed to get IP location');
        } else if (channel === 'start-pinggy-tunnel') {
          const [{ port, options }] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/start-pinggy-tunnel`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ port, options })
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to start Pinggy tunnel');
        } else if (channel === 'stop-pinggy-tunnel') {
          const [instanceId] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/stop-pinggy-tunnel`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ instanceId })
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to stop Pinggy tunnel');
        } else if (channel === 'get-pinggy-instances') {
          const headers = await addApiTokenToHeaders();
          const response = await fetch(`${API_BASE}/get-pinggy-instances`, { headers });
          if (response.ok) {
            return await response.json();
          }
          throw new Error('Failed to get Pinggy instances');
        } else if (channel === 'reformat-text') {
          const [text] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/reformat-text`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ text })
          });
          if (response.ok) {
            const result = await response.json();
            return result.text;
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to reformat text');
        } else if (channel === 'translate-text') {
          const [text, targetLanguage] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/translate-text`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ text, targetLanguage })
          });
          if (response.ok) {
            const result = await response.json();
            return result.text;
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to translate text');
        } else if (channel === 'create-onetimesecret') {
          const [secret, ttl] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/create-onetimesecret`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ secret, ttl })
          });
          if (response.ok) {
            const result = await response.json();
            return result;
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to create OneTimeSecret');
        } else if (channel === 'get-clipboard-history') {
          const [limit] = args;
          const url = new URL(`${API_BASE}/get-clipboard-history`);
          if (limit) url.searchParams.set('limit', limit);
          const headers = await addApiTokenToHeaders();
          const response = await fetch(url, { headers });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to get clipboard history');
        } else if (channel === 'search-clipboard-history') {
          const [query, limit] = args;
          const url = new URL(`${API_BASE}/search-clipboard-history`);
          url.searchParams.set('query', query || '');
          if (limit) url.searchParams.set('limit', limit);
          const headers = await addApiTokenToHeaders();
          const response = await fetch(url, { headers });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to search clipboard history');
        } else if (channel === 'delete-clipboard-entry') {
          const [id] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/delete-clipboard-entry`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ id })
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete clipboard entry');
        } else if (channel === 'clear-clipboard-history') {
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/clear-clipboard-history`, {
            method: 'POST',
            headers
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to clear clipboard history');
        } else if (channel === 'get-authenticators') {
          const headers = await addApiTokenToHeaders();
          const response = await fetch(`${API_BASE}/get-authenticators`, { headers });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to get authenticators');
        } else if (channel === 'create-authenticator') {
          const [data] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/create-authenticator`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to create authenticator');
        } else if (channel === 'update-authenticator') {
          const [id, data] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/update-authenticator`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ id, ...data })
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to update authenticator');
        } else if (channel === 'delete-authenticator') {
          const [id] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/delete-authenticator`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ id })
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete authenticator');
        } else if (channel === 'get-totp-code') {
          const [secret] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/get-totp-code`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ secret })
          });
          if (response.ok) {
            const result = await response.json();
            return result.code;
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to get TOTP code');
        } else if (channel === 'get-all-totp-codes') {
          const [secrets] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/get-all-totp-codes`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ secrets })
          });
          if (response.ok) {
            const result = await response.json();
            return result.codes;
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to get all TOTP codes');
        } else if (channel === 'get-totp-time-remaining') {
          const headers = await addApiTokenToHeaders();
          const response = await fetch(`${API_BASE}/get-totp-time-remaining`, { headers });
          if (response.ok) {
            const result = await response.json();
            return result.remaining;
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to get TOTP time remaining');
        } else if (channel === 'get-trash-entries') {
          const headers = await addApiTokenToHeaders();
          const response = await fetch(`${API_BASE}/get-trash-entries`, { headers });
          if (response.ok) {
            const result = await response.json();
            return result.entries || [];
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to get trash entries');
        } else if (channel === 'restore-from-trash') {
          const [trashId] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/restore-from-trash`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ trashId })
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to restore from trash');
        } else if (channel === 'permanently-delete-from-trash') {
          const [trashId] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/permanently-delete-from-trash`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ trashId })
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to permanently delete from trash');
        } else if (channel === 'authenticate-user') {
          const [reason] = args;
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/authenticate-user`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ reason: reason || 'Access to this feature requires authentication' })
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to authenticate');
        } else if (channel === 'export-all-data') {
          // Note: Export requires file dialog which is only available in Electron mode
          throw new Error('Export is only available in Electron app mode');
        } else if (channel === 'import-all-data') {
          // Note: Import requires file dialog which is only available in Electron mode
          throw new Error('Import is only available in Electron app mode');
        } else if (channel === 'reset-all-data') {
          const headers = await addApiTokenToHeaders({ 'Content-Type': 'application/json' });
          const response = await fetch(`${API_BASE}/reset-all-data`, {
            method: 'POST',
            headers
          });
          if (response.ok) {
            return await response.json();
          }
          const error = await response.json();
          throw new Error(error.error || 'Failed to reset data');
        } else if (channel === 'copy-to-clipboard') {
          const [text] = args;
          await navigator.clipboard.writeText(text);
          return { success: true };
        } else if (channel === 'open-external-url') {
          const [url] = args;
          window.open(url, '_blank');
          return { success: true };
        }
        return null;
      } catch (error) {
        console.error(`[Browser Mode] IPC invoke error for ${channel}:`, error);
        // Return fallback data if connection fails
        if (channel === 'get-settings') {
          return {
            stats: { cpu: true, ram: true, disk: true, network: true, battery: true },
            timezones: [],
            datetimeFormat: 'HH:mm:ss',
            autoStart: false,
            theme: 'system'
          };
        }
        return null;
      }
    },
    on: (channel, callback) => {
      if (!globalListeners.has(channel)) {
        globalListeners.set(channel, new Set());
      }
      globalListeners.get(channel).add(callback);
      console.log(`[Browser Mode] IPC listener registered for: ${channel}`);
    },
    removeListener: (channel, callback) => {
      if (globalListeners.has(channel)) {
        globalListeners.get(channel).delete(callback);
        if (globalListeners.get(channel).size === 0) {
          globalListeners.delete(channel);
        }
      }
    }
  };
};

// Export isElectron check
export { isElectron };

// Also export for use in components
export const isElectronMode = isElectron;

// Legacy mock function (kept for backward compatibility, but not used)
const createMockIpcRenderer = () => {
  return {
    send: (channel, ...args) => {
      console.log('[Browser Mode] IPC send:', channel, args);
    },
    invoke: async (channel, ...args) => {
      console.log('[Browser Mode] IPC invoke:', channel, args);
      // Return mock data for browser preview
      if (channel === 'get-settings') {
        return {
          stats: {
            cpu: true,
            ram: true,
            disk: true,
            network: true,
            battery: true
          },
          timezones: [
            { id: 1, label: 'New York', timezone: 'America/New_York', showInTray: true },
            { id: 2, label: 'London', timezone: 'Europe/London', showInTray: true },
            { id: 3, label: 'Tokyo', timezone: 'Asia/Tokyo', showInTray: false }
          ],
          datetimeFormat: 'HH:mm:ss',
          autoStart: false,
          theme: 'system'
        };
      }
      return null;
    },
    on: (channel, callback) => {
      console.log('[Browser Mode] IPC on:', channel);
      // In browser, we can simulate some events
      if (channel === 'detailed-stats-update') {
        // Simulate stats updates every 2 seconds
        const interval = setInterval(() => {
          callback(null, {
            cpu: Math.floor(Math.random() * 100),
            ram: Math.floor(Math.random() * 100),
            disk: Math.floor(Math.random() * 100),
            net: { human: `${Math.floor(Math.random() * 1000)} KB/s`, kbs: Math.random() * 1000 },
            battery: null,
            cpuDetails: { cores: 8, speed: '3.2', temperature: 45 },
            memoryDetails: { used: '8.5', total: '16.0' },
            storageDetails: [{ used: '250', total: '500' }],
            networkDetails: [{ rx: '125', tx: '50' }],
            theme: 'dark',
            timezones: [
              { id: 1, label: 'New York', timezone: 'America/New_York', showInTray: true },
              { id: 2, label: 'London', timezone: 'Europe/London', showInTray: true }
            ],
            settings: {
              stats: {
                cpu: true,
                ram: true,
                disk: true,
                network: true,
                battery: true
              },
              datetimeFormat: 'HH:mm:ss'
            }
          });
        }, 2000);
        
        // Store interval for cleanup
        if (!window._mockIntervals) window._mockIntervals = [];
        window._mockIntervals.push({ channel, interval });
      } else if (channel === 'settings-updated') {
        // Settings updates are handled via invoke, so this is mostly for compatibility
        console.log('[Browser Mode] Settings update listener registered');
      } else if (channel === 'theme-changed') {
        // Theme changes can be simulated
        console.log('[Browser Mode] Theme change listener registered');
      } else if (channel === 'update-tray-stats') {
        // Tray stats updates
        console.log('[Browser Mode] Tray stats update listener registered');
      }
    },
    removeListener: (channel, callback) => {
      console.log('[Browser Mode] IPC removeListener:', channel);
      // Clean up intervals
      if (window._mockIntervals) {
        window._mockIntervals = window._mockIntervals.filter(item => {
          if (item.channel === channel) {
            clearInterval(item.interval);
            return false;
          }
          return true;
        });
      }
    }
  };
};
