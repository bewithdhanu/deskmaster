import React, { useState, useEffect } from 'react';
import Home from './components/Home';
import TimezoneManager from './components/TimezoneManager';
import SystemPerformance from './components/SystemPerformance';
import Tools from './components/Tools';
import ClipboardHistory from './components/ClipboardHistory';
import Authenticator from './components/Authenticator';
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

  // Authentication state: tracks when user was last authenticated
  const [authState, setAuthState] = useState(() => {
    const stored = localStorage.getItem('authState');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Check if authentication is still valid (5 minutes timeout)
      const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes
      if (Date.now() - parsed.timestamp < AUTH_TIMEOUT) {
        return parsed;
      }
    }
    return { authenticated: false, timestamp: 0 };
  });
  
  // Protected tabs that require authentication
  const PROTECTED_TABS = ['clipboard', 'authenticator', 'settings'];

  const authenticateUser = async (reason) => {
    try {
      const result = await ipcRenderer.invoke('authenticate-user', reason);
      if (result && result.authenticated) {
        const newAuthState = { authenticated: true, timestamp: Date.now() };
        setAuthState(newAuthState);
        localStorage.setItem('authState', JSON.stringify(newAuthState));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  };

  // Check authentication on mount if user is on a protected tab
  useEffect(() => {
    const checkInitialAuth = async () => {
      if (PROTECTED_TABS.includes(activeTab)) {
        const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes
        const isAuthenticated = authState.authenticated && 
                                (Date.now() - authState.timestamp < AUTH_TIMEOUT);
        
        if (!isAuthenticated) {
          const tabNames = {
            clipboard: 'Clipboard',
            authenticator: 'Authenticator',
            settings: 'Settings'
          };
          const reason = `Access to ${tabNames[activeTab]} requires authentication`;
          const authenticated = await authenticateUser(reason);
          
          if (!authenticated) {
            // Redirect to home if authentication failed
            setActiveTab('home');
            localStorage.setItem('lastActiveTab', 'home');
          }
        }
      }
    };
    
    checkInitialAuth();
  }, []); // Only run on mount

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

  const handleTabChange = async (tabId) => {
    // Check if this tab requires authentication
    if (PROTECTED_TABS.includes(tabId)) {
      // Check if user is already authenticated (within timeout)
      const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes
      const isAuthenticated = authState.authenticated && 
                              (Date.now() - authState.timestamp < AUTH_TIMEOUT);
      
      if (!isAuthenticated) {
        // Prompt for authentication
        const tabNames = {
          clipboard: 'Clipboard',
          authenticator: 'Authenticator',
          settings: 'Settings'
        };
        const reason = `Access to ${tabNames[tabId]} requires authentication`;
        const authenticated = await authenticateUser(reason);
        
        if (!authenticated) {
          // User cancelled or failed authentication, don't switch tabs
          return;
        }
      }
    }
    
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
      case 'system-performance':
        return <SystemPerformance />;
      case 'tools':
        return <Tools />;
      case 'clipboard':
        return <ClipboardHistory />;
      case 'authenticator':
        return <Authenticator />;
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
