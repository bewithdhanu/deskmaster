import type { Envelope } from './backup'
import type { Env } from './http'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const REFRESH_KEY = 'drive:refresh_token'

export type DriveBackup = { id: string; name: string; createdTime: string }

export function googleConfigured(env: Env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

export async function driveConnected(env: Env) {
  return Boolean(await env.DATA.get(REFRESH_KEY))
}

export async function saveRefreshToken(env: Env, refreshToken: string) {
  await env.DATA.put(REFRESH_KEY, refreshToken)
  await env.DATA.put('drive:connected_at', new Date().toISOString())
}

export async function clearDrive(env: Env) {
  await env.DATA.delete(REFRESH_KEY)
  await env.DATA.delete('drive:connected_at')
}

export function googleAuthUrl(env: Env, origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCode(env: Env, origin: string, code: string) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: `${origin}/api/auth/google/callback`,
    grant_type: 'authorization_code'
  })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`)
  const data = (await response.json()) as { refresh_token?: string; access_token?: string }
  if (!data.refresh_token && !(await env.DATA.get(REFRESH_KEY))) {
    throw new Error('Google did not return a refresh token. Remove app access and connect again.')
  }
  if (data.refresh_token) await saveRefreshToken(env, data.refresh_token)
  return data.access_token as string
}

async function accessToken(env: Env) {
  const refresh = await env.DATA.get(REFRESH_KEY)
  if (!refresh) throw new Error('Google Drive is not connected')
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    refresh_token: refresh,
    grant_type: 'refresh_token'
  })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) throw new Error(`Could not refresh Google token (${response.status})`)
  const data = (await response.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('Google token refresh returned no access token')
  return data.access_token
}

export async function listBackups(env: Env): Promise<DriveBackup[]> {
  const token = await accessToken(env)
  const query = encodeURIComponent("trashed=false and name contains 'deskmaster-backup-'")
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,createdTime)`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Could not list Drive backups (${response.status})`)
  const body = (await response.json()) as { files?: DriveBackup[] }
  return (body.files ?? []).filter((file) => file.name.endsWith('.enc.json'))
}

export async function downloadBackup(env: Env, fileId: string): Promise<Envelope> {
  const token = await accessToken(env)
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!response.ok) throw new Error(`Could not download the backup (${response.status})`)
  return (await response.json()) as Envelope
}
