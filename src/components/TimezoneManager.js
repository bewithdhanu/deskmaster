import React, { useState, useEffect, useRef } from 'react';
import moment from 'moment-timezone';
import TimezoneDropdown from './TimezoneDropdown';

const { ipcRenderer } = window.require('electron');

const TimezoneManager = () => {
  const [timezones, setTimezones] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState(null);
  const [timezoneLabel, setTimezoneLabel] = useState('');
  const [updateInterval, setUpdateInterval] = useState(null);

  useEffect(() => {
    // Load timezones from main process
    loadTimezones();

    // Listen for timezone updates
    const handleTimezoneUpdate = (event, data) => {
      if (data.timezones) {
        setTimezones(data.timezones);
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

  const loadTimezones = () => {
    ipcRenderer.send('get-timezones');
  };

  const saveTimezones = (newTimezones) => {
    ipcRenderer.send('save-timezones', newTimezones);
  };

  const addTimezone = (label, timezone) => {
    const newTimezone = {
      id: Date.now(),
      label: label.trim(),
      timezone: timezone
    };

    const newTimezones = [...timezones, newTimezone];
    setTimezones(newTimezones);
    saveTimezones(newTimezones);
  };

  const removeTimezone = (id) => {
    const newTimezones = timezones.filter(tz => tz.id !== id);
    setTimezones(newTimezones);
    saveTimezones(newTimezones);
  };

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
      return moment().tz(timezone).format('HH:mm:ss');
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
    <div className="mb-4">
      {/* Timezone Section */}
      <div className="bg-bg-secondary border border-border-color rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌍</span>
            <h2 className="text-lg font-semibold text-text-primary">World Clocks</h2>
          </div>
          <button
            onClick={openModal}
            className="bg-accent-cpu hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
          >
            + Add Timezone
          </button>
        </div>

        <div className="space-y-2">
          {timezones.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <p>No timezones added yet.</p>
              <p className="text-sm">Click "Add Timezone" to get started.</p>
            </div>
          ) : (
            timezones.map((tz) => (
              <div key={tz.id} className="timezone-item">
                <div className="timezone-info">
                  <div className="timezone-label">{tz.label}</div>
                  <div className="timezone-zone">{tz.timezone}</div>
                </div>
                <div className="timezone-time-info">
                  <div className="timezone-date">{formatDate(tz.timezone)}</div>
                  <div className="timezone-time">{formatTime(tz.timezone)}</div>
                </div>
                <button
                  onClick={() => removeTimezone(tz.id)}
                  className="remove-timezone-btn"
                  title="Remove timezone"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Timezone Modal */}
      {showModal && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Add Timezone</div>
              <button className="close-modal" onClick={closeModal}>
                &times;
              </button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="timezone-search">
                  Timezone
                </label>
                <TimezoneDropdown onTimezoneSelect={handleTimezoneSelect} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="timezone-label">
                  Label
                </label>
                <input
                  type="text"
                  id="timezone-label"
                  className="form-input"
                  placeholder="e.g., New York, London"
                  value={timezoneLabel}
                  onChange={(e) => setTimezoneLabel(e.target.value)}
                  required
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!selectedTimezone || !timezoneLabel.trim()}
                >
                  Add Timezone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default TimezoneManager;
