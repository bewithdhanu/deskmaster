import { Fragment, useMemo, useState } from "react"
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  FileCodeIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  NotebookPenIcon,
  NotebookTextIcon,
  SearchIcon,
} from "lucide-react"
import { cn } from "cn"

import { NoteContent, PAGE_TYPE_LABEL } from "@/components/note-content"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { buildNotesTree, pagePath, pageText, type NotePage } from "@/lib/notes"
import type { NotesFile } from "@/lib/types"

const TYPE_ICON = { canvas: NotebookPenIcon, markdown: FileTextIcon, text: FileCodeIcon }

function PageIcon({ page, open }: { page: NotePage; open?: boolean }) {
  if (page.children.length) return open ? <FolderOpenIcon data-icon="inline-start" /> : <FolderIcon data-icon="inline-start" />
  const Icon = TYPE_ICON[page.type]
  return <Icon data-icon="inline-start" />
}

type TreeProps = {
  page: NotePage
  depth: number
  selectedId: string | null
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}

function TreeNode({ page, depth, selectedId, expanded, onToggle, onSelect }: TreeProps) {
  const open = expanded.has(page.id)
  const hasChildren = page.children.length > 0

  return (
    <Collapsible open={open} onOpenChange={() => onToggle(page.id)}>
      <div className="flex items-center gap-0.5" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={open ? `Collapse ${page.title}` : `Expand ${page.title}`}>
              <ChevronRightIcon className={cn("transition-transform", open && "rotate-90")} />
            </Button>
          </CollapsibleTrigger>
        ) : (
          <span className="size-7 shrink-0" />
        )}
        <Button
          variant={selectedId === page.id ? "secondary" : "ghost"}
          className="min-w-0 flex-1 justify-start"
          onClick={() => onSelect(page.id)}
        >
          <PageIcon page={page} open={open} />
          <span className="truncate">{page.title}</span>
          {hasChildren ? <Badge variant="outline" className="ml-auto">{page.children.length}</Badge> : null}
        </Button>
      </div>
      {hasChildren ? (
        <CollapsibleContent className="flex flex-col gap-0.5 pt-0.5">
          {page.children.map((child) => (
            <TreeNode key={child.id} page={child} depth={depth + 1} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
          ))}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}

function snippet(text: string, query: string) {
  const index = text.toLowerCase().indexOf(query)
  if (index < 0) return text.slice(0, 120)
  const start = Math.max(0, index - 40)
  return `${start > 0 ? "…" : ""}${text.slice(start, index + 80).replace(/\s+/g, " ")}…`
}

export function NotesView({ files }: { files?: NotesFile[] }) {
  const tree = useMemo(() => buildNotesTree(files), [files])
  const texts = useMemo(() => new Map([...tree.byId.values()].map((page) => [page.id, pageText(page)])), [tree])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState("")

  const selected = selectedId ? tree.byId.get(selectedId) ?? null : null
  const path = selected ? pagePath(tree, selected.id) : []
  const q = query.trim().toLowerCase()
  const results = q
    ? [...tree.byId.values()].filter((page) => `${page.title}\n${texts.get(page.id)}`.toLowerCase().includes(q))
    : []

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function select(id: string) {
    setSelectedId(id)
    setExpanded((current) => {
      const next = new Set(current)
      for (const ancestor of pagePath(tree, id).slice(0, -1)) next.add(ancestor.id)
      return next
    })
    window.scrollTo({ top: 0 })
  }

  if (!tree.byId.size) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NotebookTextIcon />
          </EmptyMedia>
          <EmptyTitle>No notes in this backup</EmptyTitle>
          <EmptyDescription>Pages you create in DeskMaster Notes appear here after the next backup.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const treeProps = { selectedId, expanded, onToggle: toggle, onSelect: select }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className={cn("flex flex-col gap-3 lg:sticky lg:top-32 lg:max-h-[calc(100svh-9rem)] lg:overflow-y-auto", selected && "hidden lg:flex")}>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tree.byId.size} pages`} />
        </InputGroup>

        {q ? (
          results.length ? (
            <ItemGroup className="gap-1">
              {results.map((page) => (
                <Item key={page.id} asChild variant="outline" size="sm">
                  <button type="button" onClick={() => select(page.id)} className="text-left">
                    <ItemMedia variant="icon">
                      <PageIcon page={page} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{page.title}</ItemTitle>
                      <ItemDescription>{snippet(texts.get(page.id) ?? "", q) || pagePath(tree, page.id).slice(0, -1).map((p) => p.title).join(" / ")}</ItemDescription>
                    </ItemContent>
                  </button>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <p className="px-2 text-sm text-muted-foreground">No pages match “{query.trim()}”.</p>
          )
        ) : (
          <nav className="flex flex-col gap-0.5" aria-label="Notes">
            {tree.pages.map((page) => (
              <TreeNode key={page.id} page={page} depth={0} {...treeProps} />
            ))}
            {tree.archived.length ? (
              <Collapsible open={showArchived} onOpenChange={setShowArchived} className="mt-2">
                <Separator className="mb-2" />
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start text-muted-foreground">
                    <ArchiveIcon data-icon="inline-start" />
                    Archived
                    <Badge variant="outline" className="ml-auto">{tree.archived.length}</Badge>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-0.5 pt-0.5">
                  {tree.archived.map((page) => (
                    <TreeNode key={page.id} page={page} depth={1} {...treeProps} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </nav>
        )}
      </aside>

      <section className={cn("min-w-0", !selected && "hidden lg:block")}>
        {selected ? (
          <article className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <Button variant="ghost" size="sm" className="-ml-2 self-start lg:hidden" onClick={() => setSelectedId(null)}>
                <ArrowLeftIcon data-icon="inline-start" />
                All notes
              </Button>
              {path.length > 1 || selected.archived ? (
                <Breadcrumb>
                  <BreadcrumbList>
                    {selected.archived ? (
                      <>
                        <BreadcrumbItem>Archived</BreadcrumbItem>
                        <BreadcrumbSeparator />
                      </>
                    ) : null}
                    {path.slice(0, -1).map((ancestor) => (
                      <Fragment key={ancestor.id}>
                        <BreadcrumbItem>
                          <BreadcrumbLink asChild>
                            <button type="button" onClick={() => select(ancestor.id)}>{ancestor.title}</button>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                      </Fragment>
                    ))}
                    <BreadcrumbItem>
                      <BreadcrumbPage>{selected.title}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">{selected.title}</h2>
                <Badge variant="outline">{PAGE_TYPE_LABEL[selected.type]}</Badge>
              </div>
            </div>
            <Separator />
            {texts.get(selected.id)?.trim() || selected.content.blocks?.length ? (
              <NoteContent page={selected} />
            ) : (
              <p className="text-sm text-muted-foreground">This page is empty.</p>
            )}
            {selected.children.length ? (
              <div className="flex flex-col gap-2 pt-4">
                <h3 className="text-sm font-medium text-muted-foreground">Pages inside</h3>
                <ItemGroup className="gap-1">
                  {selected.children.map((child) => (
                    <Item key={child.id} asChild variant="outline" size="sm">
                      <button type="button" onClick={() => select(child.id)} className="text-left">
                        <ItemMedia variant="icon">
                          <PageIcon page={child} />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>{child.title}</ItemTitle>
                        </ItemContent>
                        <ChevronRightIcon className="text-muted-foreground" />
                      </button>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            ) : null}
          </article>
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <NotebookTextIcon />
              </EmptyMedia>
              <EmptyTitle>Pick a page</EmptyTitle>
              <EmptyDescription>Choose a page on the left to read it.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  )
}
