const { io } = require('socket.io-client')
const config = require('./config')

const UPTIME_STATE_SECTION = 'uptimeKumaState'
const HOURLY_REFRESH_MS = 60 * 60 * 1000
const cacheTtlMs = () => Number(process.env.UPTIME_CACHE_TTL_MS || process.env.CACHE_TTL_MS || HOURLY_REFRESH_MS)

function getUptimeSettings() {
  const settings = config.getAppSettings()?.uptimeKuma || {}
  return {
    url: String(settings.url || '').trim().replace(/\/$/, ''),
    username: String(settings.username || '').trim(),
    password: String(settings.password || '')
  }
}

const kumaUrl = () => getUptimeSettings().url
const kumaUsername = () => getUptimeSettings().username
const kumaPassword = () => getUptimeSettings().password

const monitorCache = {
  payload: null,
  expiresAt: 0,
  refreshPromise: null,
  refreshedAt: null,
  queueProcessing: false,
  refreshTimer: null
}

function defaultLocalState() {
  return {
    cache: {
      payload: null,
      updatedAt: null
    },
    queue: []
  }
}

function getLocalState() {
  const state = config.getConfigSection(UPTIME_STATE_SECTION) || defaultLocalState()
  return {
    cache: {
      payload: state.cache?.payload || null,
      updatedAt: state.cache?.updatedAt || null
    },
    queue: Array.isArray(state.queue) ? state.queue : []
  }
}

function setLocalState(nextState) {
  config.setConfigSection(UPTIME_STATE_SECTION, nextState || defaultLocalState())
}

function getCachedPayload() {
  if (monitorCache.payload) return monitorCache.payload
  const state = getLocalState()
  if (state.cache?.payload) {
    monitorCache.payload = state.cache.payload
    monitorCache.refreshedAt = state.cache.updatedAt || state.cache.payload.generatedAt || null
    monitorCache.expiresAt = Date.now() + cacheTtlMs()
  }
  return monitorCache.payload
}

function getTraySummary() {
  const payload = getCachedPayload()
  const summary = payload?.summary || {}
  const monitors = Array.isArray(payload?.monitors) ? payload.monitors : []
  return {
    down: summary.down ?? monitors.filter((monitor) => monitor.status === 'DOWN').length,
    sslAttention: summary.sslExpiringSoon ?? monitors.filter((monitor) => monitor.sslDaysRemaining !== null && monitor.sslDaysRemaining <= 21).length,
    domainAttention: summary.domainExpiringSoon ?? monitors.filter((monitor) => monitor.domainExpiryDaysRemaining !== null && monitor.domainExpiryDaysRemaining <= 21).length
  }
}

function persistPayload(payload) {
  const state = getLocalState()
  const updatedAt = new Date().toISOString()
  const nextState = {
    ...state,
    cache: {
      payload,
      updatedAt
    }
  }
  setLocalState(nextState)
  monitorCache.payload = payload
  monitorCache.refreshedAt = updatedAt
  monitorCache.expiresAt = Date.now() + cacheTtlMs()
}

function hasSocketCredentials() {
  const settings = getUptimeSettings()
  return Boolean(settings.url && settings.username && settings.password)
}

function ensureCredentials() {
  if (!hasSocketCredentials()) {
    const error = new Error('Set Uptime Kuma URL, username, and password in Settings.')
    error.status = 500
    throw error
  }
}

function getDomain(monitor) {
  const monitorUrl = monitor.url && monitor.url !== 'null' ? monitor.url : ''
  if (monitorUrl) {
    try {
      return new URL(monitorUrl).hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      return ''
    }
  }

  return (monitor.hostname && monitor.hostname !== 'null' ? monitor.hostname : '')
    .replace(/^www\./, '')
    .toLowerCase()
}

function getBaseDomain(domain) {
  const parts = domain.split('.').filter(Boolean)
  return parts.length <= 2 ? domain : parts.slice(-2).join('.')
}

function getSubdomainKey(domain, baseDomain) {
  return domain === baseDomain ? '' : domain.slice(0, -(baseDomain.length + 1))
}

function normalizeDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function statusFromValue(value) {
  if (value === 1) return 'UP'
  if (value === 0) return 'DOWN'
  if (value === 2) return 'PENDING'
  if (value === 3) return 'MAINTENANCE'
  return 'UNKNOWN'
}

