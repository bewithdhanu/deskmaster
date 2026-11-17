/** DeskMaster backup envelope decrypt (WebCrypto). Same format as desktop backupCrypto.js / src/lib/backup.ts. */

export type Envelope = {
  format: string
  version: number
  encrypted: boolean
  iterations?: number
  compression?: string
  salt: string
  iv: string
  data: string
}

export type Backup = {
  exportDate?: string
  authenticators?: unknown[]
  clipboardHistory?: unknown[]
  notes?: { version?: number; files?: { path: string; data: string }[] }
}

const b64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0))

export function isBackupEnvelope(value: unknown): value is Envelope {
  const v = value as Partial<Envelope> | null
  return Boolean(v && v.format === 'deskmaster-backup' && v.encrypted === true)
}

export async function decryptBackup(envelope: Envelope, passphrase: string): Promise<Backup> {
  if (!isBackupEnvelope(envelope)) throw new Error('Not a DeskMaster encrypted backup')
  if (envelope.version !== 1) throw new Error(`Unsupported backup version: ${envelope.version}`)

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64(envelope.salt),
      iterations: Number(envelope.iterations) || 600000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64(envelope.iv) },
      key,
      b64(envelope.data)
    )
  } catch {
    throw new Error('Wrong passphrase or corrupted backup')
  }

  const json =
    envelope.compression === 'gzip'
      ? await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(plain)

  return JSON.parse(json) as Backup
}
