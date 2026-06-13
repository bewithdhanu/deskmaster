const TAB_IDS = [
  'home',
  'world-clocks',
  'system-performance',
  'notes',
  'agent',
  'uptime',
  'clipboard',
  'authenticator',
  'settings'
]

const SETTINGS_SECTION_IDS = [
  'system-stats',
  'world-clocks',
  'system-behavior',
  'appearance',
  'api-keys',
  'agent',
  'uptime-kuma',
  'data-management',
  'cloud-backup'
]

const listeners = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function normalizeTab(tab) {
  if (tab && TAB_IDS.includes(tab)) return tab
  return 'home'
}

function normalizeSettingsSection(section) {
  if (section && SETTINGS_SECTION_IDS.includes(section)) return section
  return null
}

export function parseRoute() {
  const raw = window.location.hash.replace(/^#/, '').trim()
  if (!raw) {
    return { tab: 'home' }
  }

  const path = raw.startsWith('/') ? raw : `/${raw}`
  const segments = path.split('/').filter(Boolean)
  if (!segments.length) {
    return { tab: 'home' }
  }

  const tab = normalizeTab(segments[0])

  if (tab === 'settings') {
    return {
      tab,
      settingsSection: normalizeSettingsSection(segments[1]) || 'system-stats'
    }
  }

  if (tab === 'agent' && segments[1] === 'chat' && segments[2]) {
    return {
      tab,
      chatId: decodeURIComponent(segments[2])
    }
  }

  if (tab === 'notes' && segments[1] === 'note' && segments[2]) {
    return {
      tab,
      noteId: decodeURIComponent(segments[2])
    }
  }

  return { tab }
}

let cachedHash = ''
let cachedRoute = { tab: 'home' }

function routeFieldsEqual(a, b) {
  return (
    a.tab === b.tab &&
    a.settingsSection === b.settingsSection &&
    a.chatId === b.chatId &&
    a.noteId === b.noteId
  )
}

function syncRouteCache() {
  const hash = window.location.hash || '#'
  if (hash === cachedHash) return cachedRoute

  const next = parseRoute()
  cachedHash = hash
  if (!routeFieldsEqual(next, cachedRoute)) {
    cachedRoute = next
  }
  return cachedRoute
}

export function buildRoute({ tab, settingsSection, chatId, noteId } = {}) {
  const normalizedTab = normalizeTab(tab)
  let path = `/${normalizedTab}`

  if (normalizedTab === 'settings') {
    const section = normalizeSettingsSection(settingsSection) || 'system-stats'
    path += `/${section}`
  }

  if (normalizedTab === 'agent' && chatId) {
    path += `/chat/${encodeURIComponent(chatId)}`
  }

  if (normalizedTab === 'notes' && noteId) {
    path += `/note/${encodeURIComponent(noteId)}`
  }

  return `#${path}`
}

export function getRoute() {
  return syncRouteCache()
}

export function navigate(route, { replace = false } = {}) {
  const hash = buildRoute(route)
  if (window.location.hash === hash) return

  if (replace) {
    window.history.replaceState(null, '', hash)
  } else {
    window.history.pushState(null, '', hash)
  }

  cachedHash = hash
  const next = parseRoute()
  if (!routeFieldsEqual(next, cachedRoute)) {
    cachedRoute = next
  }
  notifyListeners()
}

function initDefaultRoute() {
  const hash = window.location.hash
  if (!hash || hash === '#') {
    const lastTab = localStorage.getItem('lastActiveTab') || 'home'
    navigate({ tab: normalizeTab(lastTab) }, { replace: true })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', notifyListeners)
  window.addEventListener('popstate', notifyListeners)
  initDefaultRoute()
}

export { TAB_IDS, SETTINGS_SECTION_IDS }