function expiryRiskStatus(type, days) {
  if (!Number.isFinite(days) || days > 21) return null
  if (days <= 7) return `${type} <= 7D`
  if (days <= 14) return `${type} <= 14D`
  return `${type} <= 21D`
}

function overallStatus(currentStatus, sslDaysRemaining, domainExpiryDaysRemaining) {
  const risks = [
    { status: expiryRiskStatus('SSL', sslDaysRemaining), days: sslDaysRemaining },
    { status: expiryRiskStatus('DOMAIN', domainExpiryDaysRemaining), days: domainExpiryDaysRemaining }
  ].filter((risk) => risk.status)

  if (risks.length > 0) return risks.sort((a, b) => a.days - b.days)[0].status
  return currentStatus
}

function latestHeartbeat(beats = []) {
  if (!Array.isArray(beats) || beats.length === 0) return null
  return beats.reduce((latest, beat) => {
    if (!latest) return beat
    return new Date(beat.time) > new Date(latest.time) ? beat : latest
  }, null)
}

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function safeNumber(value, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeAcceptedStatusCodes(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return ['200-299']
}

function sanitizeMonitorConfig(monitor) {
  return {
    id: monitor.id,
    name: monitor.name || '',
    type: monitor.type || 'http',
    url: monitor.url || '',
    method: monitor.method || 'GET',
    active: Boolean(monitor.active),
    interval: monitor.interval,
    retryInterval: monitor.retryInterval,
    maxretries: monitor.maxretries,
    timeout: monitor.timeout,
    maxredirects: monitor.maxredirects,
    accepted_statuscodes: monitor.accepted_statuscodes || ['200-299'],
    expiryNotification: Boolean(monitor.expiryNotification),
    domainExpiryNotification: Boolean(monitor.domainExpiryNotification),
    ignoreTls: Boolean(monitor.ignoreTls),
    description: monitor.description || ''
  }
}

function toClientMonitor(monitor, context) {
  const domain = getDomain(monitor)
  const baseDomain = getBaseDomain(domain)
  const heartbeat = latestHeartbeat(context.heartbeatList.get(Number(monitor.id)))
  const tlsInfo = context.tlsInfoList.get(Number(monitor.id))
  const domainInfo = context.domainInfoList.get(Number(monitor.id))
  const sslDaysRemaining = safeNumber(tlsInfo?.certInfo?.daysRemaining)
  const domainExpiryDaysRemaining = safeNumber(domainInfo?.daysRemaining)
  const currentStatus = monitor.active ? statusFromValue(safeNumber(heartbeat?.status)) : 'PAUSED'

  return {
    id: Number(monitor.id),
    name: monitor.name,
    type: monitor.type,
    url: monitor.url || '',
    domain,
    baseDomain,
    status: monitor.active ? overallStatus(currentStatus, sslDaysRemaining, domainExpiryDaysRemaining) : 'PAUSED',
    currentStatus,
    active: Boolean(monitor.active),
    sslDaysRemaining,
    sslExpiryDate: normalizeDate(tlsInfo?.certInfo?.validTo),
    sslValid: typeof tlsInfo?.valid === 'boolean' ? tlsInfo.valid : null,
    responseTimeMs: safeNumber(heartbeat?.ping, safeNumber(context.avgPingList.get(Number(monitor.id)))),
    domainExpiryDate: normalizeDate(domainInfo?.expiresOn),
    domainExpiryDaysRemaining,
    monitor: sanitizeMonitorConfig(monitor),
    subdomainKey: getSubdomainKey(domain, baseDomain)
  }
}

function sortMonitors(monitors) {
  return monitors.sort(
    (a, b) =>
      a.baseDomain.localeCompare(b.baseDomain) ||
      a.subdomainKey.localeCompare(b.subdomainKey) ||
      a.id - b.id
  )
}

function buildMonitorResponse(context) {
  const monitors = sortMonitors(
    [...context.monitorList.values()]
      .filter((monitor) => monitor.type !== 'group')
      .map((monitor) => toClientMonitor(monitor, context))
      .filter((monitor) => monitor.domain)
  )

  return {
    source: kumaUrl(),
    generatedAt: new Date().toISOString(),
    authSource: 'socket',
    monitors,
    summary: {
      total: monitors.length,
      up: monitors.filter((monitor) => monitor.status === 'UP').length,
      down: monitors.filter((monitor) => monitor.status === 'DOWN').length,
      attention: monitors.filter((monitor) => monitor.status.includes('<=')).length,
      sslExpiringSoon: monitors.filter(
        (monitor) => monitor.sslDaysRemaining !== null && monitor.sslDaysRemaining <= 21
      ).length,
      domainExpiringSoon: monitors.filter(
        (monitor) => monitor.domainExpiryDaysRemaining !== null && monitor.domainExpiryDaysRemaining <= 21
      ).length
    }
  }
}

function buildSummary(monitors = []) {
  return {
    total: monitors.length,
    up: monitors.filter((monitor) => monitor.status === 'UP').length,
    down: monitors.filter((monitor) => monitor.status === 'DOWN').length,
    attention: monitors.filter((monitor) => String(monitor.status || '').includes('<=')).length,
    sslExpiringSoon: monitors.filter(
      (monitor) => monitor.sslDaysRemaining !== null && monitor.sslDaysRemaining <= 21
    ).length,
    domainExpiringSoon: monitors.filter(
      (monitor) => monitor.domainExpiryDaysRemaining !== null && monitor.domainExpiryDaysRemaining <= 21
    ).length
  }
}

function normalizePayload(payload) {
  const monitors = sortMonitors([...(payload?.monitors || [])])
  return {
    source: payload?.source || kumaUrl(),
    generatedAt: payload?.generatedAt || new Date().toISOString(),
    authSource: payload?.authSource || 'local',
    monitors,
    summary: buildSummary(monitors),
    sync: {
      pending: getLocalState().queue.length
    }
  }
}

function withCacheMetadata(payload, stale) {
  const state = getLocalState()
  return {
    ...normalizePayload(payload),
    cache: {
      stale,
      ttlMs: cacheTtlMs(),
      refreshedAt: monitorCache.refreshedAt,
      expiresAt: monitorCache.expiresAt ? new Date(monitorCache.expiresAt).toISOString() : null
    },
    sync: {
      pending: state.queue.length
    }
  }
}

function createSocket() {
  return io(kumaUrl(), {
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 10000
  })
}

function emitLogin(socket, callback) {
  socket.emit(
    'login',
    {
      username: kumaUsername(),
      password: kumaPassword()
    },
    callback
  )
}

function sendLoginOnce(socket, state, onResult) {
  if (state.loginSent) return
  state.loginSent = true

  emitLogin(socket, (result = {}) => {
    if (!result.ok) {
      onResult(new Error(result.msg || 'Uptime Kuma socket login failed'))
      return
    }

    onResult(null, result)
  })
}

async function fetchSocketData() {
  ensureCredentials()

  return new Promise((resolve, reject) => {
    const socket = createSocket()
    const state = { loginSent: false }
    const context = {
      monitorList: new Map(),
      heartbeatList: new Map(),
      avgPingList: new Map(),
      tlsInfoList: new Map(),
      domainInfoList: new Map()
    }
    let settled = false
    let finishTimer = null
    let earliestFinishAt = null

    const finish = (error = null) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(finishTimer)
      socket.disconnect()

      if (error) {
        reject(error)
        return
      }

      resolve(context)
    }

    const timeout = setTimeout(() => {
      if (context.monitorList.size > 0) {
        finish()
        return
      }

      finish(new Error('Timed out waiting for Uptime Kuma monitor data'))
    }, 22000)

    const scheduleFinish = () => {
      clearTimeout(finishTimer)
      earliestFinishAt ||= Date.now() + 8500
      const delay = Math.max(2500, earliestFinishAt - Date.now())
      finishTimer = setTimeout(() => finish(), delay)
    }

    socket.on('monitorList', (list = {}) => {
      context.monitorList = new Map(Object.entries(list).map(([id, monitor]) => [Number(id), monitor]))
      scheduleFinish()
    })

    socket.on('updateMonitorIntoList', (list = {}) => {
      for (const [id, monitor] of Object.entries(list)) {
        context.monitorList.set(Number(id), monitor)
      }
      scheduleFinish()
    })

    socket.on('heartbeatList', (monitorId, beats = [], overwrite = false) => {
      const id = Number(monitorId)
      const current = context.heartbeatList.get(id) || []
      context.heartbeatList.set(id, overwrite ? beats : current.concat(beats))
      scheduleFinish()
    })

    socket.on('heartbeat', (beat) => {
      const id = Number(beat?.monitor_id)
      if (!id) return
      const current = context.heartbeatList.get(id) || []
      context.heartbeatList.set(id, current.concat(beat))
      scheduleFinish()
    })

    socket.on('avgPing', (monitorId, avgPing) => {
      context.avgPingList.set(Number(monitorId), safeNumber(avgPing))
    })

    socket.on('certInfo', (monitorId, info) => {
      context.tlsInfoList.set(Number(monitorId), parseJson(info))
      scheduleFinish()
    })

    socket.on('domainInfo', (monitorId, daysRemaining, expiresOn) => {
      context.domainInfoList.set(Number(monitorId), {
        daysRemaining: safeNumber(daysRemaining),
        expiresOn
      })
      scheduleFinish()
    })

    socket.on('connect', () => {
      setTimeout(() => {
        sendLoginOnce(socket, state, (error) => {
          if (error && context.monitorList.size === 0) finish(error)
        })
      }, 300)
    })

    socket.on('loginRequired', () => {
      sendLoginOnce(socket, state, (error) => {
        if (error && context.monitorList.size === 0) finish(error)
      })
    })

    socket.on('connect_error', (error) => finish(error))
  })
}

