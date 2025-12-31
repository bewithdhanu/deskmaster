import React, { useState, useEffect } from 'react';
import { getIpcRenderer } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

const StatCard = ({ label, value, detail, progressValue, accentColor, children, hoverDetails }) => {
  const getAccentColor = (color) => {
    switch (color) {
      case 'cpu-card': return 'border-red-500';
      case 'ram-card': return 'border-blue-500';
      case 'disk-card': return 'border-green-500';
      case 'net-card': return 'border-yellow-500';
      case 'battery-card': return 'border-purple-600';
      default: return 'border-theme';
    }
  };

  const getProgressColor = (color) => {
    switch (color) {
      case 'cpu-card': return 'bg-red-500';
      case 'ram-card': return 'bg-blue-500';
      case 'disk-card': return 'bg-green-500';
      case 'net-card': return 'bg-yellow-500';
      case 'battery-card': return 'bg-purple-600';
      default: return 'bg-theme-secondary';
    }
  };

  return (
    <div 
      className={`bg-theme-secondary border-l-4 ${getAccentColor(accentColor)} p-2 rounded-md flex-1 min-w-[80px] transition-all duration-300 hover:bg-theme-card-hover hover:shadow-lg`}
      title={hoverDetails || undefined}
    >
      <div className="text-xs text-theme-muted mb-0.5 leading-tight">{label}</div>
      <div className="text-base font-bold text-theme-primary mb-0.5 leading-tight transition-opacity duration-200">{value}</div>
      <div className="text-xs text-theme-muted mb-1 truncate leading-tight transition-opacity duration-200">{detail}</div>
      <div className="w-full bg-theme-card rounded-full h-1 overflow-hidden">
        <div
          className={`h-1 rounded-full ${getProgressColor(accentColor)} transition-all duration-500 ease-out`}
          style={{ width: `${Math.min(progressValue, 100)}%` }}
        />
      </div>
      
      {children}
    </div>
  );
};

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
    theme: 'dark',
    settings: {
      stats: {
        cpu: true,
        ram: true,
        disk: true,
        network: true,
        battery: true
      }
    }
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

  // Always show all stats in StatsManager (settings only affect tray)
  const enabledStats = [];

  // Always show CPU
  enabledStats.push(
    <StatCard
      key="cpu"
      label="CPU"
      value={`${stats.cpu}%`}
      detail={`${stats.cpuDetails.cores}c @ ${stats.cpuDetails.speed}GHz`}
      progressValue={stats.cpu}
      accentColor="cpu-card"
      hoverDetails={`Temperature: ${stats.cpuDetails.temperature || 'N/A'}°C | Usage: ${stats.cpu}%`}
    />
  );

  // Always show RAM
  enabledStats.push(
    <StatCard
      key="ram"
      label="RAM"
      value={`${stats.ram}%`}
      detail={`${stats.memoryDetails.used}/${stats.memoryDetails.total}GB`}
      progressValue={stats.ram}
      accentColor="ram-card"
      hoverDetails={`Memory Usage: ${stats.ram}% | Available: ${(parseFloat(stats.memoryDetails.total) - parseFloat(stats.memoryDetails.used)).toFixed(1)}GB`}
    />
  );

  // Always show Disk
  enabledStats.push(
    <StatCard
      key="disk"
      label="Storage"
      value={`${stats.disk}%`}
      detail={stats.storageDetails[0] ? `${stats.storageDetails[0].used}/${stats.storageDetails[0].total}GB` : 'Loading...'}
      progressValue={stats.disk}
      accentColor="disk-card"
      hoverDetails={`Disk Usage: ${stats.disk}% | Free: ${stats.storageDetails[0] ? (parseFloat(stats.storageDetails[0].total) - parseFloat(stats.storageDetails[0].used)).toFixed(1) : 'N/A'}GB`}
    />
  );

  // Always show Network
  enabledStats.push(
    <StatCard
      key="network"
      label="Network"
      value={stats.net.human}
      detail={stats.networkDetails[0] ? `↓${stats.networkDetails[0].rx} KB/s ↑${stats.networkDetails[0].tx} KB/s` : 'Loading...'}
      progressValue={Math.min(stats.net.kbs / 10, 100)}
      accentColor="net-card"
      hoverDetails={`Download: ${stats.networkDetails[0]?.rx || '0'} KB/s | Upload: ${stats.networkDetails[0]?.tx || '0'} KB/s`}
    />
  );

  // Always show Battery if available
  if (stats.battery && stats.battery.percent !== undefined) {
    enabledStats.push(
      <StatCard
        key="battery"
        label="Battery"
        value={`${stats.battery.percent}%`}
        detail={stats.battery.charging ? '⚡ Charging' : '🔋 Battery'}
        progressValue={stats.battery.percent}
        accentColor="battery-card"
        hoverDetails={`Battery: ${stats.battery.percent}% | Status: ${stats.battery.charging ? 'Charging' : 'Discharging'} | Time: ${stats.battery.time || 'N/A'}`}
      />
    );
  }

  return (
    <div className="flex gap-3">
      {enabledStats}
    </div>
  );
};

export default StatsManager;
