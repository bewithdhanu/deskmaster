import type { Envelope } from "./types.ts"

const SCOPE = "https://www.googleapis.com/auth/drive.file"

export type DriveBackup = { id: string; name: string; createdTime: string }

type TokenResponse = { access_token?: string; error?: string }
type GoogleOAuth = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback: (error: { message?: string }) => void
      }) => { requestAccessToken: () => void }
    }
  }
}

declare global {
  interface Window {
    google?: GoogleOAuth
  }
}

function waitForGoogle(): Promise<GoogleOAuth> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google)
      else if (Date.now() - started > 8000) reject(new Error("Google sign-in did not load"))
      else setTimeout(tick, 50)
    }
    tick()
  })
}

export async function signIn(clientId: string): Promise<string> {
  const google = await waitForGoogle()
  return new Promise((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (response) => {
          if (response.access_token) resolve(response.access_token)
          else reject(new Error(response.error || "Google sign-in was cancelled"))
        },
        error_callback: (error) => reject(new Error(error.message || "Google sign-in failed")),
      })
      .requestAccessToken()
  })
}

// Newest first. Old .zip backups from before encryption are skipped: the phone cannot read them.
export async function listBackups(token: string): Promise<DriveBackup[]> {
  const query = encodeURIComponent("trashed=false and name contains 'deskmaster-backup-'")
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,createdTime)`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Could not list Drive backups (${response.status})`)
  const body = (await response.json()) as { files?: DriveBackup[] }
  return (body.files ?? []).filter((file) => file.name.endsWith(".enc.json"))
}

export async function downloadBackup(token: string, fileId: string): Promise<Envelope> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Could not download the backup (${response.status})`)
  return (await response.json()) as Envelope
}
