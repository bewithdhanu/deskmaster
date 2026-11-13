/** Chrome-like workspace tabs: Home is pinned; other sections can have many instances. */

export const HOME_TAB_ID = 'home'

export const TAB_LABELS = {
  home: 'Home',
  'world-clocks': 'World Clocks',
  'system-performance': 'Performance',
  notes: 'Notes',
  agent: 'Agent',
  uptime: 'Uptime',
  clipboard: 'Clipboard',
  authenticator: 'Authenticator',
  'fake-identity': 'Fake Identity',
  settings: 'Settings'
}

export function createTabId(type) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function defaultRouteForType(type) {
  if (type === 'settings') return { tab: 'settings', settingsSection: 'system-stats' }
  return { tab: type }
}

export function titleForNewTab(type, existingTabs) {
  const base = TAB_LABELS[type] || type
  const count = existingTabs.filter((t) => t.type === type).length
  return count === 0 ? base : `${base} (${count + 1})`
}

export function createHomeTab() {
  return {
    id: HOME_TAB_ID,
    type: 'home',
    title: 'Home',
    pinned: true,
    route: { tab: 'home' }
  }
}

export function createWorkspaceTab(type, existingTabs, route) {
  return {
    id: createTabId(type),
    type,
    title: titleForNewTab(type, existingTabs),
    pinned: false,
    route: route || defaultRouteForType(type)
  }
}

/** In-memory route bus for one workspace tab (so Notes/Agent/Settings don't share the URL). */
export function createTabRouteApi(initialRoute, { onChange, isFocused } = {}) {
  let route = { ...initialRoute }
  const listeners = new Set()

  const notify = () => {
    listeners.forEach((fn) => {
      try {
        fn()
      } catch {}
    })
  }

  return {
    getRoute: () => route,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    navigate: (next, { replace = false } = {}) => {
      const merged = { ...next }
      if (!merged.tab) merged.tab = route.tab
      const same =
        merged.tab === route.tab &&
        merged.settingsSection === route.settingsSection &&
        merged.chatId === route.chatId &&
        merged.noteId === route.noteId
      if (same) return
      route = merged
      notify()
      onChange?.(route, { replace })
      if (isFocused?.()) {
        // Parent also mirrors focused tab to the window hash
      }
    },
    replaceRoute: (next) => {
      route = { ...next }
      notify()
    }
  }
}
