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

  const getTemperatureClass = (temp) => {
    if (temp < 50) return 'normal';
    if (temp < 70) return 'warm';
    return 'hot';
  };

  const StatCard = ({ label, value, detail, progressValue, accentColor, children, hoverDetails }) => {
    const getAccentColor = (color) => {
      switch (color) {
        case 'cpu-card': return 'border-red-500';
        case 'ram-card': return 'border-blue-500';
        case 'disk-card': return 'border-green-500';
        case 'net-card': return 'border-yellow-500';
        case 'battery-card': return 'border-green-500';
        default: return 'border-theme';
      }
    };

    const getProgressColor = (color) => {
      switch (color) {
        case 'cpu-card': return 'bg-red-500';
        case 'ram-card': return 'bg-blue-500';
        case 'disk-card': return 'bg-green-500';
        case 'net-card': return 'bg-yellow-500';
        case 'battery-card': return 'bg-green-500';
        default: return 'bg-theme-secondary';
      }
    };

    return (
      <div className={`bg-theme-secondary border-l-4 ${getAccentColor(accentColor)} p-2 rounded-md flex-1 min-w-[80px] transition-all duration-300 hover:bg-theme-card-hover hover:shadow-lg group relative`}>
        <div className="text-xs text-theme-muted mb-0.5 leading-tight">{label}</div>
        <div className="text-base font-bold text-theme-primary mb-0.5 leading-tight">{value}</div>
        <div className="text-xs text-theme-muted mb-1 truncate leading-tight">{detail}</div>
        <div className="w-full bg-theme-card rounded-full h-1">
          <div
            className={`h-1 rounded-full ${getProgressColor(accentColor)} transition-all duration-300`}
            style={{ width: `${Math.min(progressValue, 100)}%` }}
          />
        </div>
        
        {/* Hover Details Tooltip */}
        {hoverDetails && (
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-theme-secondary border border-theme rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap">
            <div className="text-xs text-theme-primary font-medium">{hoverDetails}</div>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-theme-secondary"></div>
          </div>
        )}
        
        {children}
      </div>
    );
  };

  const enabledStats = [];


  if (stats.settings.stats.cpu) {
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
  }

  if (stats.settings.stats.ram) {
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
  }

  if (stats.settings.stats.disk) {
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
  }

  if (stats.settings.stats.network) {
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
  }

  if (stats.settings?.stats?.battery) {
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
  }

  return (
    <div className="p-3">
      <div className="flex gap-3">
        {enabledStats.length > 0 ? enabledStats : (
          <div className="w-full text-center py-12 text-theme-muted">
            <p>No stats enabled. Go to Settings to enable system stats.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsManager;
