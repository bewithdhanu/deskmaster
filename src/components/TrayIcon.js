import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';

const { ipcRenderer } = window.require('electron');

const TrayIcon = () => {
  const [stats, setStats] = useState({
    cpu: 0,
    ram: 0,
    disk: 0,
    net: { human: '0 B' },
    battery: null,
    timezones: {},
    theme: 'dark'
  });

  useEffect(() => {
    // Listen for stats updates from main process
    const handleStatsUpdate = (event, newStats) => {
      setStats(newStats);
    };

    ipcRenderer.on('update-tray-stats', handleStatsUpdate);

    return () => {
      ipcRenderer.removeListener('update-tray-stats', handleStatsUpdate);
    };
  }, []);

  useEffect(() => {
    // Apply theme
    document.body.setAttribute('data-theme', stats.theme);
  }, [stats.theme]);

  const formatTimezoneTime = (timezone) => {
    try {
      return moment().tz(timezone).format('MMM DD h:mm A');
    } catch (error) {
      console.warn(`Failed to format timezone time for ${timezone}:`, error);
      return 'Invalid';
    }
  };

  const timezoneEntries = Object.values(stats.timezones || {});

  return (
    <div className="tray-container">
      <table className="stats-table">
        <tbody>
          <tr className="label-row">
            <td className="stat-cell cpu-cell">
              <div className="stat-label">CPU</div>
            </td>
            <td className="stat-cell ram-cell">
              <div className="stat-label">RAM</div>
            </td>
            <td className="stat-cell disk-cell">
              <div className="stat-label">DISK</div>
            </td>
            {stats.battery && (
              <td className="stat-cell battery-cell">
                <div className="stat-label">BAT</div>
              </td>
            )}
            <td className="stat-cell net-cell">
              <div className="stat-label">NET</div>
            </td>
            {timezoneEntries.map((tz, index) => (
              <td key={`label-${tz.id || index}`} className="stat-cell timezone-cell">
                <div className="stat-label">{tz.label}</div>
              </td>
            ))}
          </tr>
          <tr className="value-row">
            <td className="stat-cell cpu-cell">
              <div className="stat-value">{stats.cpu}%</div>
            </td>
            <td className="stat-cell ram-cell">
              <div className="stat-value">{stats.ram}%</div>
            </td>
            <td className="stat-cell disk-cell">
              <div className="stat-value">{stats.disk}%</div>
            </td>
            {stats.battery && (
              <td className={`stat-cell battery-cell ${stats.battery.charging ? 'charging-battery-cell' : ''}`}>
                <div className="stat-value">
                  <span style={{fontSize: '6px'}}>{stats.battery.charging ? '⚡' : ''}</span>{stats.battery.percent}%
                </div>
              </td>
            )}
            <td className="stat-cell net-cell">
              <div className="stat-value">{stats.net.human}</div>
            </td>
            {timezoneEntries.map((tz, index) => (
              <td key={`value-${tz.id || index}`} className="stat-cell timezone-cell">
                <div className="stat-value">{formatTimezoneTime(tz.timezone)}</div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default TrayIcon;
