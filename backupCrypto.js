const crypto = require('crypto')
const zlib = require('zlib')

// Cloud backup envelope (v1). Designed so a browser can read it natively:
//   key  = PBKDF2-SHA256(passphrase, salt, iterations) -> 256-bit
//   data = AES-256-GCM over gzip(JSON), 12-byte IV, auth tag appended (WebCrypto layout)
//   gzip is applied BEFORE encrypting - ciphertext cannot be compressed afterwards.
const FORMAT = 'deskmaster-backup'
const VERSION = 1
const ITERATIONS = 600000
const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16

function deriveKey(passphrase, salt, iterations) {
  return crypto.pbkdf2Sync(String(passphrase), salt, iterations, 32, 'sha256')
}

function encryptBackup(payload, passphrase) {
  if (!passphrase || !String(passphrase).trim()) {
    throw new Error('Backup passphrase is required')
  }

  const salt = crypto.randomBytes(SALT_BYTES)
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt, ITERATIONS), iv)
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  const body = Buffer.concat([cipher.update(compressed), cipher.final()])
  const data = Buffer.concat([body, cipher.getAuthTag()])

  return {
    format: FORMAT,
    version: VERSION,
    encrypted: true,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    compression: 'gzip',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: data.toString('base64')
  }
}

function isBackupEnvelope(value) {
  return Boolean(value && value.format === FORMAT && value.encrypted === true)
}

function decryptBackup(envelope, passphrase) {
  if (!isBackupEnvelope(envelope)) throw new Error('Not a DeskMaster encrypted backup')
  if (envelope.version !== VERSION) throw new Error(`Unsupported backup version: ${envelope.version}`)

  const salt = Buffer.from(envelope.salt, 'base64')
  const iv = Buffer.from(envelope.iv, 'base64')
  const raw = Buffer.from(envelope.data, 'base64')
  const body = raw.subarray(0, raw.length - TAG_BYTES)
  const tag = raw.subarray(raw.length - TAG_BYTES)

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(passphrase, salt, Number(envelope.iterations) || ITERATIONS),
    iv
  )
  decipher.setAuthTag(tag)

  try {
    const plain = Buffer.concat([decipher.update(body), decipher.final()])
    const json = envelope.compression === 'gzip' ? zlib.gunzipSync(plain) : plain
    return JSON.parse(json.toString('utf8'))
  } catch {
    throw new Error('Wrong passphrase or corrupted backup')
  }
}

module.exports = { encryptBackup, decryptBackup, isBackupEnvelope, FORMAT, VERSION }
