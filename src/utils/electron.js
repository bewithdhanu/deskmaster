// Utility to safely access Electron APIs with browser fallbacks

const WS_PORT = 65531;
const HTTP_PORT = 65532;
const API_BASE = `http://localhost:${HTTP_PORT}/api`;

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
      return createBrowserIpcRenderer();
    }
  }
  return createBrowserIpcRenderer();
};

// Create browser IPC renderer that connects to Electron app via WebSocket/HTTP
const createBrowserIpcRenderer = () => {
  let ws = null;
  const listeners = new Map();
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  
  // Initialize WebSocket connection
  const connectWebSocket = () => {
    try {
      ws = new WebSocket(`ws://localhost:${WS_PORT}`);
      
      ws.onopen = () => {
        console.log('✅ Connected to DeskMaster desktop app via WebSocket');
        reconnectAttempts = 0;
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'detailed-stats-update') {
            const callbacks = listeners.get('detailed-stats-update');
            if (callbacks) {
              callbacks.forEach(cb => cb(null, message.data));
            }
          } else if (message.type === 'settings-updated') {
            const callbacks = listeners.get('settings-updated');
            if (callbacks) {
              callbacks.forEach(cb => cb(null, message.data));
            }
          } else if (message.type === 'theme-changed') {
            const callbacks = listeners.get('theme-changed');
            if (callbacks) {
              callbacks.forEach(cb => cb(null, message.data));
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.warn('WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.warn('WebSocket connection closed. Attempting to reconnect...');
        ws = null;
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          setTimeout(() => {
            connectWebSocket();
          }, 2000 * reconnectAttempts);
        } else {
          console.error('❌ Failed to connect to DeskMaster desktop app. Make sure the app is running.');
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  };
  
  // Start connection
  connectWebSocket();
  
  return {
    send: (channel, ...args) => {
      console.log('[Browser Mode] IPC send:', channel, args);
    },
    invoke: async (channel, ...args) => {
      try {
        if (channel === 'get-settings') {
          const response = await fetch(`${API_BASE}/get-settings`);
          if (response.ok) {
            return await response.json();
          }
          throw new Error('Failed to get settings');
        } else if (channel === 'update-settings') {
          const [newSettings] = args;
          const response = await fetch(`${API_BASE}/update-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
          });
          if (response.ok) {
            return await response.json();
          }
          throw new Error('Failed to update settings');
        } else if (channel === 'toggle-auto-start') {
          const [enabled] = args;
          const response = await fetch(`${API_BASE}/toggle-auto-start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
          });
          if (response.ok) {
            const result = await response.json();
            return result.success;
          }
          throw new Error('Failed to toggle auto-start');
        } else if (channel === 'toggle-web-access') {
          const [enabled] = args;
          const response = await fetch(`${API_BASE}/toggle-web-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      listeners.get(channel).add(callback);
      console.log(`[Browser Mode] IPC listener registered for: ${channel}`);
    },
    removeListener: (channel, callback) => {
      if (listeners.has(channel)) {
        listeners.get(channel).delete(callback);
        if (listeners.get(channel).size === 0) {
          listeners.delete(channel);
        }
      }
    }
  };
};

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

// Export isElectron check
export { isElectron };

