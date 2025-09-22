import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

const StatsManager = () => {
  const [stats, setStats] = useState({
    cpu: 0,
    ram: 0,
    disk: 0,
    net: { human: '0 KB/s', kbs: 0 },
    battery: null,
    cpuDetails: { cores: 0, speed: '0', temperature: null },
    memoryDetails: { used: '0', total: '0' },
    storageDetails: [{ used: '0', total: '0' }],
    networkDetails: [{ rx: '0', tx: '0' }],
    theme: 'dark'
  });

  useEffect(() => {
    // Request initial stats
    ipcRenderer.send('get-detailed-stats');

    // Listen for stats updates
    const handleStatsUpdate = (event, newStats) => {
      setStats(newStats);
    };

    ipcRenderer.on('detailed-stats-update', handleStatsUpdate);

    return () => {
      ipcRenderer.removeListener('detailed-stats-update', handleStatsUpdate);
    };
  }, []);

  const getTemperatureClass = (temp) => {
    if (temp < 50) return 'normal';
    if (temp < 70) return 'warm';
    return 'hot';
  };

  const StatCard = ({ label, value, detail, progressValue, accentColor, children }) => (
    <div className={`stat-card ${accentColor}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ 
            width: `${Math.min(progressValue, 100)}%`,
            backgroundColor: `var(--accent-color)`
          }}
        />
      </div>
      {children}
    </div>
  );

  return (
    <div className="mb-4">
      <div className="flex gap-1 mb-4 overflow-x-auto">
        <StatCard
          label="CPU Usage"
          value={`${stats.cpu}%`}
          detail={`${stats.cpuDetails.cores} cores @ ${stats.cpuDetails.speed}GHz${stats.cpuDetails.temperature ? ` ${stats.cpuDetails.temperature}°C` : ''}`}
          progressValue={stats.cpu}
          accentColor="cpu-card"
        />

        <StatCard
          label="Memory"
          value={`${stats.ram}%`}
          detail={`${stats.memoryDetails.used}GB / ${stats.memoryDetails.total}GB`}
          progressValue={stats.ram}
          accentColor="ram-card"
        />

        <StatCard
          label="Storage"
          value={`${stats.disk}%`}
          detail={stats.storageDetails[0] ? `${stats.storageDetails[0].used}GB / ${stats.storageDetails[0].total}GB` : 'Loading...'}
          progressValue={stats.disk}
          accentColor="disk-card"
        />

        <StatCard
          label="Network"
          value={stats.net.human}
          detail={stats.networkDetails[0] ? `↓${stats.networkDetails[0].rx} ↑${stats.networkDetails[0].tx} KB/s` : 'Loading...'}
          progressValue={Math.min(stats.net.kbs / 10, 100)}
          accentColor="net-card"
        />

        {stats.battery && (
          <StatCard
            label="Battery"
            value={`${stats.battery.percent}%`}
            detail={stats.battery.charging ? '⚡ Charging' : '🔋 Battery'}
            progressValue={stats.battery.percent}
            accentColor="battery-card"
          />
        )}
      </div>
    </div>
  );
};

export default StatsManager;
