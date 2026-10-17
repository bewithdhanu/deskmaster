const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { formatForClock, isDateTimeFormat } = require('./src/utils/clockFormat')

const COLORS = { hot: '#ff453a', warm: '#ff9f0a', ok: '#30d158' }
// Base colour, then amber / red thresholds; RAM and disk normally sit high, so they warn later than CPU
const RINGS = {
  cpu: { color: '#5e9eff', warm: 70, hot: 88 },
  ram: { color: '#bf5af2', warm: 85, hot: 93 },
  disk: { color: '#2ec4b6', warm: 85, hot: 95 }
}

const loadColor = (value, { color, warm, hot }) => (value >= hot ? COLORS.hot : value >= warm ? COLORS.warm : color)
const batteryColor = (percent, charging) => (charging || percent > 25 ? COLORS.ok : percent > 15 ? COLORS.warm : COLORS.hot)

/**
 * Pure: turn DeskMaster stats/settings into the JSON the native helper draws.
 * Cell order: CPU, RAM, DISK, BAT, NET, calendar (date formats only), clocks, uptime.
 */
function buildTrayState({ stats, timezones = [], settings = {}, uptime = {}, uptimeEnabled = true, localTimezone } = {}) {
  const localZone = localTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const show = settings.stats || {}
  const cells = []
  const ring = (label, value, color) => cells.push({ label, ring: { value: Number(value) || 0, color } })

  if (show.cpu) ring('CPU', stats.cpu, loadColor(stats.cpu, RINGS.cpu))
  if (show.ram) ring('RAM', stats.ram, loadColor(stats.ram, RINGS.ram))
  if (show.disk) ring('DISK', stats.disk, loadColor(stats.disk, RINGS.disk))
  if (show.battery && stats.battery) {
    const { percent, charging } = stats.battery
    ring(charging ? '⚡BAT' : 'BAT', percent, batteryColor(percent, charging))
  }
  if (show.network) {
    // formatBytes tops out at 4 digits + unit; reserving that keeps the bar from shifting as speed changes
    cells.push({ label: 'NET', up: stats.net?.up ?? '0 B', down: stats.net?.down ?? '0 B', reserve: '8888 MB' })
  }

  const format = settings.datetimeFormat || 'HH:mm:ss'
  // Date formats show the local date once, as a calendar icon; the clocks then carry only the time.
  const calendar = isDateTimeFormat(format) && timezones.length > 0
  if (calendar) cells.push({ label: '', calendar: true, tz: localZone })
  timezones.forEach((tz, index) => {
    const cell = { label: tz.label, tz: tz.timezone }
    let clockFormat = formatForClock(format, index, timezones, localZone)
    if (calendar) clockFormat = clockFormat.replace(/(MMM|DD|YYYY)[\s,./-]*/g, '').trim()
    if (clockFormat !== format) cell.timeFormat = clockFormat
    cells.push(cell)
  })

  const down = uptime.down || 0
  const ssl = uptime.sslAttention || 0
  const domain = uptime.domainAttention || 0
  const issues = [
    [down, 'arrowtriangle.down.fill', COLORS.hot],
    [ssl, 'lock.fill', COLORS.warm],
    [domain, 'globe', COLORS.warm]
  ].filter(([count]) => count > 0)
  if (uptimeEnabled && issues.length) {
    cells.push({
      label: '', // no label: icons and counts use the full height
      segments: issues.map(([count, symbol, color]) => ({ symbol, text: String(count), color }))
    })
  }

  return { timeFormat: format, cells }
}

/** Packaged: <Resources>/bin/deskmaster-tray. Dev: <repo>/native/bin/deskmaster-tray. */
function resolveHelperPath(resourcesPath, appDir) {
  const candidates = [
    resourcesPath && path.join(resourcesPath, 'bin', 'deskmaster-tray'),
    path.join(appDir, 'native', 'bin', 'deskmaster-tray')
  ].filter(Boolean)
  return candidates.find((p) => fs.existsSync(p)) || null
}

/**
 * Supervises the native helper process.
 * - send(state): latest state is replayed after a restart
 * - onEvent({type:'click'|'right-click', x, y, width, height})
 * - onUnavailable(): helper missing, or crashed `maxRestarts` times within `windowMs` -> caller falls back
 */
function createTrayHelper({ binaryPath, onEvent, onUnavailable, maxRestarts = 3, windowMs = 60000, restartDelayMs = 500 }) {
  let child = null
  let lastState = null
  let stopped = false
  let crashes = []

  const giveUp = () => {
    if (stopped) return
    stopped = true
    onUnavailable?.()
  }

  const write = (message) => {
    if (child?.stdin?.writable) child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  const launch = () => {
    const proc = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'inherit'] })
    child = proc

    proc.stdin.on('error', () => {}) // EPIPE while the helper is exiting
    let buffer = ''
    proc.stdout.on('data', (chunk) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        try {
          const event = JSON.parse(line)
          if (event.type !== 'ready') onEvent?.(event)
        } catch {
          // ignore malformed lines
        }
      }
    })

    proc.on('error', giveUp) // e.g. ENOENT / EACCES
    proc.on('exit', () => {
      if (stopped || child !== proc) return
      const now = Date.now()
      crashes = crashes.filter((t) => now - t < windowMs).concat(now)
      if (crashes.length >= maxRestarts) return giveUp()
      setTimeout(() => !stopped && launch(), restartDelayMs)
    })

    if (lastState) write({ type: 'state', ...lastState })
  }

  launch()

  return {
    send(state) {
      lastState = state
      write({ type: 'state', ...state })
    },
    stop() {
      stopped = true
      write({ type: 'quit' })
      child?.stdin?.end()
    }
  }
}

module.exports = { buildTrayState, resolveHelperPath, createTrayHelper }