async function refreshMonitorCache() {
  if (monitorCache.refreshPromise) return monitorCache.refreshPromise

  monitorCache.refreshPromise = fetchSocketData()
    .then((context) => {
      const payload = normalizePayload(buildMonitorResponse(context))
      persistPayload(payload)
      return payload
    })
    .finally(() => {
      monitorCache.refreshPromise = null
    })

  return monitorCache.refreshPromise
}

async function getMonitorResponse({ force = false } = {}) {
  if (force) {
    await processPendingActions()
    const payload = await refreshMonitorCache()
    return withCacheMetadata(payload, false)
  }

  processPendingActions()

  const cached = getCachedPayload()
  if (cached) {
    if (Date.now() >= monitorCache.expiresAt) {
      refreshMonitorCacheInBackground()
    }
    return withCacheMetadata(cached, Date.now() >= monitorCache.expiresAt)
  }

  try {
    const payload = await refreshMonitorCache()
    return withCacheMetadata(payload, false)
  } catch (error) {
    const emptyPayload = normalizePayload({
      source: kumaUrl(),
      generatedAt: new Date().toISOString(),
      authSource: 'local',
      monitors: []
    })
    persistPayload(emptyPayload)
    console.error('Initial Uptime Kuma cache refresh failed:', error.message)
    return withCacheMetadata(emptyPayload, true)
  }
}

