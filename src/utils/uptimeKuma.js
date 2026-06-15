export function isUptimeKumaEnabled(settings) {
  return settings?.uptimeKuma?.enabled !== false
}

export function getMonitorStatusVariant(status) {
  const value = String(status || '')
  if (value === 'UP') return 'success'
  if (value === 'DOWN' || value.includes('<= 7D')) return 'destructive'
  if (value.includes('<= 14D')) return 'caution'
  if (value === 'MAINTENANCE' || value.includes('<= 21D')) return 'warning'
  return 'secondary'
}

export function isMonitorAttentionStatus(monitor) {
  const variant = getMonitorStatusVariant(monitor?.status)
  return variant === 'destructive' || variant === 'caution' || variant === 'warning'
}

function formatExpiryPhrase(days) {
  if (!Number.isFinite(days)) return null
  if (days > 0) return `is going to expire in ${days} day${days === 1 ? '' : 's'}`
  if (days === 0) return 'expires today'
  const ago = Math.abs(days)
  return `is expired ${ago} day${ago === 1 ? '' : 's'} ago`
}

function formatOperationalStatusLine(monitor) {
  const status = monitor.status
  if (status === 'UP') return `${monitor.name} is UP`
  if (status === 'DOWN') return `${monitor.name} is DOWN`
  if (status === 'PENDING') return `${monitor.name} is PENDING`
  if (status === 'PAUSED') return `${monitor.name} is paused`
  if (status === 'MAINTENANCE') return `${monitor.name} is in maintenance`

  if (String(status).includes('SSL') && Number.isFinite(monitor.sslDaysRemaining)) {
    const phrase = formatExpiryPhrase(monitor.sslDaysRemaining)
    if (phrase) return `${monitor.name} SSL ${phrase}`
  }
  if (String(status).includes('DOMAIN') && Number.isFinite(monitor.domainExpiryDaysRemaining)) {
    const phrase = formatExpiryPhrase(monitor.domainExpiryDaysRemaining)
    if (phrase) return `${monitor.name} Domain ${phrase}`
  }

  return `${monitor.name} status is ${status}`
}

export function formatMonitorStatusLines(monitor) {
  if (!isMonitorAttentionStatus(monitor)) return []

  const lines = []
  const sslDays = monitor.sslDaysRemaining
  const domainDays = monitor.domainExpiryDaysRemaining

  if (Number.isFinite(sslDays) && sslDays <= 21) {
    const phrase = formatExpiryPhrase(sslDays)
    if (phrase) lines.push(`${monitor.name} SSL ${phrase}`)
  }
  if (Number.isFinite(domainDays) && domainDays <= 21) {
    const phrase = formatExpiryPhrase(domainDays)
    if (phrase) lines.push(`${monitor.name} Domain ${phrase}`)
  }

  if (lines.length === 0) {
    lines.push(formatOperationalStatusLine(monitor))
  }

  return lines
}

export function formatFilteredMonitorStatusText(monitors) {
  return (monitors || [])
    .filter(isMonitorAttentionStatus)
    .flatMap(formatMonitorStatusLines)
    .join('\n')
}
