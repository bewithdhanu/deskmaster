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
      <div 
        className="border rounded-lg p-4"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)'
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌍</span>
            <h2 
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              World Clocks
            </h2>
          </div>
          <button
            onClick={openModal}
            className="text-white px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
            style={{ backgroundColor: 'var(--accent-cpu)' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#dc2626'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--accent-cpu)'}
          >
            + Add Timezone
          </button>
        </div>

        <div className="space-y-2">
          {timezones.length === 0 ? (
            <div 
              className="text-center py-8"
              style={{ color: 'var(--text-muted)' }}
            >
              <p>No timezones added yet.</p>
              <p className="text-sm">Click "Add Timezone" to get started.</p>
            </div>
          ) : (
            timezones.map((tz) => (
              <div 
                key={tz.id} 
                className="timezone-item"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)'
                }}
              >
                <div className="timezone-info">
                  <div 
                    className="timezone-label"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {tz.label}
                  </div>
                  <div 
                    className="timezone-zone"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {tz.timezone}
                  </div>
                </div>
                <div className="timezone-time-info">
                  <div 
                    className="timezone-date"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {formatDate(tz.timezone)}
                  </div>
                  <div 
                    className="timezone-time"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {formatTime(tz.timezone)}
                  </div>
                </div>
                <button
                  onClick={() => removeTimezone(tz.id)}
                  className="remove-timezone-btn"
                  style={{
                    color: 'var(--text-muted)',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.color = 'var(--text-primary)';
                    e.target.style.backgroundColor = 'var(--bg-card-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.color = 'var(--text-muted)';
                    e.target.style.backgroundColor = 'transparent';
                  }}
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
        <div 
          className="modal" 
          onClick={closeModal}
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
              border: '1px solid',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
          >
            <div 
              className="modal-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
              }}
            >
              <div 
                className="modal-title"
                style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  color: 'var(--text-primary)'
                }}
              >
                Add Timezone
              </div>
              <button 
                className="close-modal" 
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '0.25rem'
                }}
                onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div 
                className="form-group"
                style={{ marginBottom: '1rem' }}
              >
                <label 
                  className="form-label" 
                  htmlFor="timezone-search"
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    color: 'var(--text-primary)',
                    fontWeight: '500'
                  }}
                >
                  Timezone
                </label>
                <TimezoneDropdown 
                  onTimezoneSelect={handleTimezoneSelect} 
                  selectedTimezone={selectedTimezone}
                />
              </div>
              <div 
                className="form-group"
                style={{ marginBottom: '1.5rem' }}
              >
                <label 
                  className="form-label" 
                  htmlFor="timezone-label"
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    color: 'var(--text-primary)',
                    fontWeight: '500'
                  }}
                >
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
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.375rem',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div 
                className="modal-actions"
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  justifyContent: 'flex-end'
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.375rem',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-card-hover)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--bg-secondary)'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!selectedTimezone || !timezoneLabel.trim()}
                  style={{
                    padding: '0.5rem 1rem',
                    border: 'none',
                    borderRadius: '0.375rem',
                    backgroundColor: 'var(--accent-cpu)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    opacity: (!selectedTimezone || !timezoneLabel.trim()) ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (selectedTimezone && timezoneLabel.trim()) {
                      e.target.style.backgroundColor = '#dc2626';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedTimezone && timezoneLabel.trim()) {
                      e.target.style.backgroundColor = 'var(--accent-cpu)';
                    }
                  }}
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