function refreshMonitorCacheInBackground() {
  processPendingActions()
    .then(() => {
      if (getLocalState().queue.length) return null
      return refreshMonitorCache()
    })
    .catch((error) => {
      console.error('Background Uptime Kuma cache refresh failed:', error.message)
    })
}

function invalidateMonitorCache() {
  monitorCache.payload = null
  monitorCache.expiresAt = 0
  monitorCache.refreshedAt = null
  const state = getLocalState()
  setLocalState({ ...state, cache: { payload: null, updatedAt: null }, queue: [] })
}

function startBackgroundSync() {
  if (monitorCache.refreshTimer) return
  // Warm the local cache after startup, then keep it fresh hourly.
  setTimeout(() => {
    refreshMonitorCacheInBackground()
  }, 5000)
  monitorCache.refreshTimer = setInterval(() => {
    refreshMonitorCacheInBackground()
  }, HOURLY_REFRESH_MS)
}

function stopBackgroundSync() {
  if (monitorCache.refreshTimer) {
    clearInterval(monitorCache.refreshTimer)
    monitorCache.refreshTimer = null
  }
}

async function withKumaSocket(action) {
  ensureCredentials()

  return new Promise((resolve, reject) => {
    const socket = createSocket()
    const state = { loginSent: false }
    let settled = false
    let loggedIn = false
    let hasMonitorList = false
    let actionStarted = false
    let readinessTimer = null

    const finish = (error = null, value = null) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(readinessTimer)
      socket.disconnect()

      if (error) {
        reject(error)
        return
      }

      resolve(value)
    }

    const timeout = setTimeout(() => finish(new Error('Timed out waiting for Uptime Kuma socket response')), 20000)

    const runAction = () => {
      if (actionStarted) return
      actionStarted = true

      Promise.resolve()
        .then(() => action(socket))
        .then((value) => finish(null, value))
        .catch((error) => finish(error))
    }

    const runWhenSocketDataReady = () => {
      if (!loggedIn) return
      if (hasMonitorList) {
        clearTimeout(readinessTimer)
        runAction()
        return
      }

      readinessTimer ||= setTimeout(runAction, 3000)
    }

    const handleLogin = (error) => {
      if (error) {
        finish(error)
        return
      }

      loggedIn = true
      runWhenSocketDataReady()
    }

    socket.on('monitorList', () => {
      hasMonitorList = true
      runWhenSocketDataReady()
    })

    socket.on('connect', () => {
      setTimeout(() => sendLoginOnce(socket, state, handleLogin), 300)
    })

    socket.on('loginRequired', () => {
      sendLoginOnce(socket, state, handleLogin)
    })

    socket.on('connect_error', (error) => finish(error))
  })
}

