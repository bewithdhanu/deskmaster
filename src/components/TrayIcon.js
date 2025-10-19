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
    theme: 'dark',
    settings: {
      stats: {
        cpu: true,
        ram: true,
        disk: true,
        network: true,
        battery: true
      },
      datetimeFormat: 'HH:mm:ss'
    }
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
      return moment().tz(timezone).format(stats.settings.datetimeFormat);
    } catch (error) {
      console.warn(`Failed to format timezone time for ${timezone}:`, error);
      return 'Invalid';
    }
  };

  const timezoneEntries = Object.values(stats.timezones || {});

  // Build enabled stats cells
  const enabledLabelCells = [];
  const enabledValueCells = [];

  if (stats.settings.stats.cpu) {
    enabledLabelCells.push(
      <td key="cpu-label" className="stat-cell cpu-cell">
        <div className="stat-label">CPU</div>
      </td>
    );
    enabledValueCells.push(
      <td key="cpu-value" className="stat-cell cpu-cell">
        <div className="stat-value">{stats.cpu}%</div>
      </td>
    );
  }

  if (stats.settings.stats.ram) {
    enabledLabelCells.push(
      <td key="ram-label" className="stat-cell ram-cell">
        <div className="stat-label">RAM</div>
      </td>
    );
    enabledValueCells.push(
      <td key="ram-value" className="stat-cell ram-cell">
        <div className="stat-value">{stats.ram}%</div>
      </td>
    );
  }

  if (stats.settings.stats.disk) {
    enabledLabelCells.push(
      <td key="disk-label" className="stat-cell disk-cell">
        <div className="stat-label">DISK</div>
      </td>
    );
    enabledValueCells.push(
      <td key="disk-value" className="stat-cell disk-cell">
        <div className="stat-value">{stats.disk}%</div>
      </td>
    );
  }

  if (stats.settings.stats.battery && stats.battery) {
    enabledLabelCells.push(
      <td key="battery-label" className="stat-cell battery-cell">
        <div className="stat-label">BAT</div>
      </td>
    );
    enabledValueCells.push(
      <td key="battery-value" className={`stat-cell battery-cell ${stats.battery.charging ? 'charging-battery-cell' : ''}`}>
        <div className="stat-value">
          <span style={{fontSize: '6px'}}>{stats.battery.charging ? '⚡' : ''}</span>{stats.battery.percent}%
        </div>
      </td>
    );
  }

  if (stats.settings.stats.network) {
    enabledLabelCells.push(
      <td key="net-label" className="stat-cell net-cell">
        <div className="stat-label">NET</div>
      </td>
    );
    enabledValueCells.push(
      <td key="net-value" className="stat-cell net-cell">
        <div className="stat-value">{stats.net.human}</div>
      </td>
    );
  }

  // Add timezone cells
  timezoneEntries.forEach((tz, index) => {
    enabledLabelCells.push(
      <td key={`label-${tz.id || index}`} className="stat-cell timezone-cell">
        <div className="stat-label">{tz.label}</div>
      </td>
    );
    enabledValueCells.push(
      <td key={`value-${tz.id || index}`} className="stat-cell timezone-cell">
        <div className="stat-value">{formatTimezoneTime(tz.timezone)}</div>
      </td>
    );
  });

  return (
    <div className="tray-container">
      <table className="stats-table">
        <tbody>
          <tr className="label-row">
            {enabledLabelCells}
          </tr>
          <tr className="value-row">
            {enabledValueCells}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default TrayIcon;
