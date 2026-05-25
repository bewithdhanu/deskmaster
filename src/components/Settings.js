import React, { useState, useEffect } from 'react';
import { MdSettings, MdMemory, MdStorage, MdNetworkCheck, MdBatteryFull, MdAccessTime, MdPowerSettingsNew, MdPalette, MdVisibility, MdVisibilityOff, MdFileDownload, MdFileUpload, MdDeleteForever } from 'react-icons/md';
import TimezoneDropdown from './TimezoneDropdown';
import { getIpcRenderer, isElectron } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

const Settings = () => {
  const [settings, setSettings] = useState({
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
      url: '',
      username: '',
      password: ''
    }
  });

  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [editingTimezone, setEditingTimezone] = useState(null); // null for add, timezone object for edit
  const [selectedTimezone, setSelectedTimezone] = useState(null);
  const [timezoneLabel, setTimezoneLabel] = useState('');
  const [showInTray, setShowInTray] = useState(true);
  const [showChatGPTKey, setShowChatGPTKey] = useState(false);
  const [showIPLocationKey, setShowIPLocationKey] = useState(false);
  const [showUptimePassword, setShowUptimePassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [backupStatus, setBackupStatus] = useState({ connected: false, enabled: false, intervalHours: 4, keepLast: 10, lastBackupAt: null, lastBackupStatus: null, lastBackupError: null, running: false });
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isBackingUpNow, setIsBackingUpNow] = useState(false);

  const datetimeFormats = [
    { value: 'HH:mm:ss', label: '24-hour (14:30:25)' },
    { value: 'h:mm:ss A', label: '12-hour (2:30:25 PM)' },
    { value: 'HH:mm', label: '24-hour short (14:30)' },
    { value: 'h:mm A', label: '12-hour short (2:30 PM)' },
    { value: 'MMM DD, HH:mm', label: 'Date + Time (Jan 15, 14:30)' },
    { value: 'MMM DD, h:mm A', label: 'Date + Time (Jan 15, 2:30 PM)' }
  ];

  useEffect(() => {
    loadSettings();
    loadBackupStatus();
    
    // Listen for settings updates
    ipcRenderer.on('settings-updated', handleSettingsUpdate);
    
    return () => {
      ipcRenderer.removeListener('settings-updated', handleSettingsUpdate);
    };
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await ipcRenderer.invoke('get-settings');
      setSettings(currentSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadBackupStatus = async () => {
    try {
      const st = await ipcRenderer.invoke('gdrive:status');
      if (st) setBackupStatus(st);
    } catch {}
  };

  const handleSettingsUpdate = (event, newSettings) => {
    setSettings(newSettings);
  };

  const updateSettings = async (newSettings) => {
    try {
      await ipcRenderer.invoke('update-settings', newSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  const updateBackupSettings = async (patch) => {
    const next = {
      ...settings,
      cloudBackup: {
        ...(settings.cloudBackup || {}),
        ...(patch || {})
      }
    };
    await updateSettings(next);
    await loadBackupStatus();
  };

  const updateUptimeKumaSettings = (patch) => {
    const newSettings = {
      ...settings,
      uptimeKuma: {
        ...(settings.uptimeKuma || {}),
        ...(patch || {})
      }
    };
    updateSettings(newSettings);
  };

  const toggleStat = (statName) => {
    const newSettings = {
      ...settings,
      stats: {
        ...settings.stats,
        [statName]: !settings.stats[statName]
      }
    };
    updateSettings(newSettings);
  };

  const openAddTimezoneModal = () => {
    setEditingTimezone(null);
    setSelectedTimezone(null);
    setTimezoneLabel('');
    setShowInTray(true); // Default to showing in tray
    setShowTimezoneModal(true);
  };

  const openEditTimezoneModal = (timezone) => {
    setEditingTimezone(timezone);
    setSelectedTimezone(timezone.timezone);
    setTimezoneLabel(timezone.label);
    setShowInTray(timezone.showInTray !== undefined ? timezone.showInTray : true); // Default to true if not set
    setShowTimezoneModal(true);
  };

  const closeTimezoneModal = () => {
    setShowTimezoneModal(false);
    setEditingTimezone(null);
    setSelectedTimezone(null);
    setTimezoneLabel('');
    setShowInTray(true);
  };

  const saveTimezone = () => {
    if (selectedTimezone && timezoneLabel.trim()) {
      if (editingTimezone) {
        // Edit existing timezone
        const newSettings = {
          ...settings,
          timezones: settings.timezones.map(tz => 
            tz.id === editingTimezone.id 
              ? { ...tz, label: timezoneLabel.trim(), timezone: selectedTimezone, showInTray: showInTray }
              : tz
          )
        };
        updateSettings(newSettings);
      } else {
        // Add new timezone
        const newTimezone = {
          id: Date.now(),
          label: timezoneLabel.trim(),
          timezone: selectedTimezone,
          showInTray: showInTray
        };
        
        const newSettings = {
          ...settings,
          timezones: [...settings.timezones, newTimezone]
        };
        updateSettings(newSettings);
      }
      closeTimezoneModal();
    }
  };

  const removeTimezone = (id) => {
    const newSettings = {
      ...settings,
      timezones: settings.timezones.filter(tz => tz.id !== id)
    };
    updateSettings(newSettings);
  };

  const updateDatetimeFormat = (format) => {
    const newSettings = {
      ...settings,
      datetimeFormat: format
    };
    updateSettings(newSettings);
  };

  const toggleAutoStart = async () => {
    try {
      const newAutoStart = !settings.autoStart;
      const success = await ipcRenderer.invoke('toggle-auto-start', newAutoStart);
      
      if (success) {
        const newSettings = {
          ...settings,
          autoStart: newAutoStart
        };
        updateSettings(newSettings);
      }
    } catch (error) {
      console.error('Error toggling auto-start:', error);
    }
  };

  const toggleWebAccess = async () => {
    const newWebAccess = !settings.webAccess;
    const newSettings = {
      ...settings,
      webAccess: newWebAccess
    };
    updateSettings(newSettings);
    
    // Notify main process to start/stop servers
    try {
      await ipcRenderer.invoke('toggle-web-access', newWebAccess);
    } catch (error) {
      console.error('Error toggling web access:', error);
    }
  };

  const openWebUrl = () => {
    const url = 'http://localhost:65530';
    ipcRenderer.invoke('open-external-url', url).catch(error => {
      console.error('Error opening URL:', error);
      // Fallback: try using window.open if in browser
      if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank');
      }
    });
  };

  const updateTheme = (theme) => {
    const newSettings = {
      ...settings,
      theme: theme
    };
    updateSettings(newSettings);
    
    // Apply theme immediately
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.body.setAttribute('data-theme', theme);
    }
  };

  // Helper function to authenticate user (always prompts, regardless of timeout)
  const requireAuthentication = async (action = 'perform this action') => {
    try {
      const result = await ipcRenderer.invoke('authenticate-user', `Authentication required to ${action}`);
      return result && result.authenticated;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  };

  const handleExport = async () => {
    const authenticated = await requireAuthentication('export all data');
    if (!authenticated) {
      return; // Silently cancel if authentication fails
    }

    setIsExporting(true);
    try {
      const result = await ipcRenderer.invoke('export-all-data');
      if (result.success) {
        if (result.filePath) {
          alert(`Data exported successfully to:\n${result.filePath}`);
        } else if (result.data) {
          const json = JSON.stringify(result.data, null, 2)
          const blob = new Blob([json], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `deskmaster-export-${new Date().toISOString().slice(0, 10)}.json`
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          alert('Data exported successfully (download started).')
        } else {
          alert('Export completed, but no file was returned.')
        }
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Error exporting data: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    const authenticated = await requireAuthentication('import all data');
    if (!authenticated) {
      return; // Silently cancel if authentication fails
    }

    if (!window.confirm('Importing data will replace all current settings, authenticators, and clipboard history. This action cannot be undone. Continue?')) {
      return;
    }

    setIsImporting(true);
    try {
      let result
      if (isElectron()) {
        result = await ipcRenderer.invoke('import-all-data')
      } else {
        const file = await new Promise((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'application/json,.json'
          input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null)
          input.click()
        })
        if (!file) {
          setIsImporting(false)
          return
        }
        const text = await file.text()
        const data = JSON.parse(text)
        result = await ipcRenderer.invoke('import-all-data', { data })
      }
      if (result.success) {
        alert('Data imported successfully! The application will reload.');
        // Reload settings
        await loadSettings();
        // Reload the page to refresh all components
        window.location.reload();
      } else if (result.needsPassword) {
        // Password prompt is handled by backend, but if it still fails, show error
        alert(result.error || 'Encryption key is required for this file.');
      }
    } catch (error) {
      console.error('Error importing data:', error);
      alert('Error importing data: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = async () => {
    const authenticated = await requireAuthentication('reset all data');
    if (!authenticated) {
      return; // Silently cancel if authentication fails
    }

    if (!window.confirm('This will permanently delete all settings, authenticators, and clipboard history. This action cannot be undone. Are you absolutely sure?')) {
      return;
    }

    if (!window.confirm('Final confirmation: This will delete EVERYTHING. Continue?')) {
      return;
    }

    setIsResetting(true);
    try {
      const result = await ipcRenderer.invoke('reset-all-data');
      if (result.success) {
        alert('All data has been reset. The application will reload.');
        // Reload settings
        await loadSettings();
        // Reload the page to refresh all components
        window.location.reload();
      }
    } catch (error) {
      console.error('Error resetting data:', error);
      alert('Error resetting data: ' + error.message);
    } finally {
      setIsResetting(false);
    }
  };

  const ToggleSwitch = ({ enabled, onChange, label, description }) => (
    <div className="flex items-center justify-between py-1">
      <div className="flex-1">
        <div className="text-theme-primary font-medium text-xs">{label}</div>
        {description && <div className="text-theme-muted text-xs mt-0.5">{description}</div>}
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 ${
          enabled ? 'bg-red-500' : 'bg-theme-secondary'
        }`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform duration-200 ${
            enabled ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );

  const SelectOption = ({ value, onChange, options, label, description }) => (
    <div className="py-1">
      <div className="mb-1">
        <div className="text-theme-primary font-medium text-xs">{label}</div>
        {description && <div className="text-theme-muted text-xs mt-0.5">{description}</div>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-theme-secondary border border-theme rounded-md text-theme-primary text-xs focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-theme-primary overflow-y-auto p-4">
      <div className="flex-1 mx-auto w-full">
        {/* Responsive Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          
          {/* System Stats Card */}
          <div className="bg-theme-card border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MdMemory className="w-4 h-4 text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">System Stats</h3>
            </div>
            <div className="space-y-2">
              <ToggleSwitch
                enabled={settings.stats.cpu}
                onChange={() => toggleStat('cpu')}
                label="CPU Usage"
                description="Show in tray"
              />
              <ToggleSwitch
                enabled={settings.stats.ram}
                onChange={() => toggleStat('ram')}
                label="Memory Usage"
                description="Show in tray"
              />
              <ToggleSwitch
                enabled={settings.stats.disk}
                onChange={() => toggleStat('disk')}
                label="Storage Usage"
                description="Show in tray"
              />
              <ToggleSwitch
                enabled={settings.stats.network}
                onChange={() => toggleStat('network')}
                label="Network Activity"
                description="Show in tray"
              />
              <ToggleSwitch
                enabled={settings.stats.battery}
                onChange={() => toggleStat('battery')}
                label="Battery Status"
                description="Show in tray"
              />
            </div>
          </div>

          {/* World Clocks Card */}
          <div className="bg-theme-card border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MdAccessTime className="w-4 h-4 text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">World Clocks</h3>
            </div>
            <div className="space-y-3">
              <SelectOption
                value={settings.datetimeFormat}
                onChange={updateDatetimeFormat}
                options={datetimeFormats}
                label="Time Format"
                description="Display format"
              />
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-theme-primary font-medium">Timezones</div>
                  <button
                    onClick={openAddTimezoneModal}
                    className="flex items-center justify-center w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-bold transition-colors duration-200"
                  >
                    +
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {settings.timezones.map((tz) => (
                    <div key={tz.id} className="flex items-center gap-1 bg-theme-secondary rounded-full px-2 py-1 text-xs cursor-pointer hover:bg-theme-card-hover transition-colors duration-200">
                      <span 
                        className="text-theme-primary font-medium"
                        onClick={() => openEditTimezoneModal(tz)}
                      >
                        {tz.label}
                      </span>
                      {tz.showInTray !== false && (
                        <span 
                          className="text-theme-muted text-[10px]"
                          title="Shown in tray"
                          onClick={() => openEditTimezoneModal(tz)}
                        >
                          🖥️
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTimezone(tz.id);
                        }}
                        className="text-theme-muted hover:text-red-400 transition-colors duration-200 ml-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* System Card */}
          <div className="bg-theme-card border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MdPowerSettingsNew className="w-4 h-4 text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">System</h3>
            </div>
            <div className="space-y-2">
              <ToggleSwitch
                enabled={settings.autoStart}
                onChange={toggleAutoStart}
                label="Start with System"
                description="Auto-start on boot"
              />
              <ToggleSwitch
                enabled={settings.webAccess}
                onChange={toggleWebAccess}
                label="Web Access"
                description="Enable browser access"
              />
              {settings.webAccess && (
                <div className="mt-2 pt-2 border-t border-theme">
                  <div className="text-xs text-theme-muted mb-1">Web URL:</div>
                  <button
                    onClick={openWebUrl}
                    className="text-xs text-red-500 hover:text-red-400 underline break-all text-left transition-colors duration-200"
                    title="Click to open in browser"
                  >
                    http://localhost:65530
                  </button>
                </div>
              )}
              {isElectron() && (
                <ToggleSwitch
                  enabled={settings.showInDock !== false}
                  onChange={() => {
                    const newSettings = {
                      ...settings,
                      showInDock: !(settings.showInDock !== false)
                    };
                    updateSettings(newSettings);
                  }}
                  label="Show in Dock"
                  description="Show app icon in macOS dock (macOS only)"
                />
              )}
            </div>
          </div>

          {/* Appearance Card */}
          <div className="bg-theme-card border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MdPalette className="w-4 h-4 text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">Appearance</h3>
            </div>
            <div className="space-y-2">
              <SelectOption
                value={settings.theme}
                onChange={updateTheme}
                options={[
                  { value: 'system', label: 'System Default' },
                  { value: 'dark', label: 'Dark Mode' },
                  { value: 'light', label: 'Light Mode' }
                ]}
                label="Theme"
                description="Color scheme"
              />
            </div>
          </div>

          {/* API Keys Card */}
          <div className="bg-theme-card border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MdSettings className="w-4 h-4 text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">API Keys</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  ChatGPT API Key (GPT-4o mini)
                </label>
                <div className="relative">
                <input
                    type={showChatGPTKey ? "text" : "password"}
                  value={settings.apiKeys?.chatgpt || ''}
                  onChange={(e) => {
                    const newSettings = {
                      ...settings,
                      apiKeys: {
                        ...settings.apiKeys,
                        chatgpt: e.target.value
                      }
                    };
                    updateSettings(newSettings);
                  }}
                  placeholder="sk-..."
                    className="w-full px-2 py-1.5 pr-8 bg-theme-secondary border border-theme rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                  <button
                    type="button"
                    onClick={() => setShowChatGPTKey(!showChatGPTKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary transition-colors"
                    title={showChatGPTKey ? "Hide password" : "Show password"}
                  >
                    {showChatGPTKey ? (
                      <MdVisibilityOff className="w-4 h-4" />
                    ) : (
                      <MdVisibility className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="text-theme-muted text-xs mt-1">For text reformatting tool</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  IP Location API Key
                </label>
                <div className="relative">
                <input
                    type={showIPLocationKey ? "text" : "password"}
                  value={settings.apiKeys?.ipLocation || ''}
                  onChange={(e) => {
                    const newSettings = {
                      ...settings,
                      apiKeys: {
                        ...settings.apiKeys,
                        ipLocation: e.target.value
                      }
                    };
                    updateSettings(newSettings);
                  }}
                  placeholder="API key..."
                    className="w-full px-2 py-1.5 pr-8 bg-theme-secondary border border-theme rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                  <button
                    type="button"
                    onClick={() => setShowIPLocationKey(!showIPLocationKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary transition-colors"
                    title={showIPLocationKey ? "Hide password" : "Show password"}
                  >
                    {showIPLocationKey ? (
                      <MdVisibilityOff className="w-4 h-4" />
                    ) : (
                      <MdVisibility className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="text-theme-muted text-xs mt-1">For IP location lookup tool</div>
              </div>
            </div>
          </div>

          {/* Uptime Kuma Card */}
          <div className="bg-theme-card border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MdSettings className="w-4 h-4 text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">Uptime Kuma</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  Uptime Kuma URL
                </label>
                <input
                  type="url"
                  value={settings.uptimeKuma?.url || ''}
                  onChange={(e) => updateUptimeKumaSettings({ url: e.target.value })}
                  placeholder="https://uptime-kuma.example.com"
                  className="w-full px-2 py-1.5 bg-theme-secondary border border-theme rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <div className="text-theme-muted text-xs mt-1">Used by the Uptime tab to connect to your Uptime Kuma instance</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={settings.uptimeKuma?.username || ''}
                  onChange={(e) => updateUptimeKumaSettings({ username: e.target.value })}
                  placeholder="Uptime Kuma username"
                  className="w-full px-2 py-1.5 bg-theme-secondary border border-theme rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showUptimePassword ? "text" : "password"}
                    value={settings.uptimeKuma?.password || ''}
                    onChange={(e) => updateUptimeKumaSettings({ password: e.target.value })}
                    placeholder="Uptime Kuma password"
                    className="w-full px-2 py-1.5 pr-8 bg-theme-secondary border border-theme rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUptimePassword(!showUptimePassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary transition-colors"
                    title={showUptimePassword ? "Hide password" : "Show password"}
                  >
                    {showUptimePassword ? (
                      <MdVisibilityOff className="w-4 h-4" />
                    ) : (
                      <MdVisibility className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="text-theme-muted text-xs mt-1">Token authentication is intentionally not used</div>
              </div>
            </div>
          </div>

          {/* Data Management Card */}
          <div className="bg-theme-card border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MdSettings className="w-4 h-4 text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">Data Management</h3>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-xs"
              >
                <MdFileDownload className="w-4 h-4" />
                {isExporting ? 'Exporting...' : 'Export All Data'}
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-xs"
              >
                <MdFileUpload className="w-4 h-4" />
                {isImporting ? 'Importing...' : 'Import Data'}
              </button>
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-xs"
              >
                <MdDeleteForever className="w-4 h-4" />
                {isResetting ? 'Resetting...' : 'Reset All Data'}
              </button>
              <div className="text-theme-muted text-xs mt-2 pt-2 border-t border-theme">
                <p className="mb-1">Export: Save all settings, authenticators, and clipboard history to a file (optional encryption).</p>
                <p className="mb-1">Import: Restore data from an exported file (replaces current data).</p>
                <p>Reset: Permanently delete all data and restore defaults.</p>
              </div>
            </div>
          </div>

          {/* Cloud Backup Card */}
          <div className="bg-theme-card border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MdSettings className="w-4 h-4 text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">Cloud Backup (Google Drive)</h3>
            </div>

            <div className="space-y-2">
                <div className="text-theme-muted text-xs">
                  Stores backups in a Google Drive folder named <span className="text-theme-primary font-medium">DeskMaster Backups</span>, keeping the last {backupStatus.keepLast || 10}.
                </div>

                <div className="flex items-center justify-between gap-2 rounded border border-theme bg-theme-secondary px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-theme-primary text-xs font-medium">Connection</div>
                    <div className="text-theme-muted text-xs truncate">
                      {backupStatus.connected ? 'Connected' : 'Not connected'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!backupStatus.connected ? (
                      <button
                        className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-xs disabled:opacity-60"
                        disabled={isConnectingDrive}
                        onClick={async () => {
                          setIsConnectingDrive(true);
                          try {
                            await ipcRenderer.invoke('gdrive:connect');
                            await loadBackupStatus();
                          } catch (e) {
                            alert(e?.message || 'Failed to connect Google Drive');
                          } finally {
                            setIsConnectingDrive(false);
                          }
                        }}
                      >
                        {isConnectingDrive ? 'Connecting…' : 'Connect'}
                      </button>
                    ) : (
                      <button
                        className="px-3 py-1.5 rounded-md bg-theme-secondary hover:bg-theme-card-hover border border-theme text-theme-primary text-xs"
                        onClick={async () => {
                          try {
                            await ipcRenderer.invoke('gdrive:disconnect');
                            await loadBackupStatus();
                          } catch (e) {
                            alert(e?.message || 'Failed to disconnect');
                          }
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded border border-theme bg-theme-secondary px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-theme-primary text-xs font-medium">Automatic backup</div>
                    <div className="text-theme-muted text-xs truncate">Every {settings.cloudBackup?.intervalHours || 4} hours</div>
                  </div>
                  <button
                    className={`px-3 py-1.5 rounded-md text-xs ${settings.cloudBackup?.enabled ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-theme-secondary hover:bg-theme-card-hover border border-theme text-theme-primary'}`}
                    disabled={!backupStatus.connected}
                    onClick={() => updateBackupSettings({ enabled: !settings.cloudBackup?.enabled })}
                    title={!backupStatus.connected ? 'Connect Google Drive first' : ''}
                  >
                    {settings.cloudBackup?.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                <SelectOption
                  value={String(settings.cloudBackup?.intervalHours || 4)}
                  onChange={(v) => updateBackupSettings({ intervalHours: Number(v) || 4 })}
                  options={[
                    { value: '3', label: 'Every 3 hours' },
                    { value: '4', label: 'Every 4 hours' }
                  ]}
                  label="Backup frequency"
                  description="Runs in background when DeskMaster is open"
                />

                <div className="flex gap-2">
                  <button
                    className="flex-1 px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-xs disabled:opacity-60"
                    disabled={!backupStatus.connected || isBackingUpNow}
                    onClick={async () => {
                      setIsBackingUpNow(true);
                      try {
                        await ipcRenderer.invoke('gdrive:backup-now');
                        await loadBackupStatus();
                      } catch (e) {
                        alert(e?.message || 'Backup failed');
                      } finally {
                        setIsBackingUpNow(false);
                      }
                    }}
                  >
                    {isBackingUpNow ? 'Backing up…' : 'Backup now'}
                  </button>
                </div>

                <div className="text-theme-muted text-xs pt-2 border-t border-theme">
                  <div>Last backup: {backupStatus.lastBackupAt ? new Date(backupStatus.lastBackupAt).toLocaleString() : 'Never'}</div>
                  {backupStatus.lastBackupStatus === 'error' ? (
                    <div className="text-red-500 mt-1">Error: {backupStatus.lastBackupError || 'Unknown error'}</div>
                  ) : null}
                </div>
              </div>
          </div>

        </div>
      </div>

      {/* Timezone Modal */}
      {showTimezoneModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-theme-secondary rounded-lg p-6 w-96 max-w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-theme-primary">
                {editingTimezone ? 'Edit Timezone' : 'Add Timezone'}
              </h3>
              <button
                onClick={closeTimezoneModal}
                className="text-theme-muted hover:text-theme-primary transition-colors duration-200"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-theme-primary font-medium mb-2">Timezone</label>
                <TimezoneDropdown 
                  onTimezoneSelect={setSelectedTimezone} 
                  selectedTimezone={selectedTimezone}
                />
              </div>
              <div>
                <label className="block text-theme-primary font-medium mb-2">Label</label>
                <input
                  type="text"
                  value={timezoneLabel}
                  onChange={(e) => setTimezoneLabel(e.target.value)}
                  placeholder="e.g., New York, London"
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-md text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <div className="text-theme-primary font-medium text-sm">Show in Tray</div>
                  <div className="text-theme-muted text-xs mt-0.5">Display this timezone in system tray</div>
                </div>
                <button
                  onClick={() => setShowInTray(!showInTray)}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 ${
                    showInTray ? 'bg-red-500' : 'bg-theme-secondary'
                  }`}
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform duration-200 ${
                      showInTray ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveTimezone}
                  disabled={!selectedTimezone || !timezoneLabel.trim()}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200"
                >
                  {editingTimezone ? 'Update' : 'Add'}
                </button>
                <button
                  onClick={closeTimezoneModal}
                  className="flex-1 px-4 py-2 bg-theme-secondary hover:bg-theme-card-hover text-theme-primary rounded-md transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
