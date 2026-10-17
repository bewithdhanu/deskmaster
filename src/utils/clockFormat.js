// Date + time formats omit seconds. The clock for this Mac's timezone gets them back,
// so one clock stays live without widening every other clock.

function isDateTimeFormat(format) {
  return /MMM|DD|YYYY/.test(String(format || ''))
}

function withSeconds(format) {
  const value = String(format || '')
  if (value.includes('ss')) return value
  if (value.includes('HH:mm')) return value.replace('HH:mm', 'HH:mm:ss')
  if (value.includes('h:mm')) return value.replace('h:mm', 'h:mm:ss')
  return value
}

function localClockIndex(timezones, localTimezone) {
  if (!Array.isArray(timezones) || timezones.length === 0) return -1
  const byZone = timezones.findIndex((tz) => tz.timezone === localTimezone)
  if (byZone >= 0) return byZone
  const byLabel = timezones.findIndex((tz) => String(tz.label || '').toLowerCase() === 'local')
  if (byLabel >= 0) return byLabel
  return 0
}

function formatForClock(format, index, timezones, localTimezone) {
  if (!isDateTimeFormat(format) || String(format).includes('ss')) return format
  if (index !== localClockIndex(timezones, localTimezone)) return format
  return withSeconds(format)
}

module.exports = { isDateTimeFormat, withSeconds, localClockIndex, formatForClock }
