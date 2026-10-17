import type { NotesFile } from "./types.ts"

export type PageType = "text" | "canvas" | "markdown"

export type CanvasBlock = { id?: string; x?: number; y?: number; width?: number; content?: string }
export type InlineContent = {
  type: string
  text?: string
  href?: string
  styles?: Record<string, unknown>
  content?: InlineContent[] | string
}
export type BlockNoteBlock = {
  id?: string
  type: string
  props?: Record<string, unknown>
  content?: InlineContent[] | { type: string; rows?: { cells: unknown[] }[] } | string
  children?: BlockNoteBlock[]
}

export type PageContent = {
  text?: string
  blocks?: CanvasBlock[]
  blocknote?: BlockNoteBlock[]
}

export type NotePage = {
  id: string
  title: string
  type: PageType
  order: number
  content: PageContent
  children: NotePage[]
  parentId: string | null
  archived: boolean
}

export type NotesTree = {
  pages: NotePage[]
  archived: NotePage[]
  byId: Map<string, NotePage>
}

export const ARCHIVED_ID = "notes_archived_root"

function decode(data: string) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function parse<T>(file: NotesFile | undefined): T | null {
  if (!file) return null
  try {
    return JSON.parse(decode(file.data)) as T
  } catch {
    return null
  }
}

function normalizeType(value: unknown): PageType {
  return value === "text" || value === "markdown" ? value : "canvas"
}

// Same layout as the desktop notes folder: <order>__<title>__<id>/meta.json + content.json, nested for children.
// "Archived/" holds archived pages and "_clipboard/" is internal (skipped, as on desktop).
export function buildNotesTree(files: NotesFile[] | undefined): NotesTree {
  const byPath = new Map((files ?? []).map((file) => [file.path, file]))
  const dirs = new Map<string, NotePage>()

  for (const file of files ?? []) {
    if (!file.path.endsWith("/meta.json") || file.path.startsWith("_clipboard/")) continue
    const meta = parse<{ id?: string; title?: string; type?: string; order?: number }>(file)
    if (!meta?.id) continue
    const dir = file.path.slice(0, -"/meta.json".length)
    dirs.set(dir, {
      id: meta.id,
      title: meta.title?.trim() || "Untitled",
      type: normalizeType(meta.type),
      order: typeof meta.order === "number" ? meta.order : 0,
      content: parse<PageContent>(byPath.get(`${dir}/content.json`)) ?? {},
      children: [],
      parentId: null,
      archived: dir === "Archived" || dir.startsWith("Archived/"),
    })
  }

  const pages: NotePage[] = []
  const archived: NotePage[] = []
  for (const [dir, page] of dirs) {
    const parentDir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : ""
    const parent = dirs.get(parentDir)
    if (parent) {
      page.parentId = parent.id
      parent.children.push(page)
    } else if (parentDir === "Archived") {
      page.parentId = ARCHIVED_ID
      archived.push(page)
    } else if (parentDir === "") {
      pages.push(page)
    }
  }

  const byOrder = (a: NotePage, b: NotePage) => a.order - b.order
  for (const page of dirs.values()) page.children.sort(byOrder)
  pages.sort(byOrder)
  archived.sort(byOrder)

  return { pages, archived, byId: new Map([...dirs.values()].map((page) => [page.id, page])) }
}

function inlineText(content: BlockNoteBlock["content"]): string {
  if (!content) return ""
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((node) => node.text ?? inlineText(node.content as BlockNoteBlock["content"]))
      .join("")
  }
  return (content.rows ?? [])
    .map((row) => row.cells.map((cell) => inlineText((cell as { content?: InlineContent[] }).content ?? (cell as InlineContent[]))).join(" "))
    .join("\n")
}

function blockText(blocks: BlockNoteBlock[]): string {
  return blocks.map((block) => [inlineText(block.content), blockText(block.children ?? [])].filter(Boolean).join("\n")).join("\n")
}

export function htmlToText(html: string) {
  return html
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

export function pageText(page: NotePage) {
  const { content } = page
  if (Array.isArray(content.blocknote)) return blockText(content.blocknote)
  if (Array.isArray(content.blocks)) return canvasBlocksInReadingOrder(content.blocks).map((block) => htmlToText(block.content ?? "")).join("\n")
  return content.text ?? ""
}

export function canvasBlocksInReadingOrder(blocks: CanvasBlock[]) {
  return [...blocks].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
}

export function pagePath(tree: NotesTree, id: string) {
  const path: NotePage[] = []
  let current = tree.byId.get(id)
  while (current) {
    path.unshift(current)
    current = current.parentId ? tree.byId.get(current.parentId) : undefined
  }
  return path
}
