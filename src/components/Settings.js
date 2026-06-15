import React, { useState, useEffect } from 'react';
import { MdSettings, MdMemory, MdStorage, MdNetworkCheck, MdBatteryFull, MdAccessTime, MdPowerSettingsNew, MdPalette, MdVisibility, MdVisibilityOff, MdFileDownload, MdFileUpload, MdDeleteForever, MdSmartToy } from 'react-icons/md';
import TimezoneDropdown from './TimezoneDropdown';
import { getIpcRenderer, isElectron } from '../utils/electron';
import { getEnabledProviders, PROVIDER_META } from '../utils/agentProvidersClient';
import { getRoute, navigate, subscribe, SETTINGS_SECTION_IDS } from '../utils/appRoute';

const ipcRenderer = getIpcRenderer();

const ToggleSwitch = ({ enabled, onChange, label, description }) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <div className="min-w-0 flex-1">
      {label && <div className="text-theme-primary text-sm">{label}</div>}
      {description && <div className="text-theme-muted text-[11px] leading-4 mt-0.5">{description}</div>}
    </div>
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        enabled ? 'bg-red-500' : 'bg-theme-secondary border border-theme-subtle'
      }`}
      aria-pressed={enabled}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

const SelectOption = ({ value, onChange, options, label, description }) => (
  <div className="py-1">
    {label && <div className="text-theme-primary text-sm mb-1">{label}</div>}
    {description && <div className="text-theme-muted text-[11px] mb-1.5">{description}</div>}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs focus:outline-none focus:ring-1 focus:ring-red-500"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </div>
);

const SecretInput = ({ value, onChange, placeholder, show, onToggleShow, mono = true }) => (
  <div className="relative">
    <input
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-2.5 py-1.5 pr-8 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs focus:outline-none focus:ring-1 focus:ring-red-500 ${mono ? 'font-mono' : ''}`}
    />
    <button
      type="button"
      onClick={onToggleShow}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary p-0.5"
      title={show ? 'Hide' : 'Show'}
    >
      {show ? <MdVisibilityOff className="w-4 h-4" /> : <MdVisibility className="w-4 h-4" />}
    </button>
  </div>
);

const FieldLabel = ({ children, hint }) => (
  <div className="mb-1">
    <label className="text-xs font-medium text-theme-primary">{children}</label>
    {hint && <div className="text-[11px] text-theme-muted mt-0.5">{hint}</div>}
  </div>
);

const ProviderBlock = ({ title, children, className = '' }) => (
  <div className={`rounded-lg border border-theme-subtle bg-theme-secondary/30 p-3 space-y-2 h-full ${className}`}>
    <div className="text-xs font-semibold text-theme-primary">{title}</div>
    {children}
  </div>
);

const SettingsPanel = ({ children, className = '' }) => (
  <div className={`rounded-lg border border-theme-subtle bg-theme-secondary/30 p-3 ${className}`}>
    {children}
  </div>
);

const ToggleCard = ({ enabled, onChange, label, description }) => (
  <SettingsPanel className="h-full">
    <ToggleSwitch enabled={enabled} onChange={onChange} label={label} description={description} />
  </SettingsPanel>
);

const SETTINGS_GRID = {
  toggles: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3',
  cards: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3',
  cardsTwo: 'grid grid-cols-1 lg:grid-cols-2 gap-3',
  fields: 'grid grid-cols-1 md:grid-cols-2 gap-3',
  fieldsThree: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3',
  actions: 'grid grid-cols-1 sm:grid-cols-3 gap-2',
  stack: 'flex flex-col gap-3'
};