function socketAck(socket, eventName, ...args) {
  return new Promise((resolve, reject) => {
    socket.emit(eventName, ...args, (result = {}) => {
      if (result.ok === false) {
        reject(new Error(result.msg || `${eventName} failed`))
        return
      }

      resolve(result)
    })
  })
}

function buildMonitorPayload(input, existing = {}) {
  const name = String(input.name ?? existing.name ?? '').trim()
  const url = String(input.url ?? existing.url ?? '').trim()

  if (!name) {
    const error = new Error('Monitor name is required')
    error.status = 400
    throw error
  }

  if (!url) {
    const error = new Error('Monitor URL is required')
    error.status = 400
    throw error
  }

  return {
    ...existing,
    type: 'http',
    name,
    url,
    method: input.method ?? existing.method ?? 'GET',
    active: Boolean(input.active ?? existing.active ?? true),
    interval: safeNumber(input.interval, safeNumber(existing.interval, 60)),
    retryInterval: safeNumber(input.retryInterval, safeNumber(existing.retryInterval, 60)),
    maxretries: safeNumber(input.maxretries, safeNumber(existing.maxretries, 0)),
    timeout: safeNumber(input.timeout, safeNumber(existing.timeout, 48)),
    maxredirects: safeNumber(input.maxredirects, safeNumber(existing.maxredirects, 10)),
    accepted_statuscodes: normalizeAcceptedStatusCodes(input.accepted_statuscodes ?? existing.accepted_statuscodes),
    expiryNotification: Boolean(input.expiryNotification ?? existing.expiryNotification ?? false),
    domainExpiryNotification: Boolean(input.domainExpiryNotification ?? existing.domainExpiryNotification ?? true),
    ignoreTls: Boolean(input.ignoreTls ?? existing.ignoreTls ?? false),
    description: input.description ?? existing.description ?? '',
    notificationIDList: existing.notificationIDList || {},
    upsideDown: Boolean(existing.upsideDown ?? false),
    saveResponse: Boolean(existing.saveResponse ?? false),
    saveErrorResponse: Boolean(existing.saveErrorResponse ?? true),
    responseMaxLength: safeNumber(existing.responseMaxLength, 1024),
    retryOnlyOnStatusCodeFailure: Boolean(existing.retryOnlyOnStatusCodeFailure ?? false),
    resendInterval: safeNumber(existing.resendInterval, 0),
    dns_resolve_type: existing.dns_resolve_type || 'A',
    dns_resolve_server: existing.dns_resolve_server || '1.1.1.1',
    httpBodyEncoding: existing.httpBodyEncoding || 'json',
    cacheBust: Boolean(existing.cacheBust ?? false),
    conditions: existing.conditions || []
  }
}

