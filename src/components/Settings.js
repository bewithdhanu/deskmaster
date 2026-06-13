import React, { useState, useEffect } from 'react';
import { MdSettings, MdMemory, MdStorage, MdNetworkCheck, MdBatteryFull, MdAccessTime, MdPowerSettingsNew, MdPalette, MdVisibility, MdVisibilityOff, MdFileDownload, MdFileUpload, MdDeleteForever } from 'react-icons/md';
import TimezoneDropdown from './TimezoneDropdown';
import { getIpcRenderer, isElectron } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

const scrollToSection = (sectionId) => {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const ToggleSwitch = ({ enabled, onChange, label, description }) => (
  <div className="flex items-center justify-between gap-4 rounded-lg border border-theme bg-theme-secondary/60 px-4 py-3">
    <div className="min-w-0 flex-1">
      <div className="text-theme-primary font-medium text-sm">{label}</div>
      {description && <div className="text-theme-muted text-xs mt-0.5">{description}</div>}
    </div>
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
        enabled ? 'bg-red-500' : 'bg-theme-secondary border border-theme'
      }`}
      aria-pressed={enabled}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

const SelectOption = ({ value, onChange, options, label, description }) => (
  <div className="rounded-lg border border-theme bg-theme-secondary/60 px-4 py-3">
    <div className="mb-2">
      <div className="text-theme-primary font-medium text-sm">{label}</div>
      {description && <div className="text-theme-muted text-xs mt-0.5">{description}</div>}
    </div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-theme-card border border-theme rounded-md text-theme-primary text-xs focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const SectionCard = ({ id, icon: Icon, title, description, children }) => (
  <section id={id} className="scroll-mt-6 rounded-xl border border-theme bg-theme-card shadow-sm">
    <div className="flex items-start gap-3 border-b border-theme px-5 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-theme-secondary text-theme-muted">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-theme-primary">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-theme-muted">{description}</p>}
      </div>
    </div>
    <div className="space-y-3 p-5">{children}</div>
  </section>
);

const StatusPill = ({ tone = 'muted', children }) => {
  const toneClass = tone === 'success'
    ? 'border-green-500/30 bg-green-500/10 text-green-500'
    : tone === 'warning'
      ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500'
      : tone === 'danger'
        ? 'border-red-500/30 bg-red-500/10 text-red-500'
        : 'border-theme bg-theme-secondary text-theme-muted';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
};

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
      enabled: true,
      url: '',
      username: '',
      password: ''
    },
    cloudBackup: {
      provider: 'gdrive',
      clientId: '',
      clientSecret: '',
      enabled: false,
      intervalHours: 4,
      keepLast: 10
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
  const [showDriveClientSecret, setShowDriveClientSecret] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [backupStatus, setBackupStatus] = useState({ connected: false, enabled: false, intervalHours: 4, keepLast: 10, oauthConfigured: false, lastBackupAt: null, lastBackupStatus: null, lastBackupError: null, running: false });
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

  const settingsSections = [
    { id: 'system-stats', label: 'System Stats', icon: MdMemory },
    { id: 'world-clocks', label: 'World Clocks', icon: MdAccessTime },
    { id: 'system-behavior', label: 'System', icon: MdPowerSettingsNew },
    { id: 'appearance', label: 'Appearance', icon: MdPalette },
    { id: 'api-keys', label: 'API Keys', icon: MdSettings },
    { id: 'uptime-kuma', label: 'Uptime Kuma', icon: MdNetworkCheck },
    { id: 'data-management', label: 'Data Management', icon: MdStorage },
    { id: 'cloud-backup', label: 'Cloud Backup', icon: MdFileUpload }
  ];

  return (
    <div className="h-full bg-theme-primary overflow-hidden">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-64 shrink-0 border-r border-theme bg-theme-card/70 p-4 lg:block">
          <div className="mb-5">
            <div className="text-lg font-semibold text-theme-primary">Settings</div>
            <div className="mt-1 text-xs leading-5 text-theme-muted">Configure DeskMaster tools, integrations, backup, and system behavior.</div>
          </div>
          <nav className="space-y-1">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-theme-muted transition-colors hover:bg-theme-secondary hover:text-theme-primary"
                >
                  <Icon className="h-4 w-4" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6">
            <div className="rounded-xl border border-theme bg-theme-card px-5 py-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">DeskMaster</p>
                  <h2 className="mt-2 text-2xl font-semibold text-theme-primary">Settings</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-theme-muted">
                    A cleaner control center for tray stats, clocks, integrations, cloud backup, and data management.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={settings.webAccess ? 'success' : 'muted'}>
                    Web {settings.webAccess ? 'On' : 'Off'}
                  </StatusPill>
                  <StatusPill tone={backupStatus.connected ? 'success' : backupStatus.oauthConfigured ? 'warning' : 'muted'}>
                    Drive {backupStatus.connected ? 'Connected' : backupStatus.oauthConfigured ? 'Ready' : 'Not Set'}
                  </StatusPill>
                  <StatusPill tone={settings.autoStart ? 'success' : 'muted'}>
                    Auto Start {settings.autoStart ? 'On' : 'Off'}
                  </StatusPill>
                  <StatusPill tone={settings.uptimeKuma?.enabled !== false ? 'success' : 'muted'}>
                    Uptime {settings.uptimeKuma?.enabled !== false ? 'On' : 'Off'}
                  </StatusPill>
                </div>
              </div>
            </div>

            <div className="space-y-5">
          
              <SectionCard
                id="system-stats"
                icon={MdMemory}
                title="System Stats"
                description="Choose which live system metrics appear in DeskMaster and the tray."
              >
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
              </SectionCard>

              <SectionCard
                id="world-clocks"
                icon={MdAccessTime}
                title="World Clocks"
                description="Set display formats and manage the timezones shown in the app and tray."
              >
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
                    type="button"
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
                        type="button"
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
              </SectionCard>

              <SectionCard
                id="system-behavior"
                icon={MdPowerSettingsNew}
                title="System"
                description="Control startup behavior, browser access, and macOS dock visibility."
              >
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
                    type="button"
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
              </SectionCard>

              <SectionCard
                id="appearance"
                icon={MdPalette}
                title="Appearance"
                description="Choose the app theme used across DeskMaster."
              >
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
              </SectionCard>

              <SectionCard
                id="api-keys"
                icon={MdSettings}
                title="API Keys"
                description="Store service keys used by built-in productivity tools."
              >
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
              </SectionCard>

              <SectionCard
                id="uptime-kuma"
                icon={MdNetworkCheck}
                title="Uptime Kuma"
                description="Connect DeskMaster to your Uptime Kuma instance using URL, username, and password."
              >
            <div className="space-y-3">
              <ToggleSwitch
                enabled={settings.uptimeKuma?.enabled !== false}
                onChange={() => updateUptimeKumaSettings({ enabled: settings.uptimeKuma?.enabled === false })}
                label="Enable Uptime Kuma"
                description="Show the Uptime tab, home stats, and tray alerts. Your URL and credentials are kept when disabled."
              />

              <div className="space-y-3 rounded border border-theme bg-theme-secondary px-3 py-3">
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
              </SectionCard>

              <SectionCard
                id="data-management"
                icon={MdStorage}
                title="Data Management"
                description="Export, import, or reset DeskMaster data with authentication prompts."
              >
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-xs"
              >
                <MdFileDownload className="w-4 h-4" />
                {isExporting ? 'Exporting...' : 'Export All Data'}
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-xs"
              >
                <MdFileUpload className="w-4 h-4" />
                {isImporting ? 'Importing...' : 'Import Data'}
              </button>
              <button
                type="button"
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
              </SectionCard>

              <SectionCard
                id="cloud-backup"
                icon={MdFileUpload}
                title="Cloud Backup"
                description="Back up DeskMaster data to Google Drive and keep the latest backup history."
              >

            <div className="space-y-2">
                <div className="text-theme-muted text-xs">
                  Stores backups in a Google Drive folder named <span className="text-theme-primary font-medium">DeskMaster Backups</span>, keeping the last {backupStatus.keepLast || 10}.
                </div>

                <div className="space-y-2 rounded border border-theme bg-theme-secondary px-3 py-2">
                  <div>
                    <label className="block text-xs font-medium text-theme-primary mb-1">
                      Google OAuth Client ID
                    </label>
                    <input
                      type="text"
                      value={settings.cloudBackup?.clientId || ''}
                      onChange={(e) => updateBackupSettings({ clientId: e.target.value })}
                      placeholder="Google OAuth client ID"
                      className="w-full px-2 py-1.5 bg-theme-card border border-theme rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-theme-primary mb-1">
                      Google OAuth Client Secret
                    </label>
                    <div className="relative">
                      <input
                        type={showDriveClientSecret ? "text" : "password"}
                        value={settings.cloudBackup?.clientSecret || ''}
                        onChange={(e) => updateBackupSettings({ clientSecret: e.target.value })}
                        placeholder="Google OAuth client secret"
                        className="w-full px-2 py-1.5 pr-8 bg-theme-card border border-theme rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowDriveClientSecret(!showDriveClientSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary transition-colors"
                        title={showDriveClientSecret ? "Hide password" : "Show password"}
                      >
                        {showDriveClientSecret ? (
                          <MdVisibilityOff className="w-4 h-4" />
                        ) : (
                          <MdVisibility className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="text-theme-muted text-xs mt-1">
                      Required in installed builds because release apps cannot read your development .env file.
                    </div>
                    <div className="text-theme-muted text-xs mt-2">
                      In Google Cloud Console, add this redirect URI to your OAuth Web client:
                      <span className="block mt-1 font-mono text-theme-primary break-all">http://127.0.0.1:8765/oauth2callback</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded border border-theme bg-theme-secondary px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-theme-primary text-xs font-medium">Connection</div>
                    <div className="text-theme-muted text-xs truncate">
                      {backupStatus.connected ? 'Connected' : backupStatus.oauthConfigured ? 'Not connected' : 'Add OAuth credentials first'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!backupStatus.connected ? (
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-xs disabled:opacity-60"
                        disabled={isConnectingDrive || !backupStatus.oauthConfigured}
                        title={!backupStatus.oauthConfigured ? 'Add Google OAuth Client ID and Client Secret first' : ''}
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
                        type="button"
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
                    type="button"
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
                    type="button"
                    className="flex-1 px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-xs disabled:opacity-60"
                    disabled={!backupStatus.connected || isBackingUpNow}
                    onClick={async () => {
                      setIsBackingUpNow(true);
                      try {
                        const result = await ipcRenderer.invoke('gdrive:backup-now');
                        await loadBackupStatus();
                        if (!result?.success && result?.error) {
                          alert(result.error);
                        }
                      } catch (e) {
                        await loadBackupStatus();
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
                    <div className="text-red-500 mt-1">
                      Error: {backupStatus.lastBackupError || 'Unknown error'}
                      {!backupStatus.connected && backupStatus.lastBackupError?.toLowerCase().includes('session expired') ? (
                        <div className="text-theme-muted mt-1">Connection was cleared. Click Connect after verifying your OAuth credentials and redirect URI.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              </SectionCard>

            </div>
          </div>
        </main>
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
                type="button"
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
                  type="button"
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
                  type="button"
                  onClick={saveTimezone}
                  disabled={!selectedTimezone || !timezoneLabel.trim()}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200"
                >
                  {editingTimezone ? 'Update' : 'Add'}
                </button>
                <button
                  type="button"
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
