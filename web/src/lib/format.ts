const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const dayMonth = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" })
const full = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function dayLabel(value: string | number | Date) {
  const date = new Date(value)
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return dayMonth.format(date)
  return full.format(date)
}

export function backupLabel(value: string) {
  const date = new Date(value)
  return `${dayLabel(date)}, ${time.format(date)}`
}

export function clockTime(value: string | number) {
  return time.format(new Date(value))
}

export function ago(value?: string) {
  if (!value) return "unknown"
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}
