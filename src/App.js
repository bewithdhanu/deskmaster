import React, { useState, useEffect } from 'react';
import StatsManager from './components/StatsManager';
import TimezoneManager from './components/TimezoneManager';
import Header from './components/Header';

const { ipcRenderer } = window.require('electron');

function App() {
  const [currentTheme, setCurrentTheme] = useState('dark');

  useEffect(() => {
    // Apply initial theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = prefersDark ? 'dark' : 'light';
    setCurrentTheme(initialTheme);
    applyTheme(initialTheme);

    // Listen for theme changes
    const handleThemeChange = (event, theme) => {
      setCurrentTheme(theme);
      applyTheme(theme);
    };

    ipcRenderer.on('theme-changed', handleThemeChange);

    return () => {
      ipcRenderer.removeListener('theme-changed', handleThemeChange);
    };
  }, []);

  const applyTheme = (theme) => {
    document.body.setAttribute('data-theme', theme);
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <Header />
      <div className="container mx-auto p-4">
        <StatsManager />
        <TimezoneManager />
      </div>
    </div>
  );
}

export default App;
