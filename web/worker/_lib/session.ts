import type { Env } from './http'

const COOKIE = 'dm_unlock'
const SESSION_TTL = 60 * 60 * 12 // 12h KV TTL; cookie is browser-session (no Max-Age)

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(sig))
}

function sessionSecret(env: Env) {
  return env.SESSION_SECRET || env.GOOGLE_CLIENT_SECRET || 'deskmaster-dev-session-secret'
}

export function readCookie(request: Request, name: string) {
  const raw = request.headers.get('cookie') || ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function unlockCookieHeader(token: string, clear = false, secure = true) {
  const secureFlag = secure ? '; Secure' : ''
  if (clear) {
    return `${COOKIE}=; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=0`
  }
  // No Max-Age / Expires → browser session cookie (cleared when browser quits)
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secureFlag}; SameSite=Lax`
}

export async function createUnlockSession(env: Env, passphrase: string) {
  const id = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  const sig = await hmac(sessionSecret(env), id)
  const token = `${id}.${sig}`
  await env.DATA.put(`session:${id}`, JSON.stringify({ passphrase }), { expirationTtl: SESSION_TTL })
  return token
}

export async function destroyUnlockSession(request: Request, env: Env) {
  const token = readCookie(request, COOKIE)
  if (!token) return
  const id = token.split('.')[0]
  if (id) await env.DATA.delete(`session:${id}`)
}

export async function getUnlockPassphrase(request: Request, env: Env): Promise<string | null> {
  const token = readCookie(request, COOKIE)
  if (!token) return null
  const [id, sig] = token.split('.')
  if (!id || !sig) return null
  const expected = await hmac(sessionSecret(env), id)
  if (expected !== sig) return null
  const raw = await env.DATA.get(`session:${id}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { passphrase?: string }
    if (!parsed.passphrase) return null
    // Refresh TTL while the browser session is active
    await env.DATA.put(`session:${id}`, raw, { expirationTtl: SESSION_TTL })
    return parsed.passphrase
  } catch {
    return null
  }
}

export async function isUnlocked(request: Request, env: Env) {
  return Boolean(await getUnlockPassphrase(request, env))
}
