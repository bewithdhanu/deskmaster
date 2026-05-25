import React, { useEffect, useMemo, useState } from 'react';
import { MdAccessTime, MdCheckCircle, MdSecurity, MdSpeed, MdWarning } from 'react-icons/md';
import { getIpcRenderer } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

const UptimeStatCard = ({ label, value, detail, accentClass, icon: Icon }) => (
  <div className={`bg-theme-secondary border-l-4 ${accentClass} p-2 rounded-md flex-1 min-w-[120px] transition-all duration-300 hover:bg-theme-card-hover hover:shadow-lg`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs text-theme-muted mb-0.5 leading-tight">{label}</div>
        <div className="text-base font-bold text-theme-primary mb-0.5 leading-tight">{value}</div>
        <div className="text-xs text-theme-muted truncate leading-tight">{detail}</div>
      </div>
      <Icon className="w-5 h-5 text-theme-muted flex-shrink-0" />
    </div>
  </div>
);

const UptimeStatsSummary = ({ monitors: providedMonitors, summary: providedSummary, isLoading: providedIsLoading, error: providedError }) => {
  const usesProvidedData = Array.isArray(providedMonitors) || providedSummary;
  const [data, setData] = useState({ monitors: [], summary: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUptimeStats = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await ipcRenderer.invoke('uptime:get-monitors', { refresh: false });
      setData({ monitors: response?.monitors || [], summary: response?.summary || null });
    } catch (err) {
      setError(err?.message || 'Unable to load uptime stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (usesProvidedData) return;
    loadUptimeStats();
  }, [usesProvidedData]);

  const summary = useMemo(() => {
    const monitors = Array.isArray(providedMonitors) ? providedMonitors : data.monitors || [];
    const sourceSummary = providedSummary || data.summary;
    return {
      total: sourceSummary?.total ?? monitors.length,
      up: sourceSummary?.up ?? monitors.filter((monitor) => monitor.status === 'UP').length,
      down: sourceSummary?.down ?? monitors.filter((monitor) => monitor.status === 'DOWN').length,
      sslExpiringSoon: sourceSummary?.sslExpiringSoon ?? monitors.filter((monitor) => monitor.sslDaysRemaining !== null && monitor.sslDaysRemaining <= 21).length,
      domainExpiringSoon: sourceSummary?.domainExpiringSoon ?? monitors.filter((monitor) => monitor.domainExpiryDaysRemaining !== null && monitor.domainExpiryDaysRemaining <= 21).length
    };
  }, [data, providedMonitors, providedSummary]);

  const loading = providedIsLoading ?? isLoading;
  const message = providedError || error;

  return (
    <div className="flex gap-3 overflow-x-auto">
      <UptimeStatCard label="Uptime Total" value={loading ? '...' : summary.total} detail={message || 'Monitored domains'} accentClass="border-slate-500" icon={MdSpeed} />
      <UptimeStatCard label="Uptime Online" value={loading ? '...' : summary.up} detail="Overall status UP" accentClass="border-green-500" icon={MdCheckCircle} />
      <UptimeStatCard label="Uptime Down" value={loading ? '...' : summary.down} detail="Overall status DOWN" accentClass="border-red-500" icon={MdWarning} />
      <UptimeStatCard label="SSL Attention" value={loading ? '...' : summary.sslExpiringSoon} detail="Certificates <= 21 days" accentClass="border-yellow-500" icon={MdSecurity} />
      <UptimeStatCard label="Domain Attention" value={loading ? '...' : summary.domainExpiringSoon} detail="Domains <= 21 days" accentClass="border-orange-500" icon={MdAccessTime} />
    </div>
  );
};

export default UptimeStatsSummary;
