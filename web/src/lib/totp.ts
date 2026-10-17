const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export const TOTP_PERIOD = 30

function base32ToBytes(secret: string) {
  const clean = secret.replace(/=+$/, "").replace(/\s/g, "").toUpperCase()
  let bits = ""
  for (const char of clean) {
    const value = ALPHABET.indexOf(char)
    if (value >= 0) bits += value.toString(2).padStart(5, "0")
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return new Uint8Array(bytes)
}

export async function totpCode(secret: string, now = Date.now()) {
  const counter = Math.floor(now / 1000 / TOTP_PERIOD)
  const message = new Uint8Array(8)
  new DataView(message.buffer).setUint32(4, counter)
  const key = await crypto.subtle.importKey("raw", base32ToBytes(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, message))
  const offset = sig[sig.length - 1] & 0x0f
  const bin = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3]
  return String(bin % 1000000).padStart(6, "0")
}

export function totpRemaining(now = Date.now()) {
  return TOTP_PERIOD - (Math.floor(now / 1000) % TOTP_PERIOD)
}
