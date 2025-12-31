import React from 'react';
import HistoryChart from './HistoryChart';
import StatsManager from './StatsManager';

const SystemPerformance = () => {
  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 gap-4">
      <StatsManager />
      <HistoryChart />
    </div>
  );
};

export default SystemPerformance;

