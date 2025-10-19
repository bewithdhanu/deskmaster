import React, { useState, useEffect } from 'react';
import Home from './components/Home';
import TimezoneManager from './components/TimezoneManager';
import Settings from './components/Settings';
import Navigation from './components/Navigation';

const { ipcRenderer } = window.require('electron');

function App() {
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState('home');

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

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Home />;
      case 'world-clocks':
        return <TimezoneManager />;
      case 'settings':
        return <Settings />;
      default:
        return <Home />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-theme-primary text-theme-primary">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
