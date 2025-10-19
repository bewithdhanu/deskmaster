import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';

const { ipcRenderer } = window.require('electron');

const TimezoneManager = ({ onNavigateToSettings }) => {
  const [timezones, setTimezones] = useState([]);
  const [settings, setSettings] = useState({
    timezones: [],
    datetimeFormat: 'HH:mm:ss'
  });
  const [updateInterval, setUpdateInterval] = useState(null);

  useEffect(() => {
    // Listen for timezone updates
    const handleTimezoneUpdate = (event, data) => {
      if (data.timezones) {
        setTimezones(data.timezones);
      }
      if (data.settings) {
        setSettings(data.settings);
      }
    };

    ipcRenderer.on('detailed-stats-update', handleTimezoneUpdate);

    // Start time updates
    startTimeUpdates();

    return () => {
      ipcRenderer.removeListener('detailed-stats-update', handleTimezoneUpdate);
      stopTimeUpdates();
    };
  }, []);


  const startTimeUpdates = () => {
    const interval = setInterval(() => {
      // Force re-render to update times
      setTimezones(prev => [...prev]);
    }, 1000);
    setUpdateInterval(interval);
  };

  const stopTimeUpdates = () => {
    if (updateInterval) {
      clearInterval(updateInterval);
      setUpdateInterval(null);
    }
  };

  const openModal = () => {
    setShowModal(true);
    setSelectedTimezone(null);
    setTimezoneLabel('');
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedTimezone(null);
    setTimezoneLabel('');
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (selectedTimezone && timezoneLabel.trim()) {
      addTimezone(timezoneLabel, selectedTimezone);
      closeModal();
    }
  };

  const handleTimezoneSelect = (timezone) => {
    setSelectedTimezone(timezone);
  };

  const formatTime = (timezone) => {
    try {
      return moment().tz(timezone).format(settings.datetimeFormat);
    } catch (error) {
      console.warn(`Failed to format time for ${timezone}:`, error);
      return 'Invalid';
    }
  };

  const formatDate = (timezone) => {
    try {
      return moment().tz(timezone).format('MMM DD');
    } catch (error) {
      console.warn(`Failed to format date for ${timezone}:`, error);
      return 'Invalid';
    }
  };

  return (
    <div className="h-full flex flex-col bg-theme-primary">
      <div className="flex flex-col items-center px-4 py-12 text-center">
        <h1 className="text-5xl font-bold text-theme-primary mb-3">
          World Clocks
        </h1>
        <p className="text-xl text-theme-muted">
          Manage your timezone clocks
        </p>
      </div>
      
      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        <div className="flex justify-center mb-8">
          <div className="text-center">
            <p className="text-theme-muted mb-4">
              Manage timezones in the Settings page
            </p>
            <button
              onClick={onNavigateToSettings}
              className="px-6 py-3 bg-theme-secondary hover:bg-theme-card-hover text-theme-primary font-medium rounded-lg transition-colors duration-200"
            >
              Go to Settings
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {timezones.length === 0 ? (
            <div className="text-center py-12 text-theme-muted">
              <p>No timezones added yet.</p>
              <p>Go to Settings to add timezones.</p>
            </div>
          ) : (
            timezones.map((tz) => (
              <div 
                key={tz.id} 
                className="bg-theme-secondary border border-theme rounded-lg p-4 flex justify-between items-center hover:bg-theme-card-hover transition-colors duration-200"
              >
                <div className="flex-1">
                  <div className="text-theme-primary font-medium">
                    {tz.label}
                  </div>
                  <div className="text-theme-muted text-sm">
                    {tz.timezone}
                  </div>
                </div>
                <div className="text-right mr-4">
                  <div className="text-theme-muted text-sm">
                    {formatDate(tz.timezone)}
                  </div>
                  <div className="text-theme-primary font-mono text-lg">
                    {formatTime(tz.timezone)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Timezone Modal */}

    </div>
  );
};

export default TimezoneManager;
