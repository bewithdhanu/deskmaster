const { app } = require('electron')
const { spawn, execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { pipeline } = require('stream/promises')
const { createWriteStream } = require('fs')

const ARCHIVE_BY_ARCH = {
  arm64: 'cloudflared-darwin-arm64.tgz',
  x64: 'cloudflared-darwin-amd64.tgz'
}

let downloadPromise = null

function getBinDir() {
  const dir = path.join(app.getPath('userData'), 'bin')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getManagedBinaryPath() {
  return path.join(getBinDir(), 'cloudflared')
}

function whichCloudflared() {
  return new Promise((resolve) => {
    execFile('which', ['cloudflared'], { timeout: 3000 }, (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }
      const found = String(stdout || '').trim().split('\n')[0]
      resolve(found || null)
    })
  })
}

function verifyBinary(binaryPath) {
  return new Promise((resolve) => {
    execFile(binaryPath, ['--version'], { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) {
        resolve(false)
        return
      }
      const out = `${stdout || ''}${stderr || ''}`
      resolve(/cloudflared/i.test(out))
    })
  })
}

function followRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const req = client.get(url, { headers: { 'User-Agent': 'DeskMaster' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects downloading cloudflared'))
          return
        }
        const next = new URL(res.headers.location, url).toString()
        followRedirects(next, maxRedirects - 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`Failed to download cloudflared (HTTP ${res.statusCode})`))
        return
      }
      resolve(res)
    })
    req.on('error', reject)
  })
}

async function downloadAndExtract(archiveName, destPath) {
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${archiveName}`
  const tmpTgz = `${destPath}.download.tgz`
  const tmpBin = `${destPath}.download.bin`

  try {
    if (fs.existsSync(tmpTgz)) fs.unlinkSync(tmpTgz)
    if (fs.existsSync(tmpBin)) fs.unlinkSync(tmpBin)

    const res = await followRedirects(url)
    await pipeline(res, createWriteStream(tmpTgz))

    await new Promise((resolve, reject) => {
      const tar = spawn('tar', ['-xzf', tmpTgz, '-C', path.dirname(destPath)], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let errText = ''
      tar.stderr.on('data', (chunk) => { errText += chunk.toString() })
      tar.on('error', reject)
      tar.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(errText.trim() || `tar exited with code ${code}`))
      })
    })

    // Archive extracts as "cloudflared" in the bin dir
    const extracted = path.join(path.dirname(destPath), 'cloudflared')
    if (!fs.existsSync(extracted)) {
      throw new Error('cloudflared binary missing after extract')
    }

    // If extract path == dest, just chmod; otherwise move into place atomically
    if (path.resolve(extracted) !== path.resolve(destPath)) {
      fs.renameSync(extracted, destPath)
    }

    fs.chmodSync(destPath, 0o755)

    const ok = await verifyBinary(destPath)
    if (!ok) {
      try { fs.unlinkSync(destPath) } catch {}
      throw new Error('Downloaded cloudflared failed version check')
    }
  } finally {
    try { if (fs.existsSync(tmpTgz)) fs.unlinkSync(tmpTgz) } catch {}
    try { if (fs.existsSync(tmpBin)) fs.unlinkSync(tmpBin) } catch {}
  }
}

async function ensureManagedBinary() {
  const dest = getManagedBinaryPath()
  if (fs.existsSync(dest) && await verifyBinary(dest)) {
    return dest
  }

  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const archiveName = ARCHIVE_BY_ARCH[arch]
  if (!archiveName) {
    throw new Error(`Unsupported architecture for cloudflared: ${process.arch}`)
  }

  if (!downloadPromise) {
    downloadPromise = downloadAndExtract(archiveName, dest)
      .catch((err) => {
        try { if (fs.existsSync(dest)) fs.unlinkSync(dest) } catch {}
        throw err
      })
      .finally(() => {
        downloadPromise = null
      })
  }

  await downloadPromise
  return dest
}

/**
 * Resolve a usable cloudflared binary.
 * Prefers PATH, otherwise downloads official release into userData/bin.
 * @returns {Promise<{ path: string, source: 'path' | 'managed', downloading?: boolean }>}
 */
async function ensureCloudflared() {
  const onPath = await whichCloudflared()
  if (onPath && await verifyBinary(onPath)) {
    return { path: onPath, source: 'path' }
  }

  const managed = getManagedBinaryPath()
  const needsDownload = !(fs.existsSync(managed) && await verifyBinary(managed))
  const binaryPath = await ensureManagedBinary()
  return { path: binaryPath, source: 'managed', downloading: needsDownload }
}

function isCloudflaredAvailableSync() {
  try {
    return fs.existsSync(getManagedBinaryPath())
  } catch {
    return false
  }
}

module.exports = {
  ensureCloudflared,
  getManagedBinaryPath,
  isCloudflaredAvailableSync
}
