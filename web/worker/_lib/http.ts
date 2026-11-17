export type Env = {
  DATA: KVNamespace
  ASSETS?: Fetcher
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  SESSION_SECRET?: string
  ACCESS_AUD?: string
  ACCESS_TEAM_DOMAIN?: string
  DEV_BYPASS_ACCESS?: string
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function error(message: string, status = 400) {
  return json({ error: message }, { status })
}

export function originOf(request: Request) {
  const url = new URL(request.url)
  return url.origin
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T
}
