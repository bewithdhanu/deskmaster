import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { getIpcRenderer } from '../utils/electron';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ipcRenderer = getIpcRenderer();

// Helper function to format network speed (KB/s or MB/s)
const formatNetworkSpeed = (value) => {
  if (value >= 1024) {
    return (value / 1024).toFixed(2) + ' MB/s';
  }
  return Math.round(value) + ' KB/s';
};

// Minimum pixel distance between two x-axis ticks so the chart always looks good at any width
const TICK_SPACING_PX = 10;
// Line chart stroke width (px)
const CHART_LINE_BORDER_WIDTH = 2;

// Helper function to get computed CSS variable value
const getCSSVariable = (varName) => {
  if (typeof window === 'undefined') return '#ffffff';
  // Try to get from body first (where theme is set), fallback to documentElement
  const element = document.body || document.documentElement;
  const value = getComputedStyle(element).getPropertyValue(varName).trim();
  // If empty, try documentElement as fallback
  if (!value) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#ffffff';
  }
  return value || '#ffffff';
};

const HistoryChart = () => {
  const [historyData, setHistoryData] = useState([]);
  const [timeRange, setTimeRange] = useState({ oldest: null, newest: null });
  const [selectedRange, setSelectedRange] = useState('1h'); // 1h, 6h, 24h, 7d, 30d
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState(['cpu', 'ram', 'disk', 'network', 'battery']);
  const [chartWidth, setChartWidth] = useState(400);
  const chartContainerRef = useRef(null);
  const updateIntervalRef = useRef(null);
  // Custom range: store as "YYYY-MM-DDTHH:mm" for datetime-local inputs
  const [customRangeStart, setCustomRangeStart] = useState('');
  const [customRangeEnd, setCustomRangeEnd] = useState('');
  const [themeColors, setThemeColors] = useState({
    textPrimary: '#ffffff',
    textMuted: 'rgba(255, 255, 255, 0.7)',
    bgCard: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)'
  });

  const rangeOptions = [
    { value: '1h', label: 'Last Hour', hours: 1 },
    { value: '6h', label: 'Last 6 Hours', hours: 6 },
    { value: '24h', label: 'Last 24 Hours', hours: 24 },
    { value: '7d', label: 'Last 7 Days', hours: 24 * 7 },
    { value: '30d', label: 'Last 30 Days', hours: 24 * 30 },
    { value: 'custom', label: 'Custom Range', hours: null }
  ];

  const loadHistory = async (range = selectedRange, customStart = customRangeStart, customEnd = customRangeEnd) => {
    setIsLoading(true);
    try {
      let startTime, endTime;
      const now = Date.now();

      if (range === 'custom') {
        // Use user-selected start/end from date range picker when set
        if (customStart && customEnd) {
          startTime = new Date(customStart).getTime();
          endTime = new Date(customEnd).getTime();
          if (startTime > endTime) {
            const swap = startTime;
            startTime = endTime;
            endTime = swap;
          }
        } else if (timeRange.oldest && timeRange.newest) {
          startTime = timeRange.oldest;
          endTime = timeRange.newest;
        } else {
          endTime = now;
          startTime = now - (24 * 60 * 60 * 1000);
        }
      } else {
        const option = rangeOptions.find(opt => opt.value === range);
        if (option) {
          endTime = now;
          startTime = now - (option.hours * 60 * 60 * 1000);
        } else {
          endTime = now;
          startTime = now - (60 * 60 * 1000); // Default to 1 hour
        }
      }

      const data = await ipcRenderer.invoke('get-history', startTime, endTime);
      setHistoryData(data || []);
    } catch (error) {
      console.error('Error loading history:', error);
      setHistoryData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTimeRange = async () => {
    try {
      const range = await ipcRenderer.invoke('get-history-range');
      setTimeRange(range);
      // Initialize custom range picker defaults from available data
      if (range?.oldest != null && range?.newest != null) {
        const toDatetimeLocal = (ts) => {
          const d = new Date(ts);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const h = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          return `${y}-${m}-${day}T${h}:${min}`;
        };
        setCustomRangeStart((prev) => prev || toDatetimeLocal(range.oldest));
        setCustomRangeEnd((prev) => prev || toDatetimeLocal(range.newest));
      }
    } catch (error) {
      console.error('Error loading time range:', error);
    }
  };

  // Update theme colors when theme changes
  useEffect(() => {
    const updateThemeColors = () => {
      // Small delay to ensure CSS has updated
      setTimeout(() => {
        const textPrimary = getCSSVariable('--text-primary');
        const textMuted = getCSSVariable('--text-muted');
        const bgCard = getCSSVariable('--bg-card');
        const borderColor = getCSSVariable('--border-color');
        
        console.log('HistoryChart: Theme colors updated', {
          textPrimary,
          textMuted,
          bgCard,
          borderColor,
          bodyTheme: document.body?.getAttribute('data-theme'),
          htmlTheme: document.documentElement?.getAttribute('data-theme')
        });
        
        setThemeColors({
          textPrimary,
          textMuted,
          bgCard,
          borderColor
        });
      }, 50);
    };

    // Initial update
    updateThemeColors();
    
    // Listen for theme changes on body (where theme is set)
    const bodyObserver = new MutationObserver(updateThemeColors);
    if (document.body) {
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    }
    
    // Also listen on documentElement as backup
    const htmlObserver = new MutationObserver(updateThemeColors);
    htmlObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateThemeColors);
    
    // Also listen for IPC theme changes
    const handleThemeChange = () => {
      updateThemeColors();
    };
    ipcRenderer.on('theme-changed', handleThemeChange);

    return () => {
      bodyObserver.disconnect();
      htmlObserver.disconnect();
      mediaQuery.removeEventListener('change', updateThemeColors);
      ipcRenderer.removeListener('theme-changed', handleThemeChange);
    };
  }, []);

  // Measure chart container width for width-based tick count (all ranges: 1h, 6h, 24h, 7d, 30d, custom)
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.offsetWidth > 0) {
        setChartWidth(el.offsetWidth);
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    loadTimeRange();
    loadHistory();

    // Set up auto-refresh based on selected range
    const getRefreshInterval = () => {
      switch (selectedRange) {
        case '1h': return 5000; // 5 seconds
        case '6h': return 60000; // 1 minute
        case '24h': return 5 * 60000; // 5 minutes
        case '7d': return 15 * 60000; // 15 minutes
        case '30d': return 15 * 60000; // 15 minutes
        default: return 60000;
      }
    };

    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }

    updateIntervalRef.current = setInterval(() => {
      loadHistory();
    }, getRefreshInterval());

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [selectedRange, customRangeStart, customRangeEnd]);

  const toDatetimeLocal = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleRangeChange = (range) => {
    setSelectedRange(range);
    if (range === 'custom') {
      let startStr = customRangeStart;
      let endStr = customRangeEnd;
      if (!startStr && !endStr && (timeRange.oldest != null || timeRange.newest != null)) {
        const end = timeRange.newest != null ? timeRange.newest : Date.now();
        const start = timeRange.oldest != null ? timeRange.oldest : end - 24 * 60 * 60 * 1000;
        startStr = toDatetimeLocal(start);
        endStr = toDatetimeLocal(end);
        setCustomRangeStart(startStr);
        setCustomRangeEnd(endStr);
      }
      if (startStr && endStr) {
        loadHistory(range, startStr, endStr);
        return;
      }
    }
    loadHistory(range);
  };

  const handleCustomRangeChange = (field, value) => {
    if (field === 'start') {
      setCustomRangeStart(value);
      if (value && customRangeEnd) {
        loadHistory('custom', value, customRangeEnd);
      }
    } else {
      setCustomRangeEnd(value);
      if (customRangeStart && value) {
        loadHistory('custom', customRangeStart, value);
      }
    }
  };

  const toggleMetric = (metric) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metric)) {
        return prev.filter(m => m !== metric);
      } else {
        return [...prev, metric];
      }
    });
  };

  // Tick count from available chart width (same logic for 1h, 6h, 24h, 7d, 30d, custom)
  const tickCount = useMemo(() => {
    return Math.max(2, Math.floor(chartWidth / TICK_SPACING_PX));
  }, [chartWidth]);

  // Sample data to match tick count so the chart has one point per tick and looks good at any width
  const sampleData = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    if (historyData.length <= tickCount) return historyData;

    // Evenly distribute tickCount points across the full time range
    const sampled = [];
    const step = (historyData.length - 1) / (tickCount - 1);
    for (let i = 0; i < tickCount; i++) {
      const index = i === tickCount - 1 ? historyData.length - 1 : Math.round(i * step);
      sampled.push(historyData[index]);
    }
    return sampled;
  }, [historyData, tickCount]);

  // Prepare chart data - memoized to prevent unnecessary re-renders
  const chartData = useMemo(() => {
    return {
      labels: sampleData.map(item => {
        const date = new Date(item.timestamp);
        if (selectedRange === '1h' || selectedRange === '6h') {
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else if (selectedRange === '24h') {
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else {
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
        }
      }),
      datasets: [
        selectedMetrics.includes('cpu') && {
          label: 'CPU %',
          data: sampleData.map(item => item.cpu),
          borderColor: 'rgb(255, 71, 87)',
          backgroundColor: 'rgba(255, 71, 87, 0.1)',
          borderWidth: CHART_LINE_BORDER_WIDTH,
          fill: true,
          tension: 0.4,
          yAxisID: 'y',
          pointRadius: 0,
          pointHoverRadius: 0
        },
        selectedMetrics.includes('ram') && {
          label: 'RAM %',
          data: sampleData.map(item => item.ram),
          borderColor: 'rgb(55, 66, 250)',
          backgroundColor: 'rgba(55, 66, 250, 0.1)',
          borderWidth: CHART_LINE_BORDER_WIDTH,
          fill: true,
          tension: 0.4,
          yAxisID: 'y',
          pointRadius: 0,
          pointHoverRadius: 0
        },
        selectedMetrics.includes('disk') && {
          label: 'Disk %',
          data: sampleData.map(item => item.disk),
          borderColor: 'rgb(46, 213, 115)',
          backgroundColor: 'rgba(46, 213, 115, 0.1)',
          borderWidth: CHART_LINE_BORDER_WIDTH,
          fill: true,
          tension: 0.4,
          yAxisID: 'y',
          pointRadius: 0,
          pointHoverRadius: 0
        },
        selectedMetrics.includes('network') && {
          label: 'Network',
          data: sampleData.map(item => item.network),
          borderColor: 'rgb(255, 165, 0)',
          backgroundColor: 'rgba(255, 165, 0, 0.1)',
          borderWidth: CHART_LINE_BORDER_WIDTH,
          fill: true,
          tension: 0.4,
          yAxisID: 'y1',
          pointRadius: 0,
          pointHoverRadius: 0
        },
        selectedMetrics.includes('battery') && {
          label: 'Battery %',
          data: sampleData.map(item => item.battery !== null && item.battery !== undefined ? item.battery : null),
          borderColor: 'rgb(147, 51, 234)',
          backgroundColor: 'rgba(147, 51, 234, 0.1)',
          borderWidth: CHART_LINE_BORDER_WIDTH,
          fill: true,
          tension: 0.4,
          yAxisID: 'y',
          spanGaps: true, // Connect points even when battery data is null
          pointRadius: 0,
          pointHoverRadius: 0
        }
      ].filter(Boolean)
    };
  }, [sampleData, selectedRange, selectedMetrics]);

  // Memoize chart options to prevent re-renders
  const chartOptions = useMemo(() => {
    // Detect current theme
    const bodyTheme = document.body?.getAttribute('data-theme');
    const htmlTheme = document.documentElement?.getAttribute('data-theme');
    const currentTheme = bodyTheme || htmlTheme;
    const isDark = currentTheme === 'dark' || 
                   (!currentTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    // Ensure tooltip has proper contrast
    const finalTooltipBg = isDark 
      ? 'rgba(26, 26, 26, 0.95)' 
      : 'rgba(255, 255, 255, 0.95)';
    
    // Use theme colors, with fallbacks if they're still white in light theme
    const textPrimaryColor = themeColors.textPrimary && themeColors.textPrimary !== '#ffffff' 
      ? themeColors.textPrimary 
      : (isDark ? '#ffffff' : '#1a1a1a');
    const textMutedColor = themeColors.textMuted && !themeColors.textMuted.includes('255, 255, 255')
      ? themeColors.textMuted
      : (isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(26, 26, 26, 0.7)');
    const borderColorValue = themeColors.borderColor && !themeColors.borderColor.includes('255, 255, 255')
      ? themeColors.borderColor
      : (isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)');
    
    console.log('HistoryChart: Chart options updated', {
      isDark,
      currentTheme,
      textPrimaryColor,
      textMutedColor,
      borderColorValue,
      themeColors
    });
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0 // Disable animation to prevent flickering
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: textPrimaryColor,
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: finalTooltipBg,
          titleColor: textPrimaryColor,
          bodyColor: textPrimaryColor,
          borderColor: borderColorValue,
          borderWidth: 1,
          padding: 12,
          titleFont: {
            size: 13,
            weight: 'bold'
          },
          bodyFont: {
            size: 12
          },
          displayColors: true,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += context.dataset.label?.includes('KB/s') || context.dataset.label?.includes('Network')
                  ? formatNetworkSpeed(context.parsed.y)
                  : Math.round(context.parsed.y) + '%';
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textMutedColor,
            maxRotation: 45,
            minRotation: 0,
            font: {
              size: 11
            },
            maxTicksLimit: tickCount // Width-based: TICK_SPACING_PX between ticks for all ranges
          },
          grid: {
            color: borderColorValue,
            drawBorder: true
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          min: 0,
          max: 100,
          ticks: {
            color: textMutedColor,
            font: {
              size: 11
            },
            callback: function(value) {
              return value + '%';
            }
          },
          grid: {
            color: borderColorValue,
            drawBorder: true
          }
        },
        y1: {
          type: 'linear',
          display: selectedMetrics.includes('network'),
          position: 'right',
          min: 0,
          ticks: {
            color: textMutedColor,
            font: {
              size: 11
            },
            callback: function(value) {
              return formatNetworkSpeed(value);
            }
          },
          grid: {
            drawOnChartArea: false,
            color: borderColorValue,
            drawBorder: true
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    };
  }, [themeColors, selectedMetrics, tickCount]);

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-theme-primary">Performance History</h2>
        <div className="flex items-center gap-2">
          {/* Metric toggles */}
          <div className="flex gap-1">
            {['cpu', 'ram', 'disk', 'network', 'battery'].map(metric => (
              <button
                key={metric}
                onClick={() => toggleMetric(metric)}
                className={`px-2 py-1 text-xs rounded transition-colors duration-200 ${
                  selectedMetrics.includes(metric)
                    ? 'bg-red-500 text-white'
                    : 'bg-theme-secondary text-theme-muted hover:bg-theme-card-hover'
                }`}
                title={`Toggle ${metric.toUpperCase()}`}
              >
                {metric.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Range selector + custom date range picker */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {rangeOptions.map(option => (
          <button
            key={option.value}
            onClick={() => handleRangeChange(option.value)}
            className={`px-3 py-1 text-sm rounded transition-colors duration-200 ${
              selectedRange === option.value
                ? 'bg-red-500 text-white'
                : 'bg-theme-secondary text-theme-primary hover:bg-theme-card-hover'
            }`}
          >
            {option.label}
          </button>
        ))}
        {selectedRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 ml-2 pl-2 border-l border-theme">
            <label className="flex items-center gap-1.5 text-sm text-theme-muted">
              <span>From</span>
              <input
                type="datetime-local"
                value={customRangeStart}
                onChange={(e) => handleCustomRangeChange('start', e.target.value)}
                className="bg-theme-secondary border border-theme rounded px-2 py-1 text-sm text-theme-primary focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-theme-muted">
              <span>To</span>
              <input
                type="datetime-local"
                value={customRangeEnd}
                onChange={(e) => handleCustomRangeChange('end', e.target.value)}
                className="bg-theme-secondary border border-theme rounded px-2 py-1 text-sm text-theme-primary focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </label>
          </div>
        )}
      </div>

      {/* Chart - ref used to measure width for tick count (1h, 6h, 24h, 7d, 30d, custom) */}
      <div ref={chartContainerRef} className="h-64">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary mx-auto mb-2"></div>
              <p className="text-theme-muted text-sm">Loading history...</p>
            </div>
          </div>
        ) : historyData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-theme-muted">No history data available</p>
          </div>
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>

      {/* Stats summary */}
      {historyData.length > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          {selectedMetrics.includes('cpu') && (
            <div className="text-center">
              <div className="text-theme-muted">CPU Avg</div>
              <div className="text-theme-primary font-semibold">
                {Math.round(historyData.reduce((sum, d) => sum + d.cpu, 0) / historyData.length)}%
              </div>
            </div>
          )}
          {selectedMetrics.includes('ram') && (
            <div className="text-center">
              <div className="text-theme-muted">RAM Avg</div>
              <div className="text-theme-primary font-semibold">
                {Math.round(historyData.reduce((sum, d) => sum + d.ram, 0) / historyData.length)}%
              </div>
            </div>
          )}
          {selectedMetrics.includes('disk') && (
            <div className="text-center">
              <div className="text-theme-muted">Disk Avg</div>
              <div className="text-theme-primary font-semibold">
                {Math.round(historyData.reduce((sum, d) => sum + d.disk, 0) / historyData.length)}%
              </div>
            </div>
          )}
          {selectedMetrics.includes('network') && (
            <div className="text-center">
              <div className="text-theme-muted">Network Avg</div>
              <div className="text-theme-primary font-semibold">
                {formatNetworkSpeed(historyData.reduce((sum, d) => sum + d.network, 0) / historyData.length)}
              </div>
            </div>
          )}
          {selectedMetrics.includes('battery') && (
            <div className="text-center">
              <div className="text-theme-muted">Battery Avg</div>
              <div className="text-theme-primary font-semibold">
                {(() => {
                  const batteryData = historyData.filter(d => d.battery !== null && d.battery !== undefined);
                  if (batteryData.length === 0) return 'N/A';
                  return Math.round(batteryData.reduce((sum, d) => sum + d.battery, 0) / batteryData.length) + '%';
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HistoryChart;

