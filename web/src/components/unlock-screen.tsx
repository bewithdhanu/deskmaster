import { useRef, useState, type ChangeEvent, type FormEvent } from "react"
import {
  CloudIcon,
  EyeIcon,
  EyeOffIcon,
  FileUpIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  LogOutIcon,
} from "lucide-react"

import { Credits, Logo } from "@/components/brand"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { decryptBackup, isBackupEnvelope } from "@/lib/backup"
import { downloadBackup, listBackups, signIn, type DriveBackup } from "@/lib/drive"
import { backupLabel } from "@/lib/format"
import type { Backup, Envelope } from "@/lib/types"

type Props = {
  onUnlock: (data: Backup) => void
}

export function UnlockScreen({ onUnlock }: Props) {
  const [clientId, setClientId] = useState("")
  const [token, setToken] = useState<string | null>(null)
  const [backups, setBackups] = useState<DriveBackup[]>([])
  const [backupId, setBackupId] = useState("")
  const [localFile, setLocalFile] = useState<{ name: string; envelope: Envelope } | null>(null)
  const [passphrase, setPassphrase] = useState("")
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [busy, setBusy] = useState<"connect" | "unlock" | null>(null)
  const [error, setError] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)

  const hasSource = Boolean(localFile || backupId)

  async function connect() {
    setError("")
    setBusy("connect")
    try {
      const accessToken = await signIn(clientId.trim())
      const files = await listBackups(accessToken)
      setToken(accessToken)
      setBackups(files)
      setBackupId(files[0]?.id ?? "")
      setLocalFile(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  function disconnect() {
    setToken(null)
    setBackups([])
    setBackupId("")
  }

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError("")
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isBackupEnvelope(parsed)) throw new Error("Choose a deskmaster-backup .enc.json file")
      setLocalFile({ name: file.name, envelope: parsed })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault()
    if (!passphrase || !hasSource) return
    setError("")
    setBusy("unlock")
    try {
      const envelope = localFile?.envelope ?? (await downloadBackup(token!, backupId))
      const data = await decryptBackup(envelope, passphrase)
      setPassphrase("")
      onUnlock(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-primary/15 via-primary/5 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="size-16 shadow-lg shadow-primary/30" />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">DeskMaster</h1>
            <p className="text-sm text-muted-foreground">Your codes, notes and clipboard, from your latest Mac backup.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Unlock your backup</CardTitle>
            <CardDescription>Decrypted on this device only. Nothing is saved.</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="unlock" onSubmit={unlock}>
              <FieldGroup>
                {token ? (
                  <Field>
                    <FieldLabel htmlFor="backup">Backup</FieldLabel>
                    {backups.length ? (
                      <Select value={backupId} onValueChange={(value) => { setBackupId(value); setLocalFile(null) }}>
                        <SelectTrigger id="backup" className="w-full">
                          <SelectValue placeholder="Choose a backup" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {backups.map((backup, index) => (
                              <SelectItem key={backup.id} value={backup.id}>
                                {backupLabel(backup.createdTime)}
                                {index === 0 ? <Badge variant="secondary">Latest</Badge> : null}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Alert>
                        <CloudIcon />
                        <AlertTitle>No encrypted backups yet</AlertTitle>
                        <AlertDescription>
                          In DeskMaster, set a backup passphrase under Settings, Cloud Backup, then choose Backup now.
                        </AlertDescription>
                      </Alert>
                    )}
                    <FieldDescription className="flex items-center justify-between gap-2">
                      <span>Google Drive connected</span>
                      <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={disconnect}>
                        <LogOutIcon data-icon="inline-start" />
                        Disconnect
                      </Button>
                    </FieldDescription>
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel htmlFor="client-id">Google OAuth client ID</FieldLabel>
                    <Input
                      id="client-id"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      placeholder="xxxx.apps.googleusercontent.com"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <Button type="button" variant="secondary" disabled={!clientId.trim() || busy !== null} onClick={connect}>
                      {busy === "connect" ? <Spinner data-icon="inline-start" /> : <CloudIcon data-icon="inline-start" />}
                      Continue with Google
                    </Button>
                  </Field>
                )}

                {localFile ? (
                  <Alert>
                    <FileUpIcon />
                    <AlertTitle>Using a file from this device</AlertTitle>
                    <AlertDescription className="truncate">{localFile.name}</AlertDescription>
                  </Alert>
                ) : null}

                <Field data-disabled={!hasSource || undefined}>
                  <FieldLabel htmlFor="passphrase">Backup passphrase</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <KeyRoundIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="passphrase"
                      type={showPassphrase ? "text" : "password"}
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      placeholder="Set in DeskMaster settings"
                      autoComplete="current-password"
                      disabled={!hasSource}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                        onClick={() => setShowPassphrase((value) => !value)}
                      >
                        {showPassphrase ? <EyeOffIcon /> : <EyeIcon />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>

                {error ? (
                  <Alert variant="destructive">
                    <AlertTitle>{error}</AlertTitle>
                  </Alert>
                ) : null}
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" form="unlock" size="lg" className="w-full" disabled={!passphrase || !hasSource || busy !== null}>
              {busy === "unlock" ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
              {busy === "unlock" ? "Decrypting…" : "Unlock"}
            </Button>
            <Separator />
            <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUpIcon data-icon="inline-start" />
              Open a backup file instead
            </Button>
            <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={openFile} />
          </CardFooter>
        </Card>
        <Credits />
      </div>
    </div>
  )
}
