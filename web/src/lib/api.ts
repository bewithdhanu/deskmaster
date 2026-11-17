import type { Backup } from "@/lib/types"

export type DriveBackup = { id: string; name: string; createdTime: string }

export type Me = {
  email: string
  googleConfigured: boolean
  driveConnected: boolean
  unlocked: boolean
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body
}

export const getMe = () => api<Me>("/api/me")

export const unlock = (passphrase: string, backupId?: string) =>
  api<{ ok: true; backupId: string; backups: DriveBackup[]; backup: Backup }>("/api/unlock", {
    method: "POST",
    body: JSON.stringify({ passphrase, backupId }),
  })

export const lock = () => api<{ ok: true }>("/api/lock", { method: "POST" })

export const listBackups = () => api<{ backups: DriveBackup[] }>("/api/backups")

export const getBackup = (id: string) =>
  api<{ backupId: string; backup: Backup }>(`/api/backup/${encodeURIComponent(id)}`)
