/// <reference types="@cloudflare/workers-types" />
import type { Env } from './worker/_lib/http'
import { handleApi } from './worker/router'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env)
    }

    // Static SPA (wrangler [assets] not_found_handling = single-page-application)
    if (!env.ASSETS) {
      return new Response('ASSETS binding missing — run npm run build before wrangler deploy', {
        status: 500
      })
    }
    return env.ASSETS.fetch(request)
  }
} satisfies ExportedHandler<Env>
