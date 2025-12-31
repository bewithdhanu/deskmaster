import React, { useState, useEffect } from 'react';
import Home from './components/Home';
import TimezoneManager from './components/TimezoneManager';
import Settings from './components/Settings';
import Navigation from './components/Navigation';
import { getIpcRenderer } from './utils/electron';

const ipcRenderer = getIpcRenderer();

function App() {
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState(() => {
    // Get last active tab from localStorage, default to 'home'
    return localStorage.getItem('lastActiveTab') || 'home';
  });

  useEffect(() => {
    // Get initial theme from main process
    const getInitialTheme = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings');
        if (settings && settings.theme) {
          // Determine effective theme based on user setting
          let effectiveTheme = settings.theme;
          if (settings.theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            effectiveTheme = prefersDark ? 'dark' : 'light';
          }
          console.log('Initial theme from settings:', effectiveTheme, '(user setting:', settings.theme, ')');
          setCurrentTheme(effectiveTheme);
          applyTheme(effectiveTheme);
        } else {
          // Fallback to system theme if no settings
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const initialTheme = prefersDark ? 'dark' : 'light';
          setCurrentTheme(initialTheme);
          applyTheme(initialTheme);
        }
      } catch (error) {
        console.error('Error getting initial theme:', error);
        // Fallback to system theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = prefersDark ? 'dark' : 'light';
    setCurrentTheme(initialTheme);
    applyTheme(initialTheme);
      }
    };

    getInitialTheme();

    // Listen for theme changes
    const handleThemeChange = (event, theme) => {
      console.log('Theme changed in renderer:', theme);
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

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    // Save the active tab to localStorage
    localStorage.setItem('lastActiveTab', tabId);
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
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
