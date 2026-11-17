# DeskMaster web

Self-hosted phone/read-only access to your DeskMaster Google Drive backup: authenticator codes, notes, and clipboard history.

**Architecture:** Cloudflare **Worker + static assets** (Vite SPA). [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) gates the hostname. The Worker talks to Google Drive, decrypts backups with your Cloud Backup passphrase (session only), and returns JSON to the UI. The passphrase is never a deploy secret — you enter it after Access login; closing the browser clears the unlock session.

Each deploy lives in **your** Cloudflare account. We do not host everyone’s data.

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bewithdhanu/deskmaster/tree/main/web)

1. Click the button (uses the `web/` Worker template). The form prompts for secrets from [`.dev.vars.example`](.dev.vars.example):
   - `GOOGLE_CLIENT_ID` — Google Cloud OAuth **Web** client ID  
   - `GOOGLE_CLIENT_SECRET` — client secret  
   - `SESSION_SECRET` — long random string (`openssl rand -hex 32`)  
2. KV (`DATA`) is auto-provisioned. Optional later: `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` to validate Access JWTs in the Worker.
3. In Google Cloud, add authorized redirect URI:  
   `https://<your-worker-host>/api/auth/google/callback`
4. In Cloudflare Zero Trust, put an **Access** application on your Worker hostname (allow your email / IdP).
5. Open the site → Access login → **Connect Google Drive** → enter backup passphrase.

Local without Access: copy `.dev.vars.example` → `.dev.vars`, uncomment `DEV_BYPASS_ACCESS=1`, then `npm run build && npm run dev:cf`.

## Run locally

```bash
cd web
npm install
npm test
cp .dev.vars.example .dev.vars   # fill secrets; enable DEV_BYPASS_ACCESS for local
npm run build
npm run dev:cf                   # Worker + assets on :8787
# Or UI-only with Vite HMR (proxy /api → wrangler on :8788):
#   terminal A: wrangler dev --port 8788
#   terminal B: npm run dev
```

From the repo root: `npm run web:dev`, `npm run web:test`, `npm run web:build`, `npm run web:deploy`.

## API (same origin)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/me` | Access identity + drive/unlock flags |
| GET | `/api/setup/status` | Google secrets / Drive connected |
| GET | `/api/auth/google/start` | Owner Drive OAuth |
| GET | `/api/auth/google/callback` | OAuth redirect |
| POST | `/api/auth/google/disconnect` | Clear Drive refresh token |
| POST | `/api/unlock` | `{ passphrase, backupId? }` → session cookie + backup |
| POST | `/api/lock` | Clear unlock session |
| GET | `/api/backups` | List `.enc.json` (requires unlock) |
| GET | `/api/backup/:id` | Decrypt one backup (`latest` allowed) |

## Security

- Cloudflare Access protects the UI and `/api/*`.
- Unlock requires Access + passphrase; passphrase stored in KV under a random session id for ≤12h, cookie is **browser-session** (no Max-Age).
- Plaintext backups are not written to KV.
- Google refresh token is stored only in your account’s KV.

## Maintainer deploy (DeskMaster account)

```bash
npm run deploy
# CLOUDFLARE_ACCOUNT_ID is pinned to the DeskMaster owner account in package.json
```
