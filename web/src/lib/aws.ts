import type { Authenticator } from "./types.ts"

const AWS_ACCOUNT_ID_RE = /^\d{12}$/

function fromUrl(url?: string) {
  if (!url) return null
  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname
    return hostname.match(/^(\d{12})\.signin\.aws\.amazon\.com$/i)?.[1] ?? null
  } catch {
    return null
  }
}

function fromText(text?: string) {
  const value = String(text || "").trim()
  if (AWS_ACCOUNT_ID_RE.test(value)) return value
  return value.match(/\((\d{12})\)/)?.[1] ?? value.match(/(?:aws|amazon)[^\d]*(\d{12})/i)?.[1] ?? null
}

export function awsAccountId(item: Authenticator) {
  return fromUrl(item.url) || fromText(item.name) || fromText(item.username) || null
}

function awsSignInUrl(item: Authenticator) {
  const raw = String(item.url || "").trim()
  if (raw) return raw.startsWith("http") ? raw : `https://${raw}`
  const accountId = awsAccountId(item)
  return accountId ? `https://${accountId}.signin.aws.amazon.com/console` : ""
}

export function awsCopyText(item: Authenticator, code: string) {
  const lines: string[] = []
  const url = awsSignInUrl(item)
  if (url) lines.push(`URL: ${url}`)
  if (item.username) lines.push(`Username: ${item.username}`)
  if (item.password) lines.push(`Password: ${item.password}`)
  if (code) lines.push(`MFA: ${code}`)
  return lines.join("\n")
}

export function isAws(item: Authenticator) {
  return Boolean(awsAccountId(item) || /aws|amazon/i.test(`${item.name} ${item.url}`))
}
