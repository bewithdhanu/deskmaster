import React, { useState, useEffect, useRef } from 'react';
import moment from 'moment-timezone';

const TimezoneDropdown = ({ onTimezoneSelect, selectedTimezone = null }) => {
  const [allTimezones, setAllTimezones] = useState([]);
  const [filteredTimezones, setFilteredTimezones] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Fallback timezone list
  const fallbackTimezones = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Seoul',
    'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Pacific/Honolulu',
    'UTC', 'America/Toronto', 'America/Vancouver', 'Europe/Amsterdam', 'Europe/Stockholm'
  ];

  useEffect(() => {
    initializeTimezones();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      filterTimezones(searchTerm);
    } else {
      setFilteredTimezones([]);
    }
  }, [searchTerm, allTimezones]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getTimezoneOffset = (timezone) => {
    try {
      return moment().tz(timezone).format('Z');
    } catch (error) {
      console.warn(`Failed to get timezone offset for ${timezone}:`, error);
      return 'Unknown';
    }
  };

  const initializeTimezones = () => {
    try {
      // Use moment-timezone's comprehensive timezone list
      const timezones = moment.tz.names();
      setAllTimezones(timezones);
    } catch (error) {
      console.warn('Failed to get timezone list from moment, using fallback:', error);
      setAllTimezones(fallbackTimezones);
    }
  };

  const filterTimezones = (searchTerm) => {
    const term = searchTerm.toLowerCase();
    const filtered = allTimezones.filter(tz => 
      tz.toLowerCase().includes(term) ||
      tz.replace(/_/g, ' ').toLowerCase().includes(term)
    ).slice(0, 20); // Limit to 20 results for performance

    setFilteredTimezones(filtered);
    setSelectedIndex(-1);
  };

  const selectTimezone = (timezone) => {
    onTimezoneSelect(timezone);
    setSearchTerm(timezone);
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowDropdown(value.length > 0);
    // Clear selected timezone when user starts typing
    if (selectedTimezone && value !== selectedTimezone) {
      onTimezoneSelect(null);
    }
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || filteredTimezones.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredTimezones.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredTimezones.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredTimezones.length) {
          selectTimezone(filteredTimezones[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const formatTimezoneName = (timezone) => {
    return timezone.replace(/_/g, ' ').replace(/\//g, ' / ');
  };

  const getTimezoneDetails = (timezone) => {
    const offset = getTimezoneOffset(timezone);
    return offset === 'Unknown' ? 'Unknown' : offset;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        id="timezone-search"
        placeholder="Search timezone or city..."
        autoComplete="off"
        value={selectedTimezone || searchTerm}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowDropdown(searchTerm.length > 0)}
        className="w-full px-3 py-3 border border-theme rounded-md bg-theme-secondary text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
      />
      
      {showDropdown && filteredTimezones.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-theme-secondary border border-theme border-t-0 rounded-b-md max-h-48 overflow-y-auto z-50 shadow-lg">
          {filteredTimezones.map((timezone, index) => (
            <div
              key={timezone}
              className={`px-3 py-3 cursor-pointer border-b border-theme transition-all duration-200 ${
                index === selectedIndex 
                  ? 'bg-red-500 text-white' 
                  : 'hover:bg-theme-card-hover text-theme-primary'
              }`}
              onClick={() => selectTimezone(timezone)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className={`font-semibold text-sm ${
                index === selectedIndex ? 'text-white' : 'text-theme-primary'
              }`}>
                {formatTimezoneName(timezone)}
              </div>
              <div className={`text-xs mt-1 ${
                index === selectedIndex ? 'text-red-100' : 'text-theme-muted'
              }`}>
                {getTimezoneDetails(timezone)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimezoneDropdown;
