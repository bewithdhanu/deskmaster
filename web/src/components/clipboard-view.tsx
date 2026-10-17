import { useMemo, useState } from "react"
import { ClipboardIcon, CopyIcon, SearchIcon } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup } from "@/components/ui/item"
import { copy } from "@/lib/copy"
import { clockTime, dayLabel } from "@/lib/format"
import type { ClipEntry } from "@/lib/types"

const LIMIT = 200

function ClipItem({ entry }: { entry: ClipEntry }) {
  const [open, setOpen] = useState(false)
  const content = entry.content ?? ""
  return (
    <Item variant="outline" size="sm" className="items-start">
      <ItemContent className="min-w-0">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn("text-left font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap", !open && "line-clamp-4")}
        >
          {content}
        </button>
        <ItemDescription className="flex items-center gap-2">
          {entry.timestamp ? clockTime(entry.timestamp) : null}
          {entry.source && entry.source !== "system" ? <Badge variant="outline">{entry.source}</Badge> : null}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="ghost" size="icon-sm" aria-label="Copy" onClick={() => copy(content, "Clip")}>
          <CopyIcon />
        </Button>
      </ItemActions>
    </Item>
  )
}

export function ClipboardView({ entries }: { entries: ClipEntry[] }) {
  const [query, setQuery] = useState("")
  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()),
    [entries]
  )
  const q = query.trim().toLowerCase()
  const shown = (q ? sorted.filter((entry) => String(entry.content ?? "").toLowerCase().includes(q)) : sorted).slice(0, LIMIT)

  const groups: { label: string; items: ClipEntry[] }[] = []
  for (const entry of shown) {
    const label = entry.timestamp ? dayLabel(entry.timestamp) : "Earlier"
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] })
    groups.at(-1)!.items.push(entry)
  }

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${sorted.length} clips`} />
      </InputGroup>

      {groups.length ? (
        groups.map((group) => (
          <section key={group.label} className="flex flex-col gap-2">
            <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h3>
            <ItemGroup className="gap-2">
              {group.items.map((entry, index) => (
                <ClipItem key={entry.id ?? `${group.label}-${index}`} entry={entry} />
              ))}
            </ItemGroup>
          </section>
        ))
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardIcon />
            </EmptyMedia>
            <EmptyTitle>{q ? "Nothing matches" : "Clipboard history is empty"}</EmptyTitle>
            <EmptyDescription>{q ? "Try a different search." : "Copied text on your Mac shows up here after the next backup."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {shown.length === LIMIT ? <p className="text-center text-xs text-muted-foreground">Showing the latest {LIMIT}. Search to find older clips.</p> : null}
    </div>
  )
}
