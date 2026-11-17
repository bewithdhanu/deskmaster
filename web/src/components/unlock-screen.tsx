import { useEffect, useState, type FormEvent } from "react"
import {
  CloudIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  Settings2Icon,
} from "lucide-react"

import { Credits, Logo } from "@/components/brand"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { getBackup, getMe, unlock as unlockApi, type DriveBackup, type Me } from "@/lib/api"
import { backupLabel } from "@/lib/format"
import type { Backup } from "@/lib/types"

type Props = {
  onUnlock: (data: Backup) => void
}

export function UnlockScreen({ onUnlock }: Props) {
  const [me, setMe] = useState<Me | null>(null)
  const [backups, setBackups] = useState<DriveBackup[]>([])
  const [backupId, setBackupId] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Clear OAuth return flag from the URL without remounting
        if (new URLSearchParams(window.location.search).get("drive") === "connected") {
          window.history.replaceState(null, "", window.location.pathname)
        }
        const status = await getMe()
        if (cancelled) return
        setMe(status)
        if (status.unlocked) {
          try {
            const { backup } = await getBackup("latest")
            if (!cancelled) onUnlock(backup)
            return
          } catch {
            // Session stale — show passphrase form
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onUnlock])

  async function unlock(event: FormEvent) {
    event.preventDefault()
    if (!passphrase.trim()) return
    setError("")
    setBusy(true)
    try {
      const result = await unlockApi(passphrase.trim(), backupId || undefined)
      setBackups(result.backups)
      setBackupId(result.backupId)
      setPassphrase("")
      onUnlock(result.backup)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  const needsGoogleSecrets = me && !me.googleConfigured
  const needsDrive = me && me.googleConfigured && !me.driveConnected

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-primary/15 via-primary/5 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="size-16 shadow-lg shadow-primary/30" />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">DeskMaster</h1>
            <p className="text-sm text-muted-foreground">
              Your codes, notes and clipboard — decrypted by your Cloudflare Worker after Access login.
            </p>
          </div>
          {me?.email ? (
            <Badge variant="secondary" className="font-normal">
              {me.email}
            </Badge>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Unlock your backup</CardTitle>
            <CardDescription>
              Enter the Cloud Backup passphrase from DeskMaster. It stays in a browser session only — closing the browser locks again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {needsGoogleSecrets ? (
              <Alert>
                <Settings2Icon />
                <AlertTitle>Google OAuth not configured</AlertTitle>
                <AlertDescription>
                  Set <code className="text-xs">GOOGLE_CLIENT_ID</code> and{" "}
                  <code className="text-xs">GOOGLE_CLIENT_SECRET</code> as Worker secrets (Deploy form or `wrangler secret put`), then reload.
                </AlertDescription>
              </Alert>
            ) : null}

            {needsDrive ? (
              <div className="flex flex-col gap-3">
                <Alert>
                  <CloudIcon />
                  <AlertTitle>Connect Google Drive</AlertTitle>
                  <AlertDescription>
                    One-time owner setup. DeskMaster will store a refresh token in your Cloudflare KV — not in the browser.
                  </AlertDescription>
                </Alert>
                <Button asChild size="lg" className="w-full">
                  <a href="/api/auth/google/start">
                    <CloudIcon data-icon="inline-start" />
                    Connect Google Drive
                  </a>
                </Button>
              </div>
            ) : null}

            {!needsGoogleSecrets && !needsDrive ? (
              <form id="unlock" onSubmit={unlock}>
                <FieldGroup>
                  {backups.length > 0 ? (
                    <Field>
                      <FieldLabel htmlFor="backup">Backup</FieldLabel>
                      <Select value={backupId} onValueChange={setBackupId}>
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
                      <FieldDescription>Leave as latest, or pick another after the first unlock.</FieldDescription>
                    </Field>
                  ) : null}

                  <Field>
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
                        placeholder="Set in DeskMaster → Cloud Backup"
                        autoComplete="current-password"
                        autoFocus
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
            ) : error ? (
              <Alert variant="destructive" className="mt-3">
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            ) : null}
          </CardContent>
          {!needsGoogleSecrets && !needsDrive ? (
            <CardFooter>
              <Button type="submit" form="unlock" size="lg" className="w-full" disabled={!passphrase.trim() || busy}>
                {busy ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
                {busy ? "Decrypting…" : "Unlock"}
              </Button>
            </CardFooter>
          ) : null}
        </Card>
        <Credits />
      </div>
    </div>
  )
}
