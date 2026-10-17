import DOMPurify from "dompurify"
import { CheckSquareIcon, SquareIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Separator } from "@/components/ui/separator"
import {
  canvasBlocksInReadingOrder,
  type BlockNoteBlock,
  type InlineContent,
  type NotePage,
} from "@/lib/notes"

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank")
    node.setAttribute("rel", "noopener noreferrer")
  }
})

const SAFE_URL = /^(https?:|mailto:|data:image\/)/i

function safeUrl(value: unknown) {
  const url = String(value ?? "").trim()
  return SAFE_URL.test(url) ? url : undefined
}

function Inline({ content }: { content: BlockNoteBlock["content"] }) {
  if (!content) return null
  if (typeof content === "string") return <>{content}</>
  if (!Array.isArray(content)) return null
  return (
    <>
      {content.map((node: InlineContent, index) => {
        if (node.type === "link") {
          return (
            <a key={index} href={safeUrl(node.href)} target="_blank" rel="noopener noreferrer">
              <Inline content={node.content as BlockNoteBlock["content"]} />
            </a>
          )
        }
        let element: ReactNode = node.text ?? ""
        const styles = node.styles ?? {}
        if (styles.code) element = <code>{element}</code>
        if (styles.bold) element = <strong>{element}</strong>
        if (styles.italic) element = <em>{element}</em>
        if (styles.underline) element = <u>{element}</u>
        if (styles.strike) element = <s>{element}</s>
        return <span key={index}>{element}</span>
      })}
    </>
  )
}

function TableBlock({ block }: { block: BlockNoteBlock }) {
  const rows = (block.content as { rows?: { cells: unknown[] }[] })?.rows ?? []
  return (
    <div className="overflow-x-auto">
      <table>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.cells.map((cell, c) => (
                <td key={c}>
                  <Inline content={((cell as { content?: InlineContent[] }).content ?? cell) as InlineContent[]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Block({ block, number }: { block: BlockNoteBlock; number: number }) {
  const props = block.props ?? {}
  const children = block.children?.length ? <BlockList blocks={block.children} nested /> : null

  switch (block.type) {
    case "heading": {
      const level = Number(props.level) || 1
      const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3"
      return <><Tag><Inline content={block.content} /></Tag>{children}</>
    }
    case "bulletListItem":
    case "numberedListItem":
      return (
        <div className="flex gap-2">
          <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
            {block.type === "numberedListItem" ? `${number}.` : "•"}
          </span>
          <div className="min-w-0 flex-1"><p><Inline content={block.content} /></p>{children}</div>
        </div>
      )
    case "checkListItem":
      return (
        <div className="flex items-start gap-2">
          {props.checked ? <CheckSquareIcon className="mt-1 size-4 shrink-0 text-primary" /> : <SquareIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <p className={props.checked ? "text-muted-foreground line-through" : undefined}><Inline content={block.content} /></p>
            {children}
          </div>
        </div>
      )
    case "quote":
      return <blockquote><Inline content={block.content} />{children}</blockquote>
    case "codeBlock":
      return <pre><Inline content={block.content} /></pre>
    case "table":
      return <TableBlock block={block} />
    case "image": {
      const src = safeUrl(props.url)
      return src ? (
        <figure>
          <img src={src} alt={String(props.caption ?? "")} />
          {props.caption ? <figcaption className="text-sm text-muted-foreground">{String(props.caption)}</figcaption> : null}
        </figure>
      ) : null
    }
    case "divider":
      return <Separator className="my-3" />
    default:
      return <><p><Inline content={block.content} /></p>{children}</>
  }
}

function BlockList({ blocks, nested = false }: { blocks: BlockNoteBlock[]; nested?: boolean }) {
  const numbers = blocks.reduce<number[]>((acc, block, index) => {
    acc.push(block.type === "numberedListItem" ? (acc[index - 1] ?? 0) + 1 : 0)
    return acc
  }, [])
  return (
    <div className={nested ? "flex flex-col gap-1 pl-5" : "flex flex-col gap-1"}>
      {blocks.map((block, index) => (
        <Block key={block.id ?? index} block={block} number={numbers[index]} />
      ))}
    </div>
  )
}

export function NoteContent({ page }: { page: NotePage }) {
  const { content } = page

  if (Array.isArray(content.blocknote)) {
    const [first, ...rest] = content.blocknote
    const repeatsTitle =
      first?.type === "heading" && Number(first.props?.level) === 1 && !first.children?.length &&
      Array.isArray(first.content) && first.content.map((node) => node.text ?? "").join("").trim() === page.title
    return <div className="note-html"><BlockList blocks={repeatsTitle ? rest : content.blocknote} /></div>
  }

  if (Array.isArray(content.blocks)) {
    return (
      <div className="flex flex-col gap-4">
        {canvasBlocksInReadingOrder(content.blocks).map((block, index) => (
          <div
            key={block.id ?? index}
            className="note-html whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.content ?? "") }}
          />
        ))}
      </div>
    )
  }

  return (
    <pre className="font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
      {content.text}
    </pre>
  )
}

export const PAGE_TYPE_LABEL: Record<NotePage["type"], string> = {
  canvas: "OneNote",
  markdown: "Markdown",
  text: "Plain text",
}
