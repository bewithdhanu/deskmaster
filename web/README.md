# DeskMaster web

Read-only phone access to a DeskMaster Google Drive backup: authenticator codes, notes (same tree as the desktop) and clipboard history. The backup is decrypted in the browser with the passphrase from DeskMaster → Settings → Cloud Backup. The passphrase and decrypted data stay in memory, and the app locks after 3 minutes in the background.

Built with Vite, React, Tailwind 4 and shadcn/ui (radix-nova). It lives in `web/` of the DeskMaster repo with its own `package.json`, and is not part of the Electron build. The tests reuse the desktop `backupCrypto.js` to prove both sides read the same file.

## Run locally

```bash
cd web
npm install
npm test
npm run dev
```

From the repo root: `npm run web:dev`, `npm run web:test`, `npm run web:build`.

Open http://localhost:5173. That address must be an **Authorized JavaScript origin** on the Web OAuth client used to sign in. Scope: `https://www.googleapis.com/auth/drive.file`.

## Cloudflare Pages

```bash
npm run deploy        # inside web/
npm run web:deploy    # from the repo root
```

`public/_headers` sets the Content-Security-Policy. The only third-party script is Google sign-in.

Only encrypted `.enc.json` backups are listed. Older `.zip` backups from before encryption are skipped.