const StatusPill = ({ tone = 'muted', children }) => {
  const toneClass = tone === 'success'
    ? 'border-green-500/30 bg-green-500/10 text-green-500'
    : tone === 'warning'
      ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500'
      : tone === 'danger'
        ? 'border-red-500/30 bg-red-500/10 text-red-500'
        : 'border-theme-subtle bg-theme-secondary text-theme-muted';

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
  const [showIPLocationKey, setShowIPLocationKey] = useState(false);
  const [showUptimePassword, setShowUptimePassword] = useState(false);
  const [showDriveClientSecret, setShowDriveClientSecret] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [backupStatus, setBackupStatus] = useState({ connected: false, enabled: false, intervalHours: 4, keepLast: 10, oauthConfigured: false, lastBackupAt: null, lastBackupStatus: null, lastBackupError: null, running: false });
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isBackingUpNow, setIsBackingUpNow] = useState(false);
  const [agentTestResult, setAgentTestResult] = useState(null);
  const [agentTesting, setAgentTesting] = useState(false);
  const [composioToolkits, setComposioToolkits] = useState([]);
  const [connectingComposioSlug, setConnectingComposioSlug] = useState(null);
  const [newToolkitSlug, setNewToolkitSlug] = useState('');
  const [showAgentKeys, setShowAgentKeys] = useState({});
  const [activeSection, setActiveSection] = useState(() => {
    const route = getRoute();
    if (
      route.tab === 'settings' &&
      route.settingsSection &&
      SETTINGS_SECTION_IDS.includes(route.settingsSection)
    ) {
      return route.settingsSection;
    }
    return 'system-stats';
  });

  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
    navigate({ tab: 'settings', settingsSection: sectionId });
  };

  useEffect(() => {
    return subscribe(() => {
      const route = getRoute();
      if (
        route.tab === 'settings' &&
        route.settingsSection &&
        SETTINGS_SECTION_IDS.includes(route.settingsSection)
      ) {
        setActiveSection(route.settingsSection);
      }
    });
  }, []);

  const toggleAgentKeyVisibility = (key) => {
    setShowAgentKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
    loadAgentIntegrations();
    
    // Listen for settings updates
    ipcRenderer.on('settings-updated', handleSettingsUpdate);
    
    return () => {
      ipcRenderer.removeListener('settings-updated', handleSettingsUpdate);
    };
  }, []);

  const loadAgentIntegrations = async () => {
    try {
      const toolkits = await ipcRenderer.invoke('agent:composio-list-toolkits');
      setComposioToolkits(toolkits || []);
    } catch {}
  };

  const updateAgentSettings = (patch) => {
    const newSettings = {
      ...settings,
      agent: {
        ...(settings.agent || {}),
        ...patch,
        capabilities: {
          ...(settings.agent?.capabilities || {}),
          ...(patch.capabilities || {})
        },
        providers: {
          ...(settings.agent?.providers || {}),
          ...(patch.providers || {})
        },
        composio: {
          ...(settings.agent?.composio || {}),
          ...(patch.composio || {})
        },
        knowledgeBase: {
          ...(settings.agent?.knowledgeBase || {}),
          ...(patch.knowledgeBase || {})
        }
      }
    };
    if (patch.providers) {
      Object.keys(patch.providers).forEach((key) => {
        newSettings.agent.providers[key] = {
          ...(settings.agent?.providers?.[key] || {}),
          ...patch.providers[key]
        };
      });
    }
    updateSettings(newSettings);
  };

  const updateAgentProvider = (providerId, field, value) => {
    updateAgentSettings({
      providers: {
        [providerId]: {
          ...(settings.agent?.providers?.[providerId] || {}),
          [field]: value
        }
      }
    });
  };

  const testAgentProvider = async (providerId) => {
    setAgentTesting(true);
    setAgentTestResult(null);
    try {
      const result = await ipcRenderer.invoke('agent:test-provider', providerId);
      setAgentTestResult({ success: true, preview: result.preview });
    } catch (error) {
      setAgentTestResult({ success: false, error: error.message });
    } finally {
      setAgentTesting(false);
    }
  };

  const cancelComposioConnection = async (slug) => {
    try {
      await ipcRenderer.invoke('agent:composio-cancel-wait', slug);
    } catch (error) {
      console.warn('Cancel Composio connection:', error.message);
    }
    setConnectingComposioSlug((current) => (current === slug ? null : current));
  };

  const connectComposioToolkit = async (slug) => {
    if (connectingComposioSlug === slug) return;
    if (connectingComposioSlug) {
      await cancelComposioConnection(connectingComposioSlug);
    }
    setConnectingComposioSlug(slug);
    try {
      const result = await ipcRenderer.invoke('agent:composio-connect', slug);
      await ipcRenderer.invoke('agent:composio-wait', {
        toolkitSlug: slug,
        knownAccountIds: result?.knownAccountIds || [],
        connectionRequestId: result?.connectionRequestId || null
      });
      await loadAgentIntegrations();
    } catch (error) {
      if (error?.message !== 'Connection cancelled') {
        alert(`Connect failed: ${error.message}`);
      }
    } finally {
      setConnectingComposioSlug((current) => (current === slug ? null : current));
    }
  };

  const addCustomToolkit = () => {
    const slug = newToolkitSlug.trim().toLowerCase().replace(/\s+/g, '');
    if (!slug) return;
    const existing = settings.agent?.composio?.customToolkits || [];
    if (existing.includes(slug)) {
      setNewToolkitSlug('');
      return;
    }
    updateAgentSettings({ composio: { customToolkits: [...existing, slug] } });
    setNewToolkitSlug('');
    loadAgentIntegrations();
  };

  const removeCustomToolkit = (slug) => {
    if (connectingComposioSlug === slug) {
      cancelComposioConnection(slug);
    }
    const existing = settings.agent?.composio?.customToolkits || [];
    updateAgentSettings({ composio: { customToolkits: existing.filter((s) => s !== slug) } });
    loadAgentIntegrations();
  };

  const disconnectComposioToolkit = async (accountId) => {
    try {
      await ipcRenderer.invoke('agent:composio-disconnect', accountId);
      await loadAgentIntegrations();
    } catch (error) {
      alert(`Disconnect failed: ${error.message}`);
    }
  };

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
    { id: 'agent', label: 'AI Agent', icon: MdSmartToy },
    { id: 'uptime-kuma', label: 'Uptime Kuma', icon: MdNetworkCheck },
    { id: 'data-management', label: 'Data Management', icon: MdStorage },
    { id: 'cloud-backup', label: 'Cloud Backup', icon: MdFileUpload }
  ];

  const activeSectionMeta = settingsSections.find((s) => s.id === activeSection) || settingsSections[0];

  return (
    <div className="h-full bg-theme-primary overflow-hidden">
      <div className="flex h-full min-h-0">
        <aside className="w-52 shrink-0 border-r border-theme-subtle bg-theme-card/50 p-3">
          <div className="mb-3 px-1">
            <div className="text-sm font-semibold text-theme-primary">Settings</div>
          </div>
          <nav className="space-y-0.5">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => handleSectionChange(section.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-red-500/10 text-red-500 font-medium'
                      : 'text-theme-muted hover:bg-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="w-full px-5 py-4 lg:px-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-theme-subtle pb-3">
              <div>
                <h2 className="text-base font-semibold text-theme-primary">{activeSectionMeta.label}</h2>
                <p className="text-[11px] text-theme-muted mt-0.5">
                  {activeSection === 'system-stats' && 'Tray and dashboard metrics'}
                  {activeSection === 'world-clocks' && 'Timezones and display format'}
                  {activeSection === 'system-behavior' && 'Startup, web access, dock'}
                  {activeSection === 'appearance' && 'Theme preferences'}
                  {activeSection === 'api-keys' && 'Keys for built-in tools'}
                  {activeSection === 'agent' && 'LLM providers and Composio OAuth'}
                  {activeSection === 'uptime-kuma' && 'Monitor connection'}
                  {activeSection === 'data-management' && 'Export, import, reset'}
                  {activeSection === 'cloud-backup' && 'Google Drive backups'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StatusPill tone={settings.webAccess ? 'success' : 'muted'}>Web {settings.webAccess ? 'On' : 'Off'}</StatusPill>
                {activeSection === 'cloud-backup' && (
                  <StatusPill tone={backupStatus.connected ? 'success' : backupStatus.oauthConfigured ? 'warning' : 'muted'}>
                    Drive {backupStatus.connected ? 'OK' : '—'}
                  </StatusPill>
                )}
              </div>
            </div>

            <div className="space-y-3">
          
              {activeSection === 'system-stats' && (
              <div className={SETTINGS_GRID.toggles}>
              <ToggleCard
                enabled={settings.stats.cpu}
                onChange={() => toggleStat('cpu')}
                label="CPU Usage"
                description="Show in tray"
              />
              <ToggleCard
                enabled={settings.stats.ram}
                onChange={() => toggleStat('ram')}
                label="Memory Usage"
                description="Show in tray"
              />
              <ToggleCard
                enabled={settings.stats.disk}
                onChange={() => toggleStat('disk')}
                label="Storage Usage"
                description="Show in tray"
              />
              <ToggleCard
                enabled={settings.stats.network}
                onChange={() => toggleStat('network')}
                label="Network Activity"
                description="Show in tray"
              />
              <ToggleCard
                enabled={settings.stats.battery}
                onChange={() => toggleStat('battery')}
                label="Battery Status"
                description="Show in tray"
              />
            </div>
              )}

              {activeSection === 'world-clocks' && (
            <div className={SETTINGS_GRID.stack}>
              <div className={SETTINGS_GRID.cardsTwo}>
                <SettingsPanel>
                  <SelectOption
                    value={settings.datetimeFormat}
                    onChange={updateDatetimeFormat}
                    options={datetimeFormats}
                    label="Time Format"
                    description="Display format"
                  />
                </SettingsPanel>
              </div>
              
              <SettingsPanel>
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
              </SettingsPanel>
            </div>
              )}

              {activeSection === 'system-behavior' && (
            <div className={SETTINGS_GRID.stack}>
              <div className={SETTINGS_GRID.toggles}>
              <ToggleCard
                enabled={settings.autoStart}
                onChange={toggleAutoStart}
                label="Start with System"
                description="Auto-start on boot"
              />
              <ToggleCard
                enabled={settings.webAccess}
                onChange={toggleWebAccess}
                label="Web Access"
                description="Enable browser access"
              />
              {isElectron() && (
                <ToggleCard
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
              {settings.webAccess && (
                <SettingsPanel>
                  <div className="text-xs text-theme-muted mb-1">Web URL</div>
                  <button
                    type="button"
                    onClick={openWebUrl}
                    className="text-xs text-red-500 hover:text-red-400 underline break-all text-left transition-colors duration-200"
                    title="Click to open in browser"
                  >
                    http://localhost:65530
                  </button>
                </SettingsPanel>
              )}
            </div>
              )}

              {activeSection === 'appearance' && (
            <div className={SETTINGS_GRID.cardsTwo}>
              <SettingsPanel>
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
              </SettingsPanel>
            </div>
              )}

              {activeSection === 'api-keys' && (
            <div className={SETTINGS_GRID.fields}>
              <SettingsPanel>
                <FieldLabel hint="For IP location lookup tool">IP Location API Key</FieldLabel>
                <SecretInput
                  value={settings.apiKeys?.ipLocation || ''}
                  onChange={(e) => updateSettings({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, ipLocation: e.target.value }
                  })}
                  placeholder="API key..."
                  show={showIPLocationKey}
                  onToggleShow={() => setShowIPLocationKey(!showIPLocationKey)}
                />
              </SettingsPanel>
            </div>
              )}

              {activeSection === 'agent' && (
                <div className={SETTINGS_GRID.stack}>
                  <div className={SETTINGS_GRID.cardsTwo}>
                    <SettingsPanel>
                      <SelectOption
                        value={settings.agent?.defaultProvider || 'openai'}
                        onChange={(value) => updateAgentSettings({ defaultProvider: value })}
                        options={getEnabledProviders(settings).length > 0
                          ? getEnabledProviders(settings).map((id) => ({ value: id, label: PROVIDER_META[id]?.label || id }))
                          : [{ value: 'openai', label: 'Add credentials below' }]}
                        label="Default Provider"
                        description="Configured providers with credentials appear in Agent"
                      />
                    </SettingsPanel>
                    <SettingsPanel>
                      <div className="text-xs font-semibold text-theme-primary mb-2">Default chat capabilities</div>
                      <ToggleSwitch
                        enabled={settings.agent?.capabilities?.knowledgeBase === true}
                        onChange={() => updateAgentSettings({
                          capabilities: { knowledgeBase: settings.agent?.capabilities?.knowledgeBase !== true }
                        })}
                        label="Knowledge Base"
                        description="Notes + custom doc search"
                      />
                      <ToggleSwitch
                        enabled={settings.agent?.capabilities?.deskMasterTools === true}
                        onChange={() => updateAgentSettings({
                          capabilities: { deskMasterTools: settings.agent?.capabilities?.deskMasterTools !== true }
                        })}
                        label="DeskMaster Tools"
                        description="Excludes clipboard and authenticator"
                      />
                      <ToggleSwitch
                        enabled={settings.agent?.capabilities?.composioIntegrations === true}
                        onChange={() => updateAgentSettings({
                          capabilities: { composioIntegrations: settings.agent?.capabilities?.composioIntegrations !== true }
                        })}
                        label="Composio Integrations"
                        description="External OAuth toolkits"
                      />
                    </SettingsPanel>
                  </div>

                  <div className={SETTINGS_GRID.cards}>
                  <ProviderBlock title="OpenAI">
                    <SecretInput
                      value={settings.agent?.providers?.openai?.apiKey || ''}
                      onChange={(e) => updateAgentProvider('openai', 'apiKey', e.target.value)}
                      placeholder="API key (sk-...)"
                      show={showAgentKeys.openai}
                      onToggleShow={() => toggleAgentKeyVisibility('openai')}
                    />
                    <input
                      type="text"
                      value={settings.agent?.providers?.openai?.model || 'gpt-4o-mini'}
                      onChange={(e) => updateAgentProvider('openai', 'model', e.target.value)}
                      placeholder="Model"
                      className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                    />
                  </ProviderBlock>

                  <ProviderBlock title="Anthropic">
                    <SecretInput
                      value={settings.agent?.providers?.anthropic?.apiKey || ''}
                      onChange={(e) => updateAgentProvider('anthropic', 'apiKey', e.target.value)}
                      placeholder="API key"
                      show={showAgentKeys.anthropic}
                      onToggleShow={() => toggleAgentKeyVisibility('anthropic')}
                    />
                    <input
                      type="text"
                      value={settings.agent?.providers?.anthropic?.model || ''}
                      onChange={(e) => updateAgentProvider('anthropic', 'model', e.target.value)}
                      placeholder="Model"
                      className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                    />
                  </ProviderBlock>

                  <ProviderBlock title="OpenRouter">
                    <SecretInput
                      value={settings.agent?.providers?.openrouter?.apiKey || ''}
                      onChange={(e) => updateAgentProvider('openrouter', 'apiKey', e.target.value)}
                      placeholder="API key"
                      show={showAgentKeys.openrouter}
                      onToggleShow={() => toggleAgentKeyVisibility('openrouter')}
                    />
                    <input
                      type="text"
                      value={settings.agent?.providers?.openrouter?.model || ''}
                      onChange={(e) => updateAgentProvider('openrouter', 'model', e.target.value)}
                      placeholder="Model (e.g. openai/gpt-4o-mini)"
                      className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                    />
                  </ProviderBlock>

                  <ProviderBlock title="Google Gemini">
                    <SecretInput
                      value={settings.agent?.providers?.gemini?.apiKey || ''}
                      onChange={(e) => updateAgentProvider('gemini', 'apiKey', e.target.value)}
                      placeholder="API key"
                      show={showAgentKeys.gemini}
                      onToggleShow={() => toggleAgentKeyVisibility('gemini')}
                    />
                    <input
                      type="text"
                      value={settings.agent?.providers?.gemini?.model || 'gemini-2.0-flash'}
                      onChange={(e) => updateAgentProvider('gemini', 'model', e.target.value)}
                      placeholder="Model (e.g. gemini-2.0-flash)"
                      className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                    />
                  </ProviderBlock>

                  <ProviderBlock title="AWS Bedrock">
                    <input
                      type="text"
                      value={settings.agent?.providers?.bedrock?.accessKeyId || ''}
                      onChange={(e) => updateAgentProvider('bedrock', 'accessKeyId', e.target.value)}
                      placeholder="Access Key ID"
                      className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                    />
                    <SecretInput
                      value={settings.agent?.providers?.bedrock?.secretAccessKey || ''}
                      onChange={(e) => updateAgentProvider('bedrock', 'secretAccessKey', e.target.value)}
                      placeholder="Secret Access Key"
                      show={showAgentKeys.bedrock}
                      onToggleShow={() => toggleAgentKeyVisibility('bedrock')}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={settings.agent?.providers?.bedrock?.region || 'us-east-1'}
                        onChange={(e) => updateAgentProvider('bedrock', 'region', e.target.value)}
                        placeholder="Region"
                        className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={settings.agent?.providers?.bedrock?.model || ''}
                        onChange={(e) => updateAgentProvider('bedrock', 'model', e.target.value)}
                        placeholder="Model ID"
                        className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                      />
                    </div>
                  </ProviderBlock>

                  <ProviderBlock title="Local Server (Ollama / LM Studio)">
                    <input
                      type="text"
                      value={settings.agent?.providers?.local?.baseUrl || 'http://127.0.0.1:11434/v1'}
                      onChange={(e) => updateAgentProvider('local', 'baseUrl', e.target.value)}
                      placeholder="Base URL"
                      className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                    />
                    <input
                      type="text"
                      value={settings.agent?.providers?.local?.model || 'llama3.2'}
                      onChange={(e) => updateAgentProvider('local', 'model', e.target.value)}
                      placeholder="Model name"
                      className="w-full px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                    />
                  </ProviderBlock>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={agentTesting}
                      onClick={() => testAgentProvider(settings.agent?.defaultProvider || 'openai')}
                      className="btn btn-secondary text-xs py-1.5"
                    >
                      {agentTesting ? 'Testing…' : 'Test default provider'}
                    </button>
                    {agentTestResult && (
                      <StatusPill tone={agentTestResult.success ? 'success' : 'danger'}>
                        {agentTestResult.success ? `OK: ${agentTestResult.preview}` : agentTestResult.error}
                      </StatusPill>
                    )}
                  </div>

                  <ProviderBlock title="Composio" className="xl:col-span-2">
                    <FieldLabel hint="From composio.com dashboard">API key</FieldLabel>
                    <SecretInput
                      value={settings.agent?.composio?.apiKey || ''}
                      onChange={(e) => updateAgentSettings({ composio: { apiKey: e.target.value } })}
                      placeholder="Composio API key"
                      show={showAgentKeys.composio}
                      onToggleShow={() => toggleAgentKeyVisibility('composio')}
                    />
                    <div className={SETTINGS_GRID.fields}>
                      <div>
                        <FieldLabel hint="OAuth2 toolkit slug (e.g. github, gmail, slack)">Add toolkit</FieldLabel>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newToolkitSlug}
                            onChange={(e) => setNewToolkitSlug(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addCustomToolkit()}
                            placeholder="toolkit slug"
                            className="flex-1 px-2.5 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono"
                          />
                          <button type="button" onClick={addCustomToolkit} className="btn btn-secondary text-xs px-3">Add</button>
                        </div>
                      </div>
                    </div>
                    {composioToolkits.length === 0 && (
                      <p className="text-[11px] text-theme-muted">No toolkits added. Enter a Composio toolkit slug above.</p>
                    )}
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,280px))]">
                      {composioToolkits.map((t) => (
                        <div key={t.slug} className="rounded-md border border-theme-subtle bg-theme-secondary/40 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2 min-h-[2rem]">
                            <span className="text-xs font-mono text-theme-primary truncate">{t.slug}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {connectingComposioSlug === t.slug ? (
                                <button
                                  type="button"
                                  onClick={() => cancelComposioConnection(t.slug)}
                                  className="text-[10px] text-theme-muted hover:text-red-400 inline-flex items-center gap-1"
                                >
                                  <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => connectComposioToolkit(t.slug)}
                                  className="text-[10px] text-red-500 hover:text-red-400"
                                >
                                  {t.accounts?.length ? '+ Add account' : 'Connect'}
                                </button>
                              )}
                              <button type="button" onClick={() => removeCustomToolkit(t.slug)} className="text-[10px] text-theme-muted hover:text-red-400">Remove</button>
                            </div>
                          </div>
                          {t.accounts?.length > 0 ? (
                            <div className="mt-2 space-y-1 border-t border-theme-subtle pt-2">
                              {t.accounts.map((account) => (
                                <div key={account.id} className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-[11px] text-green-500 truncate">{account.label}</div>
                                    {account.alias && account.alias !== account.label && (
                                      <div className="text-[10px] text-theme-muted truncate">{account.alias}</div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => disconnectComposioToolkit(account.id)}
                                    className="text-[10px] text-theme-muted hover:text-red-400 shrink-0"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-[10px] text-theme-muted">No accounts connected</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ProviderBlock>
                </div>
              )}

              {activeSection === 'uptime-kuma' && (
            <div className={SETTINGS_GRID.stack}>
              <ToggleCard
                enabled={settings.uptimeKuma?.enabled !== false}
                onChange={() => updateUptimeKumaSettings({ enabled: settings.uptimeKuma?.enabled === false })}
                label="Enable Uptime Kuma"
                description="Show the Uptime tab, home stats, and tray alerts"
              />

              <SettingsPanel>
              <div className={SETTINGS_GRID.fields}>
              <div>
                <FieldLabel hint="Used by the Uptime tab">Uptime Kuma URL</FieldLabel>
                <input
                  type="url"
                  value={settings.uptimeKuma?.url || ''}
                  onChange={(e) => updateUptimeKumaSettings({ url: e.target.value })}
                  placeholder="https://uptime-kuma.example.com"
                  className="w-full px-2 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <FieldLabel>Username</FieldLabel>
                <input
                  type="text"
                  value={settings.uptimeKuma?.username || ''}
                  onChange={(e) => updateUptimeKumaSettings({ username: e.target.value })}
                  placeholder="Uptime Kuma username"
                  className="w-full px-2 py-1.5 bg-theme-secondary border border-theme-subtle rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel hint="Token authentication is not used">Password</FieldLabel>
                <SecretInput
                  value={settings.uptimeKuma?.password || ''}
                  onChange={(e) => updateUptimeKumaSettings({ password: e.target.value })}
                  placeholder="Uptime Kuma password"
                  show={showUptimePassword}
                  onToggleShow={() => setShowUptimePassword(!showUptimePassword)}
                />
              </div>
              </div>
              </SettingsPanel>
            </div>
              )}

              {activeSection === 'data-management' && (
            <div className={SETTINGS_GRID.stack}>
              <div className={SETTINGS_GRID.actions}>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-xs"
              >
                <MdFileDownload className="w-4 h-4" />
                {isExporting ? 'Exporting...' : 'Export All Data'}
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-xs"
              >
                <MdFileUpload className="w-4 h-4" />
                {isImporting ? 'Importing...' : 'Import Data'}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-theme-secondary disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-xs"
              >
                <MdDeleteForever className="w-4 h-4" />
                {isResetting ? 'Resetting...' : 'Reset All Data'}
              </button>
              </div>
              <SettingsPanel>
              <div className="text-theme-muted text-xs space-y-1">
                <p>Export: Save all settings, authenticators, and clipboard history to a file (optional encryption).</p>
                <p>Import: Restore data from an exported file (replaces current data).</p>
                <p>Reset: Permanently delete all data and restore defaults.</p>
              </div>
              </SettingsPanel>
            </div>
              )}

              {activeSection === 'cloud-backup' && (
            <div className={SETTINGS_GRID.stack}>
                <SettingsPanel>
                <div className="text-theme-muted text-xs">
                  Stores backups in a Google Drive folder named <span className="text-theme-primary font-medium">DeskMaster Backups</span>. Retention: all backups from the last 12 hours, 3 per day for the past week, 1 per day for the past month (older backups are removed).
                </div>
                </SettingsPanel>

                <SettingsPanel>
                <div className={SETTINGS_GRID.fields}>
                  <div>
                    <FieldLabel>Google OAuth Client ID</FieldLabel>
                    <input
                      type="text"
                      value={settings.cloudBackup?.clientId || ''}
                      onChange={(e) => updateBackupSettings({ clientId: e.target.value })}
                      placeholder="Google OAuth client ID"
                      className="w-full px-2 py-1.5 bg-theme-card border border-theme-subtle rounded-md text-theme-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>Google OAuth Client Secret</FieldLabel>
                    <SecretInput
                      value={settings.cloudBackup?.clientSecret || ''}
                      onChange={(e) => updateBackupSettings({ clientSecret: e.target.value })}
                      placeholder="Google OAuth client secret"
                      show={showDriveClientSecret}
                      onToggleShow={() => setShowDriveClientSecret(!showDriveClientSecret)}
                    />
                    <div className="text-theme-muted text-xs mt-1">
                      Required in installed builds because release apps cannot read your development .env file.
                    </div>
                    <div className="text-theme-muted text-xs mt-2">
                      Redirect URI for Google Cloud OAuth Web client:
                      <span className="block mt-1 font-mono text-theme-primary break-all">http://127.0.0.1:8765/oauth2callback</span>
                    </div>
                  </div>
                </div>
                </SettingsPanel>

                <div className={SETTINGS_GRID.cardsTwo}>
                <SettingsPanel className="flex items-center justify-between gap-3">
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
                        className="px-3 py-1.5 rounded-md bg-theme-secondary hover:bg-theme-card-hover border border-theme-subtle text-theme-primary text-xs"
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
                </SettingsPanel>

                <SettingsPanel className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-theme-primary text-xs font-medium">Automatic backup</div>
                    <div className="text-theme-muted text-xs truncate">Every {settings.cloudBackup?.intervalHours || 4} hours</div>
                  </div>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-md text-xs shrink-0 ${settings.cloudBackup?.enabled ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-theme-secondary hover:bg-theme-card-hover border border-theme-subtle text-theme-primary'}`}
                    disabled={!backupStatus.connected}
                    onClick={() => updateBackupSettings({ enabled: !settings.cloudBackup?.enabled })}
                    title={!backupStatus.connected ? 'Connect Google Drive first' : ''}
                  >
                    {settings.cloudBackup?.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </SettingsPanel>
                </div>

                <div className={SETTINGS_GRID.cardsTwo}>
                <SettingsPanel>
                <SelectOption
                  value={String(settings.cloudBackup?.intervalHours || 4)}
                  onChange={(v) => updateBackupSettings({ intervalHours: Number(v) || 4 })}
                  options={[
                    { value: '1', label: 'Every 1 hour' },
                    { value: '3', label: 'Every 3 hours' },
                    { value: '4', label: 'Every 4 hours' }
                  ]}
                  label="Backup frequency"
                  description="Runs in background when DeskMaster is open"
                />
                </SettingsPanel>
                <SettingsPanel className="flex items-center justify-center">
                  <button
                    type="button"
                    className="w-full px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-xs disabled:opacity-60"
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
                </SettingsPanel>
                </div>

                <SettingsPanel>
                <div className="text-theme-muted text-xs space-y-1">
                  <div>Last backup: {backupStatus.lastBackupAt ? new Date(backupStatus.lastBackupAt).toLocaleString() : 'Never'}</div>
                  {backupStatus.lastBackupStatus === 'error' ? (
                    <div className="text-red-500">
                      Error: {backupStatus.lastBackupError || 'Unknown error'}
                      {!backupStatus.connected && backupStatus.lastBackupError?.toLowerCase().includes('session expired') ? (
                        <div className="text-theme-muted mt-1">Connection was cleared. Click Connect after verifying your OAuth credentials and redirect URI.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                </SettingsPanel>
            </div>
              )}

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
                  className="w-full px-3 py-2 bg-theme-primary border border-theme-subtle rounded-md text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
