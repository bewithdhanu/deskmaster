import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment';

const HorizontalTimeline = ({ onTimeOffsetChange, datetimeFormat }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef(null);
  const startX = useRef(0);
  const startScroll = useRef(0);

  // Generate time labels for the timeline (every 15 minutes)
  const generateTimeLabels = () => {
    const labels = [];
    const totalMinutes = 24 * 60; // 24 hours
    const interval = 15; // 15-minute intervals
    
    for (let i = -totalMinutes; i <= totalMinutes; i += interval) {
      labels.push(i);
    }
    return labels;
  };

  const timeLabels = generateTimeLabels();
  const pixelsPerMinute = 3.5; // Adjust for scroll sensitivity

  const handleMouseDown = (e) => {
    setIsDragging(true);
    startX.current = e.clientX;
    startScroll.current = scrollOffset;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX.current;
    const newScroll = startScroll.current + deltaX;
    setScrollOffset(newScroll);
    
    // Calculate offset in minutes
    const offsetMinutes = -Math.round(newScroll / pixelsPerMinute);
    onTimeOffsetChange(offsetMinutes);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, scrollOffset]);

  const formatTime = (isDragging, minutes) => {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutes * 60000);
    
    if (isDragging) {
      // Use moment.js to format according to user's settings while dragging
      const momentTime = moment(targetTime);
      return momentTime.format(datetimeFormat);
    } else {
      // Show just time in AM/PM format when not dragging
      return targetTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit', 
        hour12: true
      });
    }
  };

  const formatRoundedTime = (minutes) => {
    const hours = Math.floor(Math.abs(minutes) / 60);
    const mins = Math.abs(minutes) % 60;
    const sign = minutes < 0 ? '-' : '+';
    return `${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-20 overflow-visible cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleMouseDown}
    >
        {/* Horizontal line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-timeline-line" />
      {/* Timeline container */}
      <div
        className="absolute top-1/2 left-0 right-0 h-px"
        style={{ transform: `translateX(${scrollOffset}px)` }}
      >
        
        
        {/* Time markers */}
        {timeLabels.map((minutes) => {
          const position = (minutes * pixelsPerMinute) + (containerRef.current?.clientWidth || 0) / 2;
          const isHourMark = minutes % 60 === 0;
          const isFifteenMark = minutes % 15 === 0;
          
          return (
            <div
              key={minutes}
              className="absolute"
              style={{ left: `${position}px` }}
            >
              {/* Tick mark */}
              <div
                className={`absolute bg-timeline-tick transition-all ${
                  isHourMark ? 'bottom-0 h-4 w-0.5' : isFifteenMark ? 'top-0 h-3 w-px' : 'top-0 h-2 w-px'
                }`}
              />
              
              {/* Time label */}
              {isFifteenMark && (
                <span
                  className={`absolute text-timeline-label transition-all ${
                    isHourMark ? 'bottom-4 text-sm font-semibold' : 'top-4 text-xs'
                  }`}
                  style={{ transform: 'translateX(-50%)' }}
                >
                  {formatRoundedTime(minutes)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Center marker (fixed position) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 w-5 h-5 bg-timeline-marker rounded-full blur-md opacity-50" />
          {/* Marker circle */}
          <div className="relative w-5 h-5 bg-timeline-marker rounded-full border-4 border-theme-card shadow-lg" />
        </div>
      </div>

      {/* Current time label */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 bg-timeline-marker text-white text-sm font-semibold whitespace-nowrap transition-all duration-300 px-3 py-1 ${
          isDragging ? 'rounded-full px-2 py-2' : 'rounded-full'
        }`}>
          {formatTime(isDragging, -Math.round(scrollOffset / pixelsPerMinute))}
        </div>
      </div>
    </div>
  );
};

export default HorizontalTimeline;
