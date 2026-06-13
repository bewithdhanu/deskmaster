const https = require('https')
const fs = require('fs')
const { URL, URLSearchParams } = require('url')

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

function formatOAuthError(json) {
  const code = typeof json?.error === 'string' ? json.error : ''
  const description = json?.error_description || ''

  if (code === 'invalid_grant') {
    return 'Google Drive session expired or credentials changed. Disconnect and connect Google Drive again.'
  }
  if (code === 'invalid_client') {
    return 'Google OAuth Client ID or Client Secret is invalid. Check Settings > Cloud Backup and reconnect.'
  }
  if (code === 'invalid_request') {
    return description || 'Google rejected the OAuth request. Verify Client ID, Client Secret, and reconnect Google Drive.'
  }
  if (description && code) return `${code}: ${description}`
  return description || code || 'Google authentication failed'
}

function formatApiError(status, text) {
  try {
    const json = JSON.parse(text)
    const apiError = json?.error
    if (typeof apiError === 'string') {
      return formatOAuthError(json)
    }
    if (apiError && typeof apiError === 'object') {
      const details = Array.isArray(apiError.errors)
        ? apiError.errors.map((entry) => entry.message || entry.reason).filter(Boolean).join('; ')
        : ''
      const message = apiError.message || 'Request failed'
      return details ? `${message} (${details})` : message
    }
    return json.error_description || text || `HTTP ${status}`
  } catch {
    return text || `HTTP ${status}`
  }
}

function normalizeBody(body) {
  if (body === undefined || body === null) return undefined
  if (Buffer.isBuffer(body)) return body
  if (typeof body === 'string') return body
  return String(body)
}

function requestBuffer(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const method = options.method || 'GET'
    const body = normalizeBody(options.body)
    const headers = { ...(options.headers || {}) }

    if (body !== undefined && headers['Content-Length'] === undefined) {
      headers['Content-Length'] = Buffer.byteLength(body)
    }

    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks)
          const status = res.statusCode || 0
          if (status >= 200 && status < 300) {
            resolve({ status, headers: res.headers, body: responseBody })
            return
          }
          const text = responseBody.toString('utf8')
          const error = new Error(formatApiError(status, text))
          error.status = status
          reject(error)
        })
      }
    )
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

async function requestJson(url, options = {}) {
  const response = await requestBuffer(url, options)
  const text = response.body.toString('utf8')
  if (!text) return {}
  return JSON.parse(text)
}

function buildAuthUrl({ clientId, redirectUri, scope = DRIVE_SCOPE }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${AUTH_URL}?${params.toString()}`
}

async function exchangeAuthCode({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  }).toString()

  const json = await requestJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!json.refresh_token && !json.access_token) {
    throw new Error(formatOAuthError(json))
  }

  return json
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  if (!clientId) throw new Error('Missing Google OAuth Client ID')
  if (!clientSecret) throw new Error('Missing Google OAuth Client Secret')
  if (!refreshToken) throw new Error('Missing Google Drive refresh token')

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })

  const json = await requestJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })

  if (!json.access_token) {
    throw new Error(formatOAuthError(json))
  }

  return json.access_token
}

function buildDriveUrl(path, params = {}) {
  const url = new URL(path.startsWith('http') ? path : `${DRIVE_API}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function driveRequest(accessToken, path, options = {}) {
  const url = options.params ? buildDriveUrl(path, options.params) : buildDriveUrl(path)
  const { params, ...rest } = options
  return requestJson(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(rest.headers || {})
    }
  })
}

async function ensureBackupFolder(accessToken, folderName = 'DeskMaster Backups') {
  const list = await driveRequest(accessToken, '/files', {
    params: {
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`,
      fields: 'files(id,name,createdTime)',
      spaces: 'drive',
      pageSize: 10
    }
  })
  const existing = Array.isArray(list.files) ? list.files[0] : null
  if (existing?.id) return existing.id

  const created = await driveRequest(accessToken, '/files', {
    method: 'POST',
    params: { fields: 'id' },
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  })

  return created.id || null
}

async function uploadZipFile(accessToken, folderId, zipPath, fileName) {
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId]
  })
  const fileData = fs.readFileSync(zipPath)
  const boundary = `deskmaster_${Date.now()}`
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/zip\r\n\r\n',
    'utf8'
  )
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const body = Buffer.concat([preamble, fileData, closing])

  const uploadUrl = new URL(DRIVE_UPLOAD)
  uploadUrl.searchParams.set('uploadType', 'multipart')
  uploadUrl.searchParams.set('fields', 'id,name,createdTime')

  return requestJson(uploadUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  })
}

async function pruneOldBackups(accessToken, folderId, keepLast = 10) {
  const list = await driveRequest(accessToken, '/files', {
    params: {
      q: `'${folderId}' in parents and trashed=false and name contains 'deskmaster-backup-'`,
      fields: 'files(id,name,createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 50
    }
  })
  const files = Array.isArray(list.files) ? list.files : []
  const toDelete = files.slice(Number(keepLast) || 10)

  for (const file of toDelete) {
    try {
      await driveRequest(accessToken, `/files/${file.id}`, { method: 'DELETE' })
    } catch {}
  }
}

async function uploadBackup({ clientId, clientSecret, refreshToken, zipPath, fileName, keepLast = 10 }) {
  let step = 'Google authentication'
  try {
    const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken })

    step = 'Drive backup folder'
    const folderId = await ensureBackupFolder(accessToken)
    if (!folderId) throw new Error('Failed to create/find Drive backup folder')

    step = 'Drive file upload'
    const file = await uploadZipFile(accessToken, folderId, zipPath, fileName)

    step = 'Drive backup cleanup'
    await pruneOldBackups(accessToken, folderId, keepLast)
    return file
  } catch (error) {
    throw new Error(`${step}: ${error.message}`)
  }
}

async function verifyCredentials({ clientId, clientSecret, refreshToken }) {
  await getAccessToken({ clientId, clientSecret, refreshToken })
  return true
}

module.exports = {
  buildAuthUrl,
  exchangeAuthCode,
  uploadBackup,
  verifyCredentials
}
