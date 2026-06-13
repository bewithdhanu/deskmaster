import React, { useState, useEffect } from 'react';
import TimezoneManager from './components/TimezoneManager';
import SystemPerformance from './components/SystemPerformance';
import Tools from './components/Tools';
import ClipboardHistory from './components/ClipboardHistory';
import Authenticator from './components/Authenticator';
import Notes from './components/Notes';
import UptimeMonitor from './components/UptimeMonitor';
import Settings from './components/Settings';
import Agent from './components/Agent';
import Navigation from './components/Navigation';
import { getIpcRenderer } from './utils/electron';
import { isUptimeKumaEnabled } from './utils/uptimeKuma';
import { navigate } from './utils/appRoute';
import { useAppRoute } from './utils/useAppRoute';

const ipcRenderer = getIpcRenderer();

const PROTECTED_TABS = ['clipboard', 'authenticator', 'settings'];

function App() {
  const route = useAppRoute();
  const activeTab = route.tab;
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [uptimeKumaEnabled, setUptimeKumaEnabled] = useState(true);

  const [authState, setAuthState] = useState(() => {
    const stored = localStorage.getItem('authState');
    if (stored) {
      const parsed = JSON.parse(stored);
      const AUTH_TIMEOUT = 5 * 60 * 1000;
      if (Date.now() - parsed.timestamp < AUTH_TIMEOUT) {
        return parsed;
      }
    }
    return { authenticated: false, timestamp: 0 };
  });

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

  useEffect(() => {
    const checkAuthForRoute = async () => {
      if (!PROTECTED_TABS.includes(activeTab)) return;

      const AUTH_TIMEOUT = 5 * 60 * 1000;
      const isAuthenticated =
        authState.authenticated && Date.now() - authState.timestamp < AUTH_TIMEOUT;

      if (!isAuthenticated) {
        const tabNames = {
          clipboard: 'Clipboard',
          authenticator: 'Authenticator',
          settings: 'Settings'
        };
        const reason = `Access to ${tabNames[activeTab]} requires authentication`;
        const authenticated = await authenticateUser(reason);

        if (!authenticated) {
          navigate({ tab: 'home' }, { replace: true });
          localStorage.setItem('lastActiveTab', 'home');
        }
      }
    };

    checkAuthForRoute();
  }, [activeTab]);

  useEffect(() => {
    const loadUptimeSetting = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings');
        setUptimeKumaEnabled(isUptimeKumaEnabled(settings));
      } catch (error) {
        console.error('Error loading uptime setting:', error);
      }
    };

    const handleSettingsUpdate = (event, newSettings) => {
      if (newSettings?.uptimeKuma !== undefined) {
        setUptimeKumaEnabled(isUptimeKumaEnabled(newSettings));
      }
    };

    loadUptimeSetting();
    ipcRenderer.on('settings-updated', handleSettingsUpdate);

    return () => {
      ipcRenderer.removeListener('settings-updated', handleSettingsUpdate);
    };
  }, []);

  useEffect(() => {
    if (!uptimeKumaEnabled && activeTab === 'uptime') {
      navigate({ tab: 'home' }, { replace: true });
    }
  }, [uptimeKumaEnabled, activeTab]);

  useEffect(() => {
    localStorage.setItem('lastActiveTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const getInitialTheme = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings');
        if (settings && settings.theme) {
          let effectiveTheme = settings.theme;
          if (settings.theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            effectiveTheme = prefersDark ? 'dark' : 'light';
          }
          setCurrentTheme(effectiveTheme);
          applyTheme(effectiveTheme);
        } else {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const initialTheme = prefersDark ? 'dark' : 'light';
          setCurrentTheme(initialTheme);
          applyTheme(initialTheme);
        }
      } catch (error) {
        console.error('Error getting initial theme:', error);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = prefersDark ? 'dark' : 'light';
        setCurrentTheme(initialTheme);
        applyTheme(initialTheme);
      }
    };

    getInitialTheme();

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

  const handleTabChange = async (tabId) => {
    if (tabId === 'uptime' && !uptimeKumaEnabled) {
      return;
    }

    if (PROTECTED_TABS.includes(tabId)) {
      const AUTH_TIMEOUT = 5 * 60 * 1000;
      const isAuthenticated =
        authState.authenticated && Date.now() - authState.timestamp < AUTH_TIMEOUT;

      if (!isAuthenticated) {
        const tabNames = {
          clipboard: 'Clipboard',
          authenticator: 'Authenticator',
          settings: 'Settings'
        };
        const reason = `Access to ${tabNames[tabId]} requires authentication`;
        const authenticated = await authenticateUser(reason);

        if (!authenticated) {
          return;
        }
      }
    }

    const nextRoute = { tab: tabId };

    if (tabId === 'settings') {
      nextRoute.settingsSection =
        route.tab === 'settings' && route.settingsSection ? route.settingsSection : 'system-stats';
    }

    if (tabId === 'agent' && route.tab === 'agent' && route.chatId) {
      nextRoute.chatId = route.chatId;
    }

    if (tabId === 'notes' && route.tab === 'notes' && route.noteId) {
      nextRoute.noteId = route.noteId;
    }

    navigate(nextRoute);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Tools />;
      case 'world-clocks':
        return <TimezoneManager />;
      case 'system-performance':
        return <SystemPerformance />;
      case 'clipboard':
        return <ClipboardHistory />;
      case 'authenticator':
        return <Authenticator />;
      case 'notes':
        return <Notes />;
      case 'agent':
        return <Agent />;
      case 'uptime':
        return uptimeKumaEnabled ? <UptimeMonitor /> : <Tools />;
      case 'settings':
        return <Settings />;
      default:
        return <Tools />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-theme-primary text-theme-primary">
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} uptimeKumaEnabled={uptimeKumaEnabled} />
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
