import type { Env } from './http'

export type AccessIdentity = { email: string; sub: string }

/** When Access JWT env is set, validate Cf-Access-Jwt-Assertion. Local/dev can bypass. */
export async function requireAccess(
  request: Request,
  env: Env
): Promise<AccessIdentity | Response> {
  if (env.DEV_BYPASS_ACCESS === '1' || env.DEV_BYPASS_ACCESS === 'true') {
    return { email: 'dev@localhost', sub: 'dev' }
  }

  const jwt = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) {
    // Access not configured on this deploy: allow through (owner still needs unlock + Drive).
    // Production self-host should set ACCESS_AUD + ACCESS_TEAM_DOMAIN.
    if (!jwt) return { email: 'anonymous', sub: 'anonymous' }
  }

  if (!jwt) return new Response(JSON.stringify({ error: 'Cloudflare Access login required' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })

  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) {
    // JWT present but no validation config — accept email claim without verify (edge already gated).
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      return { email: String(payload.email || payload.common_name || 'access-user'), sub: String(payload.sub || '') }
    } catch {
      return { email: 'access-user', sub: 'access' }
    }
  }

  try {
    const identity = await verifyAccessJwt(jwt, env.ACCESS_AUD, env.ACCESS_TEAM_DOMAIN)
    return identity
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid Cloudflare Access token' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    })
  }
}

async function verifyAccessJwt(token: string, aud: string, teamDomain: string): Promise<AccessIdentity> {
  const certsUrl = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`
  const certs = (await (await fetch(certsUrl)).json()) as {
    keys: Array<JsonWebKey & { kid: string }>
  }
  const header = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))) as { kid: string; alg: string }
  const jwk = certs.keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new Error('Unknown Access signing key')

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'verify'
  ])
  const [rawHeader, rawPayload, rawSig] = token.split('.')
  const data = new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
  const signature = Uint8Array.from(atob(rawSig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)
  if (!ok) throw new Error('Access JWT signature invalid')

  const payload = JSON.parse(atob(rawPayload.replace(/-/g, '+').replace(/_/g, '/'))) as {
    aud?: string | string[]
    email?: string
    sub?: string
    exp?: number
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(aud)) throw new Error('Access JWT audience mismatch')
  if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('Access JWT expired')

  return { email: String(payload.email || 'access-user'), sub: String(payload.sub || '') }
}
