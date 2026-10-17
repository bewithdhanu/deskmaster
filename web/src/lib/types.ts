export type Authenticator = {
  id?: number | string
  name?: string
  secret?: string
  url?: string
  username?: string
  password?: string
}

export type ClipEntry = {
  id?: number | string
  timestamp?: string | number
  content?: string
  source?: string
}

export type NotesFile = { path: string; data: string }

export type Backup = {
  exportDate?: string
  authenticators?: Authenticator[]
  clipboardHistory?: ClipEntry[]
  notes?: { version?: number; files?: NotesFile[] }
}

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
