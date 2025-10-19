import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';

const { ipcRenderer } = window.require('electron');

const TimezoneManager = () => {
  const [timezones, setTimezones] = useState([]);
  const [settings, setSettings] = useState({
    timezones: [],
    datetimeFormat: 'HH:mm:ss'
  });
  const [updateInterval, setUpdateInterval] = useState(null);
  const [timeOffset, setTimeOffset] = useState(0); // Offset in minutes

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
      return moment().add(timeOffset, 'minutes').tz(timezone).format(settings.datetimeFormat);
    } catch (error) {
      console.warn(`Failed to format time for ${timezone}:`, error);
      return 'Invalid';
    }
  };

  const formatDate = (timezone) => {
    try {
      return moment().add(timeOffset, 'minutes').tz(timezone).format('MMM DD');
    } catch (error) {
      console.warn(`Failed to format date for ${timezone}:`, error);
      return 'Invalid';
    }
  };

  const handleTimelineChange = (event) => {
    const value = parseInt(event.target.value);
    setTimeOffset(value);
  };

  const resetTimeline = () => {
    setTimeOffset(0);
  };

  const getTimelineLabel = () => {
    if (timeOffset === 0) {
      return 'Current Time';
    }
    
    const absOffset = Math.abs(timeOffset);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;
    
    let timeStr = '';
    if (hours > 0) {
      timeStr += `${hours}h `;
    }
    if (minutes > 0) {
      timeStr += `${minutes}m`;
    }
    
    const direction = timeOffset > 0 ? 'ahead' : 'behind';
    return `${timeStr.trim()} ${direction}`;
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
        {/* Timeline Bar */}
        <div className="mb-8">
          <div className="bg-theme-secondary rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-theme-primary font-medium">Time Timeline</h3>
              <div className="flex items-center gap-2">
                <span className="text-theme-muted text-sm">{getTimelineLabel()}</span>
                <button
                  onClick={resetTimeline}
                  className="px-3 py-1 bg-theme-primary hover:bg-theme-card-hover text-theme-secondary text-sm rounded transition-colors duration-200"
                >
                  Reset
                </button>
              </div>
            </div>
            
            <div className="relative">
              <input
                type="range"
                min="-2880"
                max="2880"
                step="15"
                value={timeOffset}
                onChange={handleTimelineChange}
                className="w-full h-2 bg-theme-card rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, 
                    #ef4444 0%, 
                    #ef4444 ${((timeOffset + 2880) / 5760) * 100}%, 
                    #374151 ${((timeOffset + 2880) / 5760) * 100}%, 
                    #374151 100%)`
                }}
              />
              
              {/* Timeline Labels */}
              <div className="flex justify-between text-xs text-theme-muted mt-2">
                <span>-2 days</span>
                <span>-1 day</span>
                <span>Now</span>
                <span>+1 day</span>
                <span>+2 days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timezone Display */}
        <div className="mb-6">
          <h3 className="text-theme-primary font-medium mb-4">Selected Timezones</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {timezones.length === 0 ? (
              <div className="col-span-full text-center py-12 text-theme-muted">
                <p>No timezones added yet.</p>
                <p>Go to Settings to add timezones.</p>
              </div>
            ) : (
              timezones.map((tz) => (
                <div 
                  key={tz.id} 
                  className="bg-theme-secondary border border-theme rounded-lg p-4 hover:bg-theme-card-hover transition-colors duration-200"
                >
                  <div className="text-center">
                    <div className="text-theme-primary font-medium text-lg mb-1">
                      {tz.label}
                    </div>
                    <div className="text-theme-muted text-sm mb-2">
                      {tz.timezone}
                    </div>
                    <div className="text-theme-muted text-xs mb-1">
                      {formatDate(tz.timezone)}
                    </div>
                    <div className="text-theme-primary font-mono text-xl font-bold">
                      {formatTime(tz.timezone)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Timezone Modal */}

    </div>
  );
};

export default TimezoneManager;