function makeClientMonitorFromPayload(payload, id) {
  const monitor = {
    id,
    name: payload.name || '',
    type: payload.type || 'http',
    url: payload.url || '',
    active: Boolean(payload.active ?? true),
    method: payload.method || 'GET',
    interval: payload.interval ?? 60,
    retryInterval: payload.retryInterval ?? 60,
    maxretries: payload.maxretries ?? 0,
    timeout: payload.timeout ?? 48,
    maxredirects: payload.maxredirects ?? 10,
    accepted_statuscodes: normalizeAcceptedStatusCodes(payload.accepted_statuscodes),
    expiryNotification: Boolean(payload.expiryNotification),
    domainExpiryNotification: Boolean(payload.domainExpiryNotification ?? true),
    ignoreTls: Boolean(payload.ignoreTls),
    description: payload.description || ''
  }
  const domain = getDomain(monitor)
  const baseDomain = getBaseDomain(domain)
  const currentStatus = monitor.active ? 'PENDING' : 'PAUSED'

  return {
    id: Number(id),
    name: monitor.name,
    type: monitor.type,
    url: monitor.url,
    domain,
    baseDomain,
    status: currentStatus,
    currentStatus,
    active: monitor.active,
    sslDaysRemaining: null,
    sslExpiryDate: null,
    sslValid: null,
    responseTimeMs: null,
    domainExpiryDate: null,
    domainExpiryDaysRemaining: null,
    monitor: sanitizeMonitorConfig(monitor),
    subdomainKey: getSubdomainKey(domain, baseDomain),
    pendingSync: true
  }
}

function getPayloadForOptimisticUpdate() {
  const cached = getCachedPayload()
  return normalizePayload(cached || {
    source: kumaUrl(),
    generatedAt: new Date().toISOString(),
    authSource: 'local',
    monitors: []
  })
}

function updateCachedPayload(mutator) {
  const current = getPayloadForOptimisticUpdate()
  const next = normalizePayload(mutator(current))
  persistPayload(next)
  return next
}

function enqueueAction(action) {
  const state = getLocalState()
  const queueItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    attempts: 0,
    createdAt: new Date().toISOString(),
    ...action
  }
  setLocalState({ ...state, queue: [...state.queue, queueItem] })
  setTimeout(() => processPendingActions(), 0)
  return queueItem
}

function removeQueueItem(actionId) {
  const state = getLocalState()
  setLocalState({ ...state, queue: state.queue.filter((item) => item.id !== actionId) })
}

function updateQueueItem(actionId, patch) {
  const state = getLocalState()
  setLocalState({
    ...state,
    queue: state.queue.map((item) => (item.id === actionId ? { ...item, ...patch } : item))
  })
}

function rollbackAction(action) {
  if (action.beforePayload) {
    persistPayload(normalizePayload(action.beforePayload))
  }
  removeQueueItem(action.id)
}

async function executeQueuedAction(action) {
  if (action.type === 'create') {
    await withKumaSocket((socket) => socketAck(socket, 'add', buildMonitorPayload(action.payload)))
    return
  }
  if (action.type === 'update') {
    const existing = await findMonitorForEdit(action.monitorId)
    if (!existing) {
      const error = new Error('Monitor not found')
      error.status = 404
      throw error
    }
    const payload = buildMonitorPayload(action.payload, existing)
    payload.id = Number(action.monitorId)
    await withKumaSocket((socket) => socketAck(socket, 'editMonitor', payload))
    return
  }
  if (action.type === 'delete') {
    await withKumaSocket((socket) => socketAck(socket, 'deleteMonitor', Number(action.monitorId), Boolean(action.deleteChildren)))
    return
  }
  if (action.type === 'pause') {
    const eventName = action.paused ? 'pauseMonitor' : 'resumeMonitor'
    await withKumaSocket((socket) => socketAck(socket, eventName, Number(action.monitorId)))
  }
}

async function processPendingActions() {
  if (monitorCache.queueProcessing) return
  const state = getLocalState()
  if (!state.queue.length) return

  monitorCache.queueProcessing = true
  try {
    while (true) {
      const currentState = getLocalState()
      const action = currentState.queue[0]
      if (!action) break

      try {
        await executeQueuedAction(action)
        removeQueueItem(action.id)
        await refreshMonitorCache().catch((error) => {
          console.error('Uptime Kuma refresh after pending action failed:', error.message)
        })
      } catch (error) {
        if ((Number(action.attempts) || 0) >= 1) {
          console.error('Uptime Kuma pending action failed twice; rolling back:', error.message)
          rollbackAction(action)
        } else {
          console.warn('Uptime Kuma pending action failed; retrying later:', error.message)
          updateQueueItem(action.id, {
            attempts: (Number(action.attempts) || 0) + 1,
            lastError: error.message,
            lastAttemptAt: new Date().toISOString()
          })
          setTimeout(() => processPendingActions(), 30000)
          break
        }
      }
    }
  } finally {
    monitorCache.queueProcessing = false
  }
}

