import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import TabBar from './components/TabBar';
import FakeIdentityTool from './components/tools/FakeIdentityTool';
import { getIpcRenderer } from './utils/electron';
import { isUptimeKumaEnabled } from './utils/uptimeKuma';
import { navigate, getRoute } from './utils/appRoute';
import { useAppRoute } from './utils/useAppRoute';
import {
  HOME_TAB_ID,
  TAB_LABELS,
  createHomeTab,
  createWorkspaceTab,
  createTabRouteApi,
  defaultRouteForType
} from './utils/tabSession';

const ipcRenderer = getIpcRenderer();

const PROTECTED_TABS = ['clipboard', 'authenticator', 'settings'];
const AUTH_TIMEOUT = 5 * 60 * 1000;

function readAuthSession() {
  try {
    const stored = localStorage.getItem('authState');
    if (!stored) return { authenticated: false, timestamp: 0 };
    const parsed = JSON.parse(stored);
    if (parsed.authenticated && Date.now() - parsed.timestamp < AUTH_TIMEOUT) {
      return parsed;
    }
  } catch {}
  return { authenticated: false, timestamp: 0 };
}

function isAuthSessionValid(session = readAuthSession()) {
  return Boolean(session.authenticated && Date.now() - session.timestamp < AUTH_TIMEOUT);
}

function Pane({ type, routeApi, uptimeKumaEnabled }) {
  switch (type) {
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
      return <Notes routeApi={routeApi} />;
    case 'agent':
      return <Agent routeApi={routeApi} />;
    case 'uptime':
      return uptimeKumaEnabled ? <UptimeMonitor /> : null;
    case 'fake-identity':
      return <FakeIdentityTool variant="page" />;
    case 'settings':
      return <Settings routeApi={routeApi} />;
    default:
      return null;
  }
}

