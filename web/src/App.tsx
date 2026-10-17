import { useEffect, useState } from "react"
import { ClipboardIcon, ClockIcon, LockIcon, MoonIcon, NotebookTextIcon, ShieldCheckIcon, SunIcon } from "lucide-react"

import { Credits, Logo } from "@/components/brand"
import { ClipboardView } from "@/components/clipboard-view"
import { CodesView } from "@/components/codes-view"
import { NotesView } from "@/components/notes-view"
import { useTheme } from "@/components/theme-provider"
import { UnlockScreen } from "@/components/unlock-screen"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ago } from "@/lib/format"
import type { Backup } from "@/lib/types"

const LOCK_AFTER_MS = 3 * 60 * 1000

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

export function App() {
  const [data, setData] = useState<Backup | null>(null)
  const [tab, setTab] = useState("codes")

  useEffect(() => {
    if (!data) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onVisibility = () => {
      clearTimeout(timer)
      if (document.visibilityState === "hidden") timer = setTimeout(() => setData(null), LOCK_AFTER_MS)
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      clearTimeout(timer)
    }
  }, [data])

  if (!data) {
    return (
      <UnlockScreen
        onUnlock={(backup) => {
          setTab("codes")
          setData(backup)
        }}
      />
    )
  }

  const codes = data.authenticators ?? []
  const clips = data.clipboardHistory ?? []

  return (
    <Tabs value={tab} onValueChange={setTab} className="min-h-svh gap-0">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pt-3 pb-3">
          <div className="flex items-center gap-3">
            <Logo className="size-9" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold tracking-tight">DeskMaster</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ClockIcon className="size-3" />
                Backed up {ago(data.exportDate)}
              </span>
            </div>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => setData(null)}>
              <LockIcon data-icon="inline-start" />
              Lock
            </Button>
          </div>
          <TabsList className="w-full">
            <TabsTrigger value="codes">
              <ShieldCheckIcon />
              Codes
              <Badge variant="secondary">{codes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="notes">
              <NotebookTextIcon />
              Notes
            </TabsTrigger>
            <TabsTrigger value="clipboard">
              <ClipboardIcon />
              Clipboard
            </TabsTrigger>
          </TabsList>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-safe">
        <TabsContent value="codes" className="pb-8">
          <CodesView items={codes} />
        </TabsContent>
        <TabsContent value="notes" className="pb-8">
          <NotesView files={data.notes?.files} />
        </TabsContent>
        <TabsContent value="clipboard" className="pb-8">
          <ClipboardView entries={clips} />
        </TabsContent>
        <Credits className="border-t pt-4 pb-2" />
      </main>
    </Tabs>
  )
}

export default App
