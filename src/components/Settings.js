import React, { useState, useEffect } from 'react';
import { MdSettings, MdMemory, MdStorage, MdNetworkCheck, MdBatteryFull, MdAccessTime, MdPowerSettingsNew, MdPalette } from 'react-icons/md';
import TimezoneDropdown from './TimezoneDropdown';

const { ipcRenderer } = window.require('electron');

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
    theme: 'system'
  });

  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [editingTimezone, setEditingTimezone] = useState(null); // null for add, timezone object for edit
  const [selectedTimezone, setSelectedTimezone] = useState(null);
  const [timezoneLabel, setTimezoneLabel] = useState('');

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
    setShowTimezoneModal(true);
  };

  const openEditTimezoneModal = (timezone) => {
    setEditingTimezone(timezone);
    setSelectedTimezone(timezone.timezone);
    setTimezoneLabel(timezone.label);
    setShowTimezoneModal(true);
  };

  const closeTimezoneModal = () => {
    setShowTimezoneModal(false);
    setEditingTimezone(null);
    setSelectedTimezone(null);
    setTimezoneLabel('');
  };

  const saveTimezone = () => {
    if (selectedTimezone && timezoneLabel.trim()) {
      if (editingTimezone) {
        // Edit existing timezone
        const newSettings = {
          ...settings,
          timezones: settings.timezones.map(tz => 
            tz.id === editingTimezone.id 
              ? { ...tz, label: timezoneLabel.trim(), timezone: selectedTimezone }
              : tz
          )
        };
        updateSettings(newSettings);
      } else {
        // Add new timezone
        const newTimezone = {
          id: Date.now(),
          label: timezoneLabel.trim(),
          timezone: selectedTimezone
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


  const ToggleSwitch = ({ enabled, onChange, label, description }) => (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <div className="text-theme-primary font-medium text-sm">{label}</div>
        {description && <div className="text-theme-muted text-xs mt-0.5">{description}</div>}
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
          enabled ? 'bg-red-500' : 'bg-theme-secondary'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );

  const SelectOption = ({ value, onChange, options, label, description }) => (
    <div className="py-2">
      <div className="mb-2">
        <div className="text-theme-primary font-medium text-sm">{label}</div>
        {description && <div className="text-theme-muted text-xs mt-0.5">{description}</div>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded-md text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
    <div className="h-full flex flex-col bg-theme-primary overflow-y-auto p-3">
      
      <div className="flex-1 p-6 mx-auto w-full">
        {/* System Stats */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <MdMemory className="w-5 h-5 text-theme-muted" />
            <h2 className="text-xl font-semibold text-theme-primary">System Stats</h2>
          </div>
          <div className="border-b border-theme mb-4"></div>
          <div className="space-y-0">
            <ToggleSwitch
              enabled={settings.stats.cpu}
              onChange={() => toggleStat('cpu')}
              label="CPU Usage"
              description="Show CPU usage in tray and stats"
            />
            <ToggleSwitch
              enabled={settings.stats.ram}
              onChange={() => toggleStat('ram')}
              label="Memory Usage"
              description="Show RAM usage in tray and stats"
            />
            <ToggleSwitch
              enabled={settings.stats.disk}
              onChange={() => toggleStat('disk')}
              label="Storage Usage"
              description="Show disk usage in tray and stats"
            />
            <ToggleSwitch
              enabled={settings.stats.network}
              onChange={() => toggleStat('network')}
              label="Network Activity"
              description="Show network stats in tray and stats"
            />
            <ToggleSwitch
              enabled={settings.stats.battery}
              onChange={() => toggleStat('battery')}
              label="Battery Status"
              description="Show battery info in tray and stats"
            />
          </div>
        </div>

        {/* Timezones */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <MdAccessTime className="w-5 h-5 text-theme-muted" />
            <h2 className="text-xl font-semibold text-theme-primary">World Clocks</h2>
          </div>
          <div className="border-b border-theme mb-4"></div>
          <div className="space-y-4">
            <SelectOption
              value={settings.datetimeFormat}
              onChange={updateDatetimeFormat}
              options={datetimeFormats}
              label="Time Format"
              description="Choose how time is displayed in tray and world clocks"
            />
            
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-theme-primary font-medium">Timezones</div>
                <button
                  onClick={openAddTimezoneModal}
                  className="flex items-center justify-center w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm font-bold transition-colors duration-200"
                >
                  +
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {settings.timezones.map((tz) => (
                  <div key={tz.id} className="flex items-center gap-2 bg-theme-secondary rounded-full px-3 py-1.5 text-sm cursor-pointer hover:bg-theme-card-hover transition-colors duration-200">
                    <span 
                      className="text-theme-primary font-medium"
                      onClick={() => openEditTimezoneModal(tz)}
                    >
                      {tz.label} ({tz.timezone})
                    </span>
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

        {/* System */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <MdPowerSettingsNew className="w-5 h-5 text-theme-muted" />
            <h2 className="text-xl font-semibold text-theme-primary">System</h2>
          </div>
          <div className="border-b border-theme mb-4"></div>
          <ToggleSwitch
            enabled={settings.autoStart}
            onChange={toggleAutoStart}
            label="Start with System"
            description="Automatically start DeskMaster when your computer boots"
          />
        </div>

        {/* Appearance */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <MdPalette className="w-5 h-5 text-theme-muted" />
            <h2 className="text-xl font-semibold text-theme-primary">Appearance</h2>
          </div>
          <div className="border-b border-theme mb-4"></div>
          <SelectOption
            value={settings.theme}
            onChange={updateTheme}
            options={[
              { value: 'system', label: 'System Default' },
              { value: 'dark', label: 'Dark Mode' },
              { value: 'light', label: 'Light Mode' }
            ]}
            label="Theme"
            description="Choose your preferred color scheme"
          />
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
