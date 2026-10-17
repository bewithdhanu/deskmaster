const assert = require('assert')
const { webcrypto } = require('crypto')
const { encryptBackup, decryptBackup, isBackupEnvelope } = require('../../backupCrypto')

const payload = { version: '1.1', authenticators: [{ name: 'AWS', secret: 'JBSWY3DPEHPK3PXP', password: 'p@ss' }] }

async function main() {
  const envelope = encryptBackup(payload, 'correct horse battery staple')

  assert.ok(isBackupEnvelope(envelope), 'envelope shape')
  assert.ok(!JSON.stringify(envelope).includes('JBSWY3DPEHPK3PXP'), 'secret must not appear in ciphertext')
  assert.deepStrictEqual(decryptBackup(envelope, 'correct horse battery staple'), payload, 'node roundtrip')

  assert.throws(() => decryptBackup(envelope, 'wrong'), /Wrong passphrase/, 'wrong passphrase rejected')
  assert.throws(() => encryptBackup(payload, '  '), /required/, 'empty passphrase rejected')

  // Prove the browser (WebCrypto) can read what Node wrote - this is what the web app will do.
  const enc = new TextEncoder()
  const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'))
  const baseKey = await webcrypto.subtle.importKey('raw', enc.encode('correct horse battery staple'), 'PBKDF2', false, ['deriveKey'])
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64(envelope.salt), iterations: envelope.iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const gz = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(envelope.iv) }, key, b64(envelope.data))
  const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  assert.deepStrictEqual(JSON.parse(text), payload, 'WebCrypto + DecompressionStream roundtrip')

  // Size sanity: gzip-before-encrypt must keep big repetitive backups small.
  const big = { rows: Array.from({ length: 20000 }, (_, i) => ({ id: i, content: 'clipboard text '.repeat(5) })) }
  const rawBytes = Buffer.byteLength(JSON.stringify(big))
  const encBytes = Buffer.byteLength(JSON.stringify(encryptBackup(big, 'x')))
  assert.ok(encBytes < rawBytes / 5, `encrypted ${encBytes} should be well under raw ${rawBytes}`)

  console.log('backupCrypto: all checks passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