async function findMonitorForEdit(monitorId) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const context = await fetchSocketData()
    const monitor = context.monitorList.get(Number(monitorId))
    if (monitor) return monitor
    if (attempt < 3) await sleep(1500)
  }

  return null
}

async function addMonitor(input) {
  const payload = buildMonitorPayload(input)
  const beforePayload = getPayloadForOptimisticUpdate()
  const tempId = -Date.now()
  updateCachedPayload((current) => ({
    ...current,
    generatedAt: new Date().toISOString(),
    authSource: 'local',
    monitors: [...(current.monitors || []), makeClientMonitorFromPayload(payload, tempId)]
  }))
  enqueueAction({ type: 'create', payload, beforePayload })
  return {
    ok: true,
    pending: true,
    monitorID: tempId,
    message: 'Monitor queued'
  }
}

async function updateMonitor(monitorId, input) {
  const beforePayload = getPayloadForOptimisticUpdate()
  const currentMonitor = beforePayload.monitors.find((monitor) => Number(monitor.id) === Number(monitorId))
  if (!currentMonitor) {
    const error = new Error('Monitor not found')
    error.status = 404
    throw error
  }

  if (currentMonitor.type !== 'http') {
    const error = new Error('Only HTTP monitors can be edited from this dashboard')
    error.status = 400
    throw error
  }

  const payload = buildMonitorPayload(input, currentMonitor.monitor || {})
  payload.id = Number(monitorId)
  const nextClientMonitor = {
    ...makeClientMonitorFromPayload(payload, Number(monitorId)),
    sslDaysRemaining: currentMonitor.sslDaysRemaining,
    sslExpiryDate: currentMonitor.sslExpiryDate,
    sslValid: currentMonitor.sslValid,
    responseTimeMs: currentMonitor.responseTimeMs,
    domainExpiryDate: currentMonitor.domainExpiryDate,
    domainExpiryDaysRemaining: currentMonitor.domainExpiryDaysRemaining,
    pendingSync: true
  }
  updateCachedPayload((current) => ({
    ...current,
    generatedAt: new Date().toISOString(),
    authSource: 'local',
    monitors: current.monitors.map((monitor) => (Number(monitor.id) === Number(monitorId) ? nextClientMonitor : monitor))
  }))
  enqueueAction({ type: 'update', monitorId: Number(monitorId), payload, beforePayload })
  return { ok: true, pending: true, message: 'Monitor update queued' }
}

async function deleteMonitor(monitorId, { deleteChildren = false } = {}) {
  const beforePayload = getPayloadForOptimisticUpdate()
  updateCachedPayload((current) => ({
    ...current,
    generatedAt: new Date().toISOString(),
    authSource: 'local',
    monitors: current.monitors.filter((monitor) => Number(monitor.id) !== Number(monitorId))
  }))
  enqueueAction({ type: 'delete', monitorId: Number(monitorId), deleteChildren, beforePayload })
  return {
    ok: true,
    pending: true,
    message: 'Monitor delete queued'
  }
}

async function pauseMonitor(monitorId, paused) {
  const beforePayload = getPayloadForOptimisticUpdate()
  updateCachedPayload((current) => ({
    ...current,
    generatedAt: new Date().toISOString(),
    authSource: 'local',
    monitors: current.monitors.map((monitor) => {
      if (Number(monitor.id) !== Number(monitorId)) return monitor
      const active = !paused
      const status = active ? 'PENDING' : 'PAUSED'
      return {
        ...monitor,
        active,
        currentStatus: status,
        status,
        monitor: { ...(monitor.monitor || {}), active },
        pendingSync: true
      }
    })
  }))
  enqueueAction({ type: 'pause', monitorId: Number(monitorId), paused: Boolean(paused), beforePayload })
  return {
    ok: true,
    pending: true,
    message: paused ? 'Monitor pause queued' : 'Monitor resume queued'
  }
}

module.exports = {
  addMonitor,
  deleteMonitor,
  getMonitorResponse,
  getTraySummary,
  invalidateMonitorCache,
  pauseMonitor,
  startBackgroundSync,
  stopBackgroundSync,
  updateMonitor
}
