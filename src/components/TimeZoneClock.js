import React, { useState } from 'react';
import moment from 'moment-timezone';

const TimeZoneClock = ({ city, timezone, offsetMinutes, datetimeFormat, onDateTimeChange }) => {
  const baseDate = new Date();
  const adjustedDate = new Date(baseDate.getTime() + offsetMinutes * 60000);
  
  // Use moment.js to format according to user's selected format
  const momentTime = moment(adjustedDate).tz(timezone);
  const formattedDateTime = momentTime.format(datetimeFormat || 'HH:mm:ss');
  
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState(momentTime.format('YYYY-MM-DDTHH:mm'));

  const handleDateTimeChange = (event) => {
    const newDateTime = event.target.value;
    setSelectedDateTime(newDateTime);
    
    if (onDateTimeChange) {
      // Convert the selected datetime to a moment object and calculate offset
      const selectedMoment = moment(newDateTime).tz(timezone);
      const now = moment();
      const offsetMinutes = selectedMoment.diff(now, 'minutes');
      onDateTimeChange(offsetMinutes);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setSelectedDateTime(momentTime.format('YYYY-MM-DDTHH:mm'));
  };

  const handleNowClick = () => {
    const now = moment().format('YYYY-MM-DDTHH:mm');
    setSelectedDateTime(now);
    if (onDateTimeChange) {
      onDateTimeChange(0); // Reset to current time
    }
    setIsEditing(false);
  };

  const handleCloseClick = () => {
    setIsEditing(false);
  };

  return (
    <div className="py-2 px-4 border-b border-theme last:border-b-0 bg-theme-card hover:bg-theme-card-hover transition-colors duration-200 rounded-lg mb-1">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-theme-primary">{city}</h3>
          <p className="text-xs text-theme-muted">{timezone}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <input
                  type="datetime-local"
                  value={selectedDateTime}
                  onChange={handleDateTimeChange}
                  className="px-2 py-1 text-xs bg-theme-primary text-theme-primary border border-theme rounded focus:outline-none focus:ring-2 focus:ring-accent-cpu"
                  style={{
                    colorScheme: 'light', // Force light color scheme for the input
                    WebkitAppearance: 'none',
                    MozAppearance: 'textfield'
                  }}
                  autoFocus
                />
                <button
                  onClick={handleNowClick}
                  className="text-xs px-2 py-1 bg-accent-cpu text-white rounded hover:bg-opacity-80 transition-colors duration-200"
                  title="Set to current time"
                >
                  Now
                </button>
                <button
                  onClick={handleCloseClick}
                  className="text-xs px-2 py-1 bg-theme-muted text-theme-primary rounded hover:bg-theme-card-hover transition-colors duration-200"
                  title="Close"
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-theme-primary">{formattedDateTime}</p>
                <button
                  onClick={handleEditClick}
                  className="text-xs text-theme-muted hover:text-theme-primary transition-colors duration-200 p-1 rounded hover:bg-theme-card-hover"
                  title="Change datetime"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeZoneClock;
