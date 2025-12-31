import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import TimeZoneClock from './TimeZoneClock';
import HorizontalTimeline from './HorizontalTimeline';
import { getIpcRenderer } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

const TimezoneManager = () => {
  const [timezones, setTimezones] = useState([]);
  const [settings, setSettings] = useState({
    timezones: [],
    datetimeFormat: 'HH:mm:ss'
  });
  const [updateInterval, setUpdateInterval] = useState(null);
  const [timeOffset, setTimeOffset] = useState(0); // Offset in minutes
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Request initial settings to get timezones immediately
    const loadInitialData = async () => {
      try {
        const currentSettings = await ipcRenderer.invoke('get-settings');
        if (currentSettings) {
          if (currentSettings.timezones) {
            setTimezones(currentSettings.timezones);
            setIsLoading(false);
          }
          if (currentSettings.datetimeFormat) {
            setSettings(prev => ({
              ...prev,
              datetimeFormat: currentSettings.datetimeFormat
            }));
          }
        }
      } catch (error) {
        console.error('Error loading initial timezone data:', error);
        setIsLoading(false);
      }
    };

    // Load initial data immediately
    loadInitialData();

    // Listen for timezone updates
    const handleTimezoneUpdate = (event, data) => {
      if (data && data.timezones) {
        setTimezones(data.timezones);
        setIsLoading(false);
      }
      if (data && data.settings) {
        setSettings(prev => ({
          ...prev,
          datetimeFormat: data.settings.datetimeFormat || prev.datetimeFormat
        }));
      }
    };

    // Listen for settings updates (for format changes)
    const handleSettingsUpdate = (event, newSettings) => {
      if (newSettings) {
        setSettings(prev => ({
          ...prev,
          datetimeFormat: newSettings.datetimeFormat || prev.datetimeFormat
        }));
        // Update timezones if they changed
        if (newSettings.timezones) {
          setTimezones(newSettings.timezones);
          setIsLoading(false);
        }
      }
    };

    ipcRenderer.on('detailed-stats-update', handleTimezoneUpdate);
    ipcRenderer.on('settings-updated', handleSettingsUpdate);

    // Start time updates
    startTimeUpdates();

    return () => {
      ipcRenderer.removeListener('detailed-stats-update', handleTimezoneUpdate);
      ipcRenderer.removeListener('settings-updated', handleSettingsUpdate);
      stopTimeUpdates();
    };
  }, []);


  const startTimeUpdates = () => {
    const interval = setInterval(() => {
      // Only update if offset is 0 (current time)
      if (timeOffset === 0) {
        // Force re-render to update times
        setTimezones(prev => [...prev]);
      }
    }, 1000);
    setUpdateInterval(interval);
  };

  const stopTimeUpdates = () => {
    if (updateInterval) {
      clearInterval(updateInterval);
      setUpdateInterval(null);
    }
  };


  const formatDateTime = (timezone) => {
    try {
      const momentTime = moment().add(timeOffset, 'minutes').tz(timezone);
      return momentTime.format('MMM DD, ' + settings.datetimeFormat);
    } catch (error) {
      console.warn(`Failed to format datetime for ${timezone}:`, error);
      return 'Invalid';
    }
  };


  // Convert configured timezones to display format
  const displayTimezones = timezones.map(tz => ({
    city: tz.label,
    timezone: tz.timezone,
    baseOffset: 0 // Will be calculated based on timezone
  }));

  const handleTimeOffsetChange = (offsetMinutes) => {
    setTimeOffset(offsetMinutes);
  };

  const handleDateTimeChange = (offsetMinutes) => {
    setTimeOffset(offsetMinutes);
  };

  return (
    <div className="h-full flex flex-col bg-theme-primary">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* World Clocks Section */}
        <div className="flex-1 px-4 py-3 overflow-y-auto">
          <h1 className="text-2xl font-bold text-theme-primary mb-4">World Clocks</h1>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary mx-auto mb-4"></div>
                <p className="text-theme-muted">Loading timezones...</p>
              </div>
            </div>
          ) : timezones.length === 0 ? (
            <div className="text-center py-12 text-theme-muted">
              <p className="text-lg mb-2">No timezones configured</p>
              <p className="text-sm">Go to Settings to add timezones</p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayTimezones.map((zone) => (
                <TimeZoneClock
                  key={zone.city}
                  city={zone.city}
                  timezone={zone.timezone}
                  offsetMinutes={zone.baseOffset + timeOffset}
                  datetimeFormat={settings.datetimeFormat}
                  onDateTimeChange={handleDateTimeChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Timeline */}
      <div className="h-20 bg-theme-secondary border-t border-theme relative">
        <HorizontalTimeline onTimeOffsetChange={handleTimeOffsetChange} datetimeFormat={settings.datetimeFormat}/>
      </div>

      {/* Add Timezone Modal */}

    </div>
  );
};

export default TimezoneManager;
