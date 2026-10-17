import { useEffect, useMemo, useState } from "react"
import { CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, SearchIcon, ShieldOffIcon } from "lucide-react"
import { cn } from "cn"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { awsAccountId, awsCopyText, isAws } from "@/lib/aws"
import { copy } from "@/lib/copy"
import { TOTP_PERIOD, totpCode, totpRemaining } from "@/lib/totp"
import type { Authenticator } from "@/lib/types"

const AVATAR_TONES = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
]

function tone(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

function keyOf(item: Authenticator) {
  return String(item.id ?? item.secret ?? item.name)
}

function CountdownRing({ remaining }: { remaining: number }) {
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const urgent = remaining <= 5
  return (
    <div className="relative flex size-10 items-center justify-center" aria-label={`${remaining} seconds left`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - remaining / TOTP_PERIOD)}
          className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear", urgent ? "stroke-destructive" : "stroke-primary")}
        />
      </svg>
      <span className={cn("text-xs font-medium tabular-nums", urgent && "text-destructive")}>{remaining}</span>
    </div>
  )
}

function CodeCard({ item, code, remaining }: { item: Authenticator; code?: string; remaining: number }) {
  const [reveal, setReveal] = useState(false)
  const name = item.name?.trim() || "Account"
  const subtitle = awsAccountId(item) || item.username || ""
  const urgent = remaining <= 5

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="lg">
            <AvatarFallback className={cn("font-semibold", tone(name))}>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle className="truncate">{name}</CardTitle>
            {subtitle ? <CardDescription className="truncate">{subtitle}</CardDescription> : null}
          </div>
        </div>
        <CardAction>
          <CountdownRing remaining={remaining} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => code && copy(code, "Code")}
          className={cn(
            "flex items-baseline gap-3 rounded-lg text-left font-mono text-4xl font-semibold tracking-[0.18em] tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:opacity-70",
            urgent ? "text-destructive" : "text-foreground"
          )}
          aria-label="Copy code"
        >
          {code ? `${code.slice(0, 3)} ${code.slice(3)}` : "··· ···"}
        </button>
        {item.password ? (
          <InputGroup>
            <InputGroupAddon>
              <KeyRoundIcon />
            </InputGroupAddon>
            <InputGroupInput readOnly value={reveal ? item.password : "••••••••••"} className="font-mono" aria-label="Password" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label={reveal ? "Hide password" : "Show password"} onClick={() => setReveal((value) => !value)}>
                {reveal ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
              <InputGroupButton size="icon-xs" aria-label="Copy password" onClick={() => copy(item.password!, "Password")}>
                <CopyIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ) : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="secondary" size="sm" onClick={() => code && copy(code, "Code")}>
          <CopyIcon data-icon="inline-start" />
          Copy code
        </Button>
        {isAws(item) ? (
          <Button variant="outline" size="sm" onClick={() => copy(awsCopyText(item, code ?? ""), "AWS sign-in")}>
            <CopyIcon data-icon="inline-start" />
            Copy AWS
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  )
}

export function CodesView({ items }: { items: Authenticator[] }) {
  const [query, setQuery] = useState("")
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [remaining, setRemaining] = useState(totpRemaining())

  const sorted = useMemo(
    () => [...items].sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""))),
    [items]
  )

  useEffect(() => {
    let stopped = false
    let window = -1
    const tick = async () => {
      const now = Date.now()
      setRemaining(totpRemaining(now))
      const current = Math.floor(now / 1000 / TOTP_PERIOD)
      if (current === window) return
      window = current
      const next: Record<string, string> = {}
      for (const item of sorted) if (item.secret) next[keyOf(item)] = await totpCode(item.secret, now)
      if (!stopped) setCodes(next)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [sorted])

  const q = query.trim().toLowerCase()
  const shown = q
    ? sorted.filter((item) => `${item.name} ${item.username} ${item.url} ${awsAccountId(item) ?? ""}`.toLowerCase().includes(q))
    : sorted

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${sorted.length} accounts`} />
      </InputGroup>

      {shown.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((item) => (
            <CodeCard key={keyOf(item)} item={item} code={codes[keyOf(item)]} remaining={remaining} />
          ))}
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldOffIcon />
            </EmptyMedia>
            <EmptyTitle>{q ? "No matching accounts" : "No authenticator accounts"}</EmptyTitle>
            <EmptyDescription>{q ? "Try a different search." : "Accounts added in DeskMaster appear after the next backup."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
