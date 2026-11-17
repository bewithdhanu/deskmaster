import { requireAccess } from './_lib/access'
import { decryptBackup } from './_lib/backup'
import {
  clearDrive,
  downloadBackup,
  driveConnected,
  exchangeCode,
  googleAuthUrl,
  googleConfigured,
  listBackups
} from './_lib/drive'
import { error, json, originOf, readJson, type Env } from './_lib/http'
import {
  createUnlockSession,
  destroyUnlockSession,
  getUnlockPassphrase,
  isUnlocked,
  unlockCookieHeader
} from './_lib/session'

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function secureCookie(request: Request) {
  return request.url.startsWith('https:')
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  if (!env.DATA) return error('KV binding DATA is not configured', 500)

  const url = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '') || '/'
  const method = request.method.toUpperCase()

  if (path === '/api/me' && method === 'GET') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    return json({
      email: identity.email,
      googleConfigured: googleConfigured(env),
      driveConnected: await driveConnected(env),
      unlocked: await isUnlocked(request, env)
    })
  }

  if (path === '/api/setup/status' && method === 'GET') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    return json({
      googleConfigured: googleConfigured(env),
      driveConnected: await driveConnected(env),
      accessConfigured: Boolean(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN)
    })
  }

  if (path === '/api/unlock' && method === 'POST') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    if (!(await driveConnected(env))) return error('Connect Google Drive first', 409)

    const body = await readJson<{ passphrase?: string; backupId?: string }>(request)
    const passphrase = String(body.passphrase || '').trim()
    if (!passphrase) return error('Backup passphrase is required')

    try {
      const backups = await listBackups(env)
      if (!backups.length) return error('No encrypted backups found in Drive', 404)
      const backupId =
        body.backupId && backups.some((b) => b.id === body.backupId) ? body.backupId : backups[0].id
      const envelope = await downloadBackup(env, backupId)
      const data = await decryptBackup(envelope, passphrase)
      const token = await createUnlockSession(env, passphrase)
      const headers = new Headers()
      headers.set('set-cookie', unlockCookieHeader(token, false, secureCookie(request)))
      return json({ ok: true, backupId, backups, backup: data }, { headers })
    } catch (err) {
      return error((err as Error).message, 401)
    }
  }

  if (path === '/api/lock' && method === 'POST') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    await destroyUnlockSession(request, env)
    const headers = new Headers()
    headers.set('set-cookie', unlockCookieHeader('', true, secureCookie(request)))
    return json({ ok: true }, { headers })
  }

  if (path === '/api/backups' && method === 'GET') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    if (!(await getUnlockPassphrase(request, env))) {
      return error('Unlock with your backup passphrase first', 401)
    }
    try {
      return json({ backups: await listBackups(env) })
    } catch (err) {
      return error((err as Error).message, 502)
    }
  }

  if (path.startsWith('/api/backup/') && method === 'GET') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    const passphrase = await getUnlockPassphrase(request, env)
    if (!passphrase) return error('Unlock with your backup passphrase first', 401)

    try {
      let fileId = decodeURIComponent(path.slice('/api/backup/'.length))
      if (fileId === 'latest') {
        const backups = await listBackups(env)
        if (!backups.length) return error('No encrypted backups found in Drive', 404)
        fileId = backups[0].id
      }
      const envelope = await downloadBackup(env, fileId)
      const backup = await decryptBackup(envelope, passphrase)
      return json({ backupId: fileId, backup })
    } catch (err) {
      return error((err as Error).message, 401)
    }
  }

  if (path === '/api/auth/google/start' && method === 'GET') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    if (!googleConfigured(env)) {
      return error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET during Deploy', 503)
    }
    const state = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
    await env.DATA.put(`oauth:state:${state}`, identity.sub || identity.email, { expirationTtl: 600 })
    return Response.redirect(googleAuthUrl(env, originOf(request), state), 302)
  }

  if (path === '/api/auth/google/callback' && method === 'GET') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    if (!googleConfigured(env)) return error('Google OAuth is not configured', 503)

    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const oauthError = url.searchParams.get('error')
    if (oauthError) return error(`Google OAuth error: ${oauthError}`, 400)
    if (!code || !state) return error('Missing OAuth code or state', 400)

    const expected = await env.DATA.get(`oauth:state:${state}`)
    if (!expected) return error('OAuth state expired — try Connect Google Drive again', 400)
    await env.DATA.delete(`oauth:state:${state}`)

    try {
      await exchangeCode(env, originOf(request), code)
      return Response.redirect(`${originOf(request)}/?drive=connected`, 302)
    } catch (err) {
      return error((err as Error).message, 400)
    }
  }

  if (path === '/api/auth/google/disconnect' && method === 'POST') {
    const identity = await requireAccess(request, env)
    if (identity instanceof Response) return identity
    await clearDrive(env)
    return json({ ok: true })
  }

  return error('Not found', 404)
}