function App() {
  const hashRoute = useAppRoute();
  const [tabs, setTabs] = useState(() => [createHomeTab()]);
  const [activeId, setActiveId] = useState(HOME_TAB_ID);
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [uptimeKumaEnabled, setUptimeKumaEnabled] = useState(true);
  const skipRouteAuthCheckRef = useRef(null);
  const authInFlightRef = useRef(false);
  const tabsRef = useRef(tabs);
  const activeIdRef = useRef(activeId);
  const bootstrappedRef = useRef(false);
  const routeApisRef = useRef({});

  tabsRef.current = tabs;
  activeIdRef.current = activeId;

  const activeTab = tabs.find((t) => t.id === activeId) || tabs[0];
  const activeType = activeTab?.type || 'home';

  const authenticateUser = async (reason) => {
    if (authInFlightRef.current) {
      return isAuthSessionValid();
    }

    authInFlightRef.current = true;
    try {
      const result = await ipcRenderer.invoke('authenticate-user', reason);
      if (result && result.authenticated) {
        localStorage.setItem('authState', JSON.stringify({ authenticated: true, timestamp: Date.now() }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    } finally {
      authInFlightRef.current = false;
    }
  };

  const getRouteApi = useCallback((tab) => {
    if (tab.type !== 'notes' && tab.type !== 'agent' && tab.type !== 'settings') return undefined;
    if (!routeApisRef.current[tab.id]) {
      routeApisRef.current[tab.id] = createTabRouteApi(tab.route || defaultRouteForType(tab.type), {
        onChange: (route, { replace } = {}) => {
          setTabs((list) => list.map((t) => (t.id === tab.id ? { ...t, route } : t)));
          if (activeIdRef.current === tab.id) {
            navigate(route, { replace: replace !== false });
          }
        },
        isFocused: () => activeIdRef.current === tab.id
      });
    }
    return routeApisRef.current[tab.id];
  }, []);

  const focusTab = useCallback((id) => {
    const tab = tabsRef.current.find((t) => t.id === id);
    if (!tab) return;
    setActiveId(id);
    const api = routeApisRef.current[id];
    const route = api?.getRoute?.() || tab.route || defaultRouteForType(tab.type);
    navigate(route, { replace: true });
    if (!PROTECTED_TABS.includes(tab.type)) {
      localStorage.setItem('lastActiveTab', tab.type);
    }
  }, []);

  const closeTab = useCallback((id) => {
    if (id === HOME_TAB_ID) return;
    setTabs((list) => {
      const index = list.findIndex((t) => t.id === id);
      if (index < 0) return list;
      const next = list.filter((t) => t.id !== id);
      if (activeIdRef.current === id) {
        const fallback = next[Math.max(0, index - 1)] || next[0];
        if (fallback) {
          queueMicrotask(() => focusTab(fallback.id));
        }
      }
      return next;
    });
    delete routeApisRef.current[id];
  }, [focusTab]);

  const openNewTab = useCallback(async (type) => {
    if (type === 'home') {
      focusTab(HOME_TAB_ID);
      return;
    }
    if (type === 'uptime' && !uptimeKumaEnabled) return;

    if (PROTECTED_TABS.includes(type)) {
      if (!isAuthSessionValid()) {
        const reason = `Access to ${TAB_LABELS[type] || type} requires authentication`;
        const authenticated = await authenticateUser(reason);
        if (!authenticated) return;
        skipRouteAuthCheckRef.current = type;
      }
    }

    const tab = createWorkspaceTab(type, tabsRef.current);
    getRouteApi(tab);
    setTabs((list) => [...list, tab]);
    setActiveId(tab.id);
    navigate(tab.route, { replace: true });
    if (!PROTECTED_TABS.includes(type)) {
      localStorage.setItem('lastActiveTab', type);
    }
  }, [focusTab, uptimeKumaEnabled, getRouteApi]);

  // Cold start / deep link: open a tab for the current hash once
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const route = getRoute();
    if (!route.tab || route.tab === 'home') return;
    if (route.tab === 'uptime' && !uptimeKumaEnabled) return;
    if (PROTECTED_TABS.includes(route.tab) && !isAuthSessionValid()) {
      navigate({ tab: 'home' }, { replace: true });
      return;
    }
    const tab = createWorkspaceTab(route.tab, [], route);
    getRouteApi(tab);
    setTabs([createHomeTab(), tab]);
    setActiveId(tab.id);
  }, [uptimeKumaEnabled, getRouteApi]);

  // Keep focused tab's stored route in sync when hash changes (back/forward, in-tab navigate)
  useEffect(() => {
    const id = activeIdRef.current;
    const focused = tabsRef.current.find((t) => t.id === id);
    if (!focused || hashRoute.tab !== focused.type) return;
    setTabs((list) =>
      list.map((t) => (t.id === id ? { ...t, route: { ...hashRoute } } : t))
    );
    routeApisRef.current[id]?.replaceRoute?.(hashRoute);
  }, [hashRoute]);

  useEffect(() => {
    const checkAuthForRoute = async () => {
      if (!PROTECTED_TABS.includes(activeType)) return;

      if (skipRouteAuthCheckRef.current === activeType) {
        skipRouteAuthCheckRef.current = null;
        return;
      }

      if (!isAuthSessionValid()) {
        const reason = `Access to ${TAB_LABELS[activeType] || activeType} requires authentication`;
        const authenticated = await authenticateUser(reason);

        if (!authenticated) {
          closeTab(activeId);
          focusTab(HOME_TAB_ID);
        }
      }
    };

    checkAuthForRoute();
  }, [activeType, activeId, closeTab, focusTab]);

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
    if (!uptimeKumaEnabled) {
      setTabs((list) => {
        const next = list.filter((t) => t.type !== 'uptime');
        if (next.length !== list.length && activeIdRef.current && !next.find((t) => t.id === activeIdRef.current)) {
          queueMicrotask(() => focusTab(HOME_TAB_ID));
        }
        return next;
      });
    }
  }, [uptimeKumaEnabled, focusTab]);

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

  // Home widget "Open page" uses global navigate — open/focus a Fake Identity tab
  useEffect(() => {
    if (hashRoute.tab !== 'fake-identity') return;
    const focused = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (focused?.type === 'fake-identity') return;
    const existing = tabsRef.current.find((t) => t.type === 'fake-identity');
    if (existing) {
      focusTab(existing.id);
      return;
    }
    const tab = createWorkspaceTab('fake-identity', tabsRef.current, { tab: 'fake-identity' });
    setTabs((list) => [...list, tab]);
    setActiveId(tab.id);
  }, [hashRoute.tab, focusTab]);

  const openTypes = useMemo(() => new Set(tabs.map((t) => t.type)), [tabs]);

  const reorderTabs = useCallback((fromId, toId) => {
    setTabs((list) => {
      const from = list.findIndex((t) => t.id === fromId);
      const to = list.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0 || list[from]?.pinned || list[to]?.pinned) return list;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      // Keep Home pinned at index 0
      const homeIdx = next.findIndex((t) => t.id === HOME_TAB_ID);
      if (homeIdx > 0) {
        const [home] = next.splice(homeIdx, 1);
        next.unshift(home);
      }
      return next;
    });
  }, []);

  const closeOtherTabs = useCallback((keepId) => {
    setTabs((list) => {
      list.forEach((t) => {
        if (!t.pinned && t.id !== keepId) delete routeApisRef.current[t.id];
      });
      return list.filter((t) => t.pinned || t.id === keepId);
    });
    if (activeIdRef.current !== keepId) {
      queueMicrotask(() => focusTab(keepId));
    }
  }, [focusTab]);

  const closeTabsToRight = useCallback((fromId) => {
    setTabs((list) => {
      const index = list.findIndex((t) => t.id === fromId);
      if (index < 0) return list;
      list.slice(index + 1).forEach((t) => {
        if (!t.pinned) delete routeApisRef.current[t.id];
      });
      return list.filter((t, i) => t.pinned || i <= index);
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs((list) => {
      list.forEach((t) => {
        if (!t.pinned) delete routeApisRef.current[t.id];
      });
      return list.filter((t) => t.pinned);
    });
    queueMicrotask(() => focusTab(HOME_TAB_ID));
  }, [focusTab]);

  return (
    <div className="flex h-screen flex-col bg-theme-primary text-theme-primary">
      <TabBar
        tabs={tabs}
        activeId={activeId}
        onFocus={focusTab}
        onClose={closeTab}
        onReorder={reorderTabs}
        onCloseOthers={closeOtherTabs}
        onCloseToRight={closeTabsToRight}
        onCloseAll={closeAllTabs}
      />
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <Navigation
          activeTab={activeType}
          openTypes={openTypes}
          onTabChange={openNewTab}
          uptimeKumaEnabled={uptimeKumaEnabled}
        />
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={tab.id === activeId ? 'h-full' : 'hidden'}
              aria-hidden={tab.id !== activeId}
            >
              <Pane
                type={tab.type}
                routeApi={getRouteApi(tab)}
                uptimeKumaEnabled={uptimeKumaEnabled}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
