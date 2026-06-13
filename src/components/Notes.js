import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MdAdd, MdArchive, MdChevronRight, MdClose, MdExpandMore, MdNotes, MdSearch } from 'react-icons/md';
import MonacoEditor, { loader as monacoLoader } from '@monaco-editor/react';
import { FormattingToolbarController, useCreateBlockNote, useEditorChange } from '@blocknote/react';
import { BlockNoteView, ShadCNDefaultComponents } from '@blocknote/shadcn';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/shadcn/style.css';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Slot } from '@radix-ui/react-slot';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cva } from 'class-variance-authority';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { OneNoteEditor } from '../vendor/onenote-style-editor/index.js';
import { getIpcRenderer, isElectron } from '../utils/electron';
import { DeskMasterFormattingToolbar } from './blocknote/MarkdownAiToolbarButtons.js';
import './onenote-style-editor.css';

const ipcRenderer = getIpcRenderer();

const LEGACY_TREE_STORAGE_KEY = 'notes.tree.v1';
const LEGACY_PAGE_STATE_KEY_PREFIX = 'notes.pageState.v1.';
const ARCHIVE_ROOT_ID = 'notes_archived_root';
const PAGE_TYPE_CANVAS = 'canvas';
const PAGE_TYPE_TEXT = 'text';
const PAGE_TYPE_MARKDOWN = 'markdown';

monacoLoader.config({ paths: { vs: './vs' } });

function cn(...values) {
  return values.flat().filter(Boolean).join(' ');
}

/** Matches @blocknote/shadcn button.tsx but forwards ref (ToolbarButton passes ref). */
const blockNoteButtonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*=size-])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

const BlockNoteButton = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(blockNoteButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
});
BlockNoteButton.displayName = 'Button';

/** Matches @blocknote/shadcn toggle.tsx but forwards ref (ToolbarButton passes ref). */
const blockNoteToggleVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg:not([class*=size-])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground'
      },
      size: {
        default: 'h-9 px-2 min-w-9',
        sm: 'h-8 px-1.5 min-w-8',
        lg: 'h-10 px-2.5 min-w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

const BlockNoteToggle = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    data-slot="toggle"
    className={cn(blockNoteToggleVariants({ variant, size, className }))}
    {...props}
  />
));
BlockNoteToggle.displayName = 'Toggle';

const blockNoteShadcnOverrides = {
  Button: {
    ...ShadCNDefaultComponents.Button,
    Button: BlockNoteButton
  },
  Toggle: {
    ...ShadCNDefaultComponents.Toggle,
    Toggle: BlockNoteToggle
  },
  DropdownMenu: {
    ...ShadCNDefaultComponents.DropdownMenu,
    DropdownMenuTrigger: React.forwardRef((props, ref) => (
      <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" ref={ref} {...props} />
    )),
    DropdownMenuContent: React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin) z-50 min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border p-1 shadow-md',
          className
        )}
        ref={ref}
        {...props}
      />
    )),
    DropdownMenuItem: React.forwardRef(({ className, inset, variant = 'default', ...props }, ref) => (
      <DropdownMenuPrimitive.Item
        data-slot="dropdown-menu-item"
        data-inset={inset}
        data-variant={variant}
        className={cn(
          'focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*=text-])]:text-muted-foreground outline-hidden relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[disabled]:pointer-events-none data-[inset]:pl-8 data-[disabled]:opacity-50 [&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
          className
        )}
        ref={ref}
        {...props}
      />
    )),
    DropdownMenuLabel: React.forwardRef(({ className, inset, ...props }, ref) => (
      <DropdownMenuPrimitive.Label
        data-slot="dropdown-menu-label"
        data-inset={inset}
        className={cn('px-2 py-1.5 text-sm font-medium data-[inset]:pl-8', className)}
        ref={ref}
        {...props}
      />
    )),
    DropdownMenuSeparator: React.forwardRef(({ className, ...props }, ref) => (
      <DropdownMenuPrimitive.Separator
        data-slot="dropdown-menu-separator"
        className={cn('bg-border -mx-1 my-1 h-px', className)}
        ref={ref}
        {...props}
      />
    )),
    DropdownMenuCheckboxItem: React.forwardRef(({ className, children, checked, ...props }, ref) => (
      <DropdownMenuPrimitive.CheckboxItem
        data-slot="dropdown-menu-checkbox-item"
        className={cn(
          'focus:bg-accent focus:text-accent-foreground outline-hidden relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
          className
        )}
        checked={checked}
        ref={ref}
        {...props}
      >
        <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
          <DropdownMenuPrimitive.ItemIndicator>
            <CheckIcon className="size-4" />
          </DropdownMenuPrimitive.ItemIndicator>
        </span>
        {children}
      </DropdownMenuPrimitive.CheckboxItem>
    )),
    DropdownMenuSubTrigger: React.forwardRef(({ className, inset, children, ...props }, ref) => (
      <DropdownMenuPrimitive.SubTrigger
        data-slot="dropdown-menu-sub-trigger"
        data-inset={inset}
        className={cn(
          'focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground outline-hidden flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm data-[inset]:pl-8',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
        <ChevronRightIcon className="ml-auto size-4" />
      </DropdownMenuPrimitive.SubTrigger>
    )),
    DropdownMenuSubContent: React.forwardRef(({ className, ...props }, ref) => (
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-(--radix-dropdown-menu-content-transform-origin) z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-lg',
          className
        )}
        ref={ref}
        {...props}
      />
    ))
  },
  Popover: {
    ...ShadCNDefaultComponents.Popover,
    PopoverTrigger: React.forwardRef((props, ref) => (
      <PopoverPrimitive.Trigger data-slot="popover-trigger" ref={ref} {...props} />
    )),
    PopoverContent: React.forwardRef(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-popover-content-transform-origin) outline-hidden z-50 w-72 rounded-md border p-4 shadow-md',
          className
        )}
        ref={ref}
        {...props}
      />
    ))
  },
  Tooltip: {
    ...ShadCNDefaultComponents.Tooltip,
    TooltipProvider: (props) => <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={0} {...props} />,
    Tooltip: (props) => (
      <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={0}>
        <TooltipPrimitive.Root data-slot="tooltip" {...props} />
      </TooltipPrimitive.Provider>
    ),
    TooltipTrigger: React.forwardRef((props, ref) => (
      <TooltipPrimitive.Trigger data-slot="tooltip-trigger" ref={ref} {...props} />
    )),
    TooltipContent: React.forwardRef(({ className, sideOffset = 0, children, ...props }, ref) => (
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-tooltip-content-transform-origin) z-50 w-fit text-balance rounded-md px-3 py-1.5 text-xs',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-primary fill-primary z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    ))
  }
};

function isValidBlockNoteBlocks(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((block) => block && typeof block === 'object' && typeof block.type === 'string');
}

/** BlockNote partial block: heading level 1 showing the note title in the markdown editor. */
function blockNoteTitleHeading(pageTitle) {
  const text = String(pageTitle ?? '').trim() || 'Untitled';
  return {
    type: 'heading',
    props: { level: 1 },
    content: [{ type: 'text', text, styles: {} }]
  };
}

/** Ensures the document starts with an H1 whose text matches the sidebar page name. */
function ensureMarkdownLeadingTitle(blocks, pageTitle) {
  const title = String(pageTitle ?? '').trim() || 'Untitled';
  const h1 = blockNoteTitleHeading(title);

  if (!isValidBlockNoteBlocks(blocks)) {
    return [h1];
  }

  const first = blocks[0];
  const isH1 = first.type === 'heading' && Number(first.props?.level) === 1;

  if (isH1) {
    return [
      {
        ...first,
        props: { ...first.props, level: 1 },
        content: [{ type: 'text', text: title, styles: {} }]
      },
      ...blocks.slice(1)
    ];
  }

  return [h1, ...blocks];
}

/** Plain text from BlockNote inline content (H1 title line). */
function inlineContentToPlainString(content) {
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      if (!c || typeof c !== 'object') return '';
      if (c.type === 'text' && typeof c.text === 'string') return c.text;
      if (c.type === 'link' && Array.isArray(c.content)) return inlineContentToPlainString(c.content);
      return '';
    })
    .join('')
    .trim();
}

/** First heading-1 block plain text, or null if not an H1 first block. */
function getFirstH1PlainTitle(blocks) {
  if (!isValidBlockNoteBlocks(blocks) || !blocks[0]) return null;
  const first = blocks[0];
  if (first.type !== 'heading' || Number(first.props?.level) !== 1) return null;
  const raw = inlineContentToPlainString(first.content);
  const t = raw.trim();
  return t.length ? t : null;
}

function syncMarkdownTitleHeadingEditor(editor, pageTitle) {
  if (!editor) return;
  const title = String(pageTitle ?? '').trim() || 'Untitled';
  const h1 = blockNoteTitleHeading(title);
  try {
    const doc = editor.document;
    if (!Array.isArray(doc) || doc.length === 0) {
      editor.replaceBlocks(editor.document, [h1]);
      return;
    }
    const first = doc[0];
    if (first.type === 'heading' && Number(first.props?.level) === 1) {
      if (inlineContentToPlainString(first.content) === title) return;
      editor.updateBlock(first, {
        type: 'heading',
        props: { level: 1 },
        content: [{ type: 'text', text: title, styles: {} }]
      });
    } else {
      editor.insertBlocks([h1], first, 'before');
    }
  } catch {}
}

function normalizePageType(type) {
  if (type === PAGE_TYPE_TEXT) return PAGE_TYPE_TEXT;
  if (type === PAGE_TYPE_MARKDOWN) return PAGE_TYPE_MARKDOWN;
  return PAGE_TYPE_CANVAS;
}

function getPathIds(nodes, targetId, path = []) {
  for (const node of nodes || []) {
    if (node.id === targetId) return [...path, node.id];
    if (node.children?.length) {
      const found = getPathIds(node.children, targetId, [...path, node.id]);
      if (found) return found;
    }
  }
  return null;
}

function stripHtmlForSearch(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scrollElementIntoViewWithin(element, container) {
  if (!element) return;
  if (!container) {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const elRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const nextTop = elRect.top - containerRect.top + container.scrollTop - container.clientHeight / 2 + elRect.height / 2;
  container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
}

function highlightQueryInContentEditable(contentEl, query) {
  const q = String(query || '').trim();
  if (!contentEl || !q) return false;

  const plain = (contentEl.innerText || contentEl.textContent || '').replace(/\s+/g, ' ');
  const lower = plain.toLowerCase();
  const qLower = q.toLowerCase();
  const matchIndex = lower.indexOf(qLower);
  if (matchIndex < 0) return false;

  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  const matchEnd = matchIndex + q.length;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeLen = node.textContent.length;
    if (!startNode && charCount + nodeLen > matchIndex) {
      startNode = node;
      startOffset = matchIndex - charCount;
    }
    if (!endNode && charCount + nodeLen >= matchEnd) {
      endNode = node;
      endOffset = matchEnd - charCount;
      break;
    }
    charCount += nodeLen;
  }

  if (!startNode || !endNode) return false;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  contentEl.focus();

  const scrollContainer = contentEl.closest('.one-canvas') || contentEl.closest('.overflow-y-auto');
  scrollElementIntoViewWithin(contentEl, scrollContainer);

  return true;
}

function applyMonacoSearchHighlight(editor, query) {
  const q = String(query || '').trim();
  if (!editor || !q) return false;
  const model = editor.getModel?.();
  if (!model) return false;
  const matches = model.findMatches(q, false, false, false, null, false);
  if (!matches.length) return false;
  editor.setSelection(matches[0].range);
  editor.revealRangeInCenter(matches[0].range, 1);
  editor.focus();
  return true;
}

function applyCanvasSearchHighlight(editor, query) {
  const q = String(query || '').trim();
  if (!editor || !q) return false;
  const blocks = editor.getBlocks?.() || [];
  for (const block of blocks) {
    const plain = stripHtmlForSearch(block._contentEl?.innerHTML || '');
    if (!plain.toLowerCase().includes(q.toLowerCase())) continue;
    if (block.canvasEl) {
      block.canvasEl.scrollTop = Math.max(0, block.y - 80);
      block.canvasEl.scrollLeft = Math.max(0, block.x - 40);
    }
    block.focus?.();
    return highlightQueryInContentEditable(block._contentEl, q);
  }
  return false;
}

function applyMarkdownSearchHighlight(query) {
  const q = String(query || '').trim();
  if (!q) return false;
  const scrollRoot = document.querySelector('.notes-markdown-root .overflow-y-auto');
  const editableBlocks = scrollRoot?.querySelectorAll('[contenteditable="true"]') || [];
  for (const contentEl of editableBlocks) {
    const plain = (contentEl.innerText || '').replace(/\s+/g, ' ').trim();
    if (!plain.toLowerCase().includes(q.toLowerCase())) continue;
    scrollElementIntoViewWithin(contentEl, scrollRoot);
    contentEl.focus();
    return highlightQueryInContentEditable(contentEl, q);
  }
  return false;
}

function BlockNoteMarkdownEditor({ initialBlocks, legacyMarkdown, pageTitle, dark, onEditorReady, onBlocksChange }) {
  const editor = useCreateBlockNote({
    initialContent: isValidBlockNoteBlocks(initialBlocks) ? initialBlocks : undefined
  });

  const handlePaste = useCallback(
    (e) => {
      try {
        const cd = e.clipboardData;
        if (!cd) return;
        const text = cd.getData('text/plain');
        if (typeof text !== 'string' || !text) return;

        // Only intercept when the clipboard clearly contains Markdown *structure*.
        // Plain paragraphs (even with punctuation) should use the editor's native paste.
        const hasStructuralMd = /(^|\n)\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|```)/.test(text);
        const hasMdLinksOrEmphasis = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__)/.test(text);
        const hasMultipleLines = text.split('\n').filter((l) => l.trim().length > 0).length >= 2;
        const looksLikeMd = hasStructuralMd || (hasMultipleLines && hasMdLinksOrEmphasis) || (hasMultipleLines && hasStructuralMd);

        if (!looksLikeMd) return;

        e.preventDefault();
        e.stopPropagation();

        void (async () => {
          try {
            const blocks = await editor.tryParseMarkdownToBlocks(text);
            if (!Array.isArray(blocks) || !blocks.length) return;

            const ref = editor.getTextCursorPosition?.()?.block || editor.document?.[editor.document.length - 1] || null;
            if (ref) editor.insertBlocks(blocks, ref, 'after');
            else editor.replaceBlocks(editor.document, blocks);
          } catch {}
        })();
      } catch {}
    },
    [editor]
  );

  useEffect(() => {
    if (typeof onEditorReady === 'function') onEditorReady(editor);
    return () => {
      if (typeof onEditorReady === 'function') onEditorReady(null);
    };
  }, [editor, onEditorReady]);

  useEffect(() => {
    let cancelled = false;
    if (isValidBlockNoteBlocks(initialBlocks)) return () => {};
    if (typeof legacyMarkdown !== 'string' || !legacyMarkdown.trim()) return () => {};
    void (async () => {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(legacyMarkdown);
        if (cancelled) return;
        const merged = ensureMarkdownLeadingTitle(blocks, pageTitle);
        editor.replaceBlocks(editor.document, merged);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, initialBlocks, legacyMarkdown, pageTitle]);

  useEditorChange(
    (ed) => {
      if (typeof onBlocksChange === 'function') onBlocksChange(ed.document);
    },
    editor
  );

  return (
    <div
      className={`bn-root h-full min-h-0 flex flex-col overflow-hidden ${dark ? 'dark' : ''}`}
      data-color-scheme={dark ? 'dark' : 'light'}
      style={{ backgroundColor: '#1f1f1f' }}
    >
      <BlockNoteView
        editor={editor}
        shadCNComponents={blockNoteShadcnOverrides}
        className="flex-1 min-h-0 overflow-y-auto"
        formattingToolbar={false}
        onPasteCapture={handlePaste}
      >
        <FormattingToolbarController formattingToolbar={DeskMasterFormattingToolbar} />
      </BlockNoteView>
    </div>
  );
}

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createId() {
  return `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function findNodeById(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children && n.children.length) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function collectSubtreeIds(node, acc = []) {
  if (!node) return acc;
  acc.push(node.id);
  if (Array.isArray(node.children)) {
    node.children.forEach((c) => collectSubtreeIds(c, acc));
  }
  return acc;
}

function containsIdInSubtree(node, id) {
  if (!node) return false;
  if (node.id === id) return true;
  if (!Array.isArray(node.children) || !node.children.length) return false;
  return node.children.some((c) => containsIdInSubtree(c, id));
}

function findParentId(nodes, id, parentId = null) {
  for (const n of nodes || []) {
    if (n.id === id) return parentId;
    if (Array.isArray(n.children) && n.children.length) {
      const found = findParentId(n.children, id, n.id);
      if (found !== undefined) return found;
    }
  }
  // Important: undefined means "not found". null means "found at root".
  return undefined;
}

function removeNodeById(nodes, id) {
  let removedNode = null;
  const nextNodes = [];

  for (const n of nodes) {
    if (n.id === id) {
      removedNode = n;
      continue;
    }

    if (n.children && n.children.length) {
      const result = removeNodeById(n.children, id);
      if (result.removedNode) {
        removedNode = result.removedNode;
        nextNodes.push({ ...n, children: result.nextNodes });
        continue;
      }
    }

    nextNodes.push(n);
  }

  return { nextNodes, removedNode };
}

function ensureArchivedRoot(nodes) {
  const existing = findNodeById(nodes, ARCHIVE_ROOT_ID);
  if (existing) return nodes;
  return [...nodes, { id: ARCHIVE_ROOT_ID, title: 'Archived', children: [] }];
}

function cloneNodeWithNewIds(node) {
  const idMap = {};

  const clone = (n) => {
    const nextId = createId();
    idMap[n.id] = nextId;
    return {
      ...n,
      id: nextId,
      children: Array.isArray(n.children) ? n.children.map(clone) : []
    };
  };

  return { cloned: clone(node), idMap };
}

function insertAtRoot(nodes, node) {
  return [...nodes, node];
}

function getArchivedChildren(tree) {
  const archived = findNodeById(tree, ARCHIVE_ROOT_ID);
  return Array.isArray(archived?.children) ? archived.children : [];
}

function addChildNode(nodes, parentId, newNode) {
  return nodes.map((n) => {
    if (n.id === parentId) {
      const children = Array.isArray(n.children) ? n.children : [];
      return { ...n, children: [...children, newNode] };
    }
    if (n.children && n.children.length) {
      return { ...n, children: addChildNode(n.children, parentId, newNode) };
    }
    return n;
  });
}

function updateNodeTitle(nodes, id, title) {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, title };
    if (n.children && n.children.length) return { ...n, children: updateNodeTitle(n.children, id, title) };
    return n;
  });
}

function flattenIds(nodes, acc = []) {
  for (const n of nodes) {
    acc.push(n.id);
    if (n.children && n.children.length) flattenIds(n.children, acc);
  }
  return acc;
}

function TreeRow({
  node,
  depth,
  expanded,
  selectedId,
  selectedIds,
  onSelect,
  onToggle,
  onAddChild,
  onStartRename,
  onRequestArchive,
  onRequestRestore,
  onContextMenu,
  renamingId,
  renameValue,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  dragOverId,
  dragOverPosition,
  mode
}) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isSelected = selectedId === node.id || Boolean(selectedIds?.has?.(node.id));
  const isRenaming = renamingId === node.id;
  const isDragOver = dragOverId === node.id;
  const dropPos = isDragOver ? dragOverPosition : null; // 'before' | 'after' | 'inside' | null
  const showAddChild = mode === 'notes';

  return (
    <div>
      <div
        className={`relative flex items-center gap-1 rounded px-2 py-0.5 cursor-pointer select-none ${
          dropPos === 'inside' ? 'ring-1 ring-[#0078d4] bg-theme-card-hover/60' : ''
        } ${
          isSelected ? 'bg-theme-card-hover text-theme-primary' : 'text-theme-secondary hover:bg-theme-card-hover'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={(e) => onSelect(node.id, e)}
        onDoubleClick={() => onStartRename(node.id)}
        onContextMenu={(e) => onContextMenu(e, node.id)}
        draggable={node.id !== ARCHIVE_ROOT_ID}
        onDragStart={(e) => onDragStart(e, node.id)}
        onDragOver={(e) => onDragOver(e, node.id)}
        onDragLeave={(e) => onDragLeave?.(e, node.id)}
        onDrop={(e) => onDrop(e, node.id)}
      >
        {dropPos === 'before' ? (
          <div className="absolute left-0 right-0 -top-[2px] h-[2px] bg-[#0078d4] rounded-full" />
        ) : null}
        {dropPos === 'after' ? (
          <div className="absolute left-0 right-0 -bottom-[2px] h-[2px] bg-[#0078d4] rounded-full" />
        ) : null}
        <button
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-theme-card border-none bg-transparent text-theme-muted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : ''}
        >
          {hasChildren ? (isExpanded ? <MdExpandMore className="w-5 h-5" /> : <MdChevronRight className="w-5 h-5" />) : null}
        </button>

        <MdNotes className="w-3.5 h-3.5 text-theme-muted flex-shrink-0" />
        <div className={`flex-1 min-w-0 ${isRenaming ? 'select-text' : ''}`}>
          {isRenaming ? (
            <input
              type="text"
              aria-label="Rename page"
              autoComplete="off"
              spellCheck
              className="w-full h-6 px-2 rounded border border-theme bg-theme-primary text-theme-primary text-sm outline-none select-text"
              style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  onCommitRename();
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancelRename();
                  return;
                }
                // Let ⌘A/Ctrl+A, clipboard shortcuts, arrow keys, etc. use native input behavior.
              }}
              onBlur={() => onCommitRename()}
              autoFocus
            />
          ) : (
            <div className="truncate text-sm">{node.title}</div>
          )}
        </div>

        {showAddChild && (
          <button
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-theme-card border-none bg-transparent text-theme-muted"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddChild(node.id);
            }}
            title="Add nested page"
          >
            <MdAdd className="w-4 h-4" />
          </button>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="mt-1">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onStartRename={onStartRename}
              onRequestArchive={onRequestArchive}
              onRequestRestore={onRequestRestore}
              onContextMenu={onContextMenu}
              renamingId={renamingId}
              renameValue={renameValue}
              onRenameValueChange={onRenameValueChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              dragOverId={dragOverId}
              dragOverPosition={dragOverPosition}
              mode={mode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const Notes = () => {
  const [tree, setTree] = useState([]);
  const allIds = useMemo(() => flattenIds(tree).filter((id) => id !== ARCHIVE_ROOT_ID), [tree]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectionAnchorIdRef = useRef(null);
  const [clipboard, setClipboard] = useState(null);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, targetId: null });
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOver, setDragOver] = useState({ id: null, position: null });
  const [mode, setMode] = useState('notes');
  const [archiveConfirm, setArchiveConfirm] = useState({ open: false, targetId: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, targetId: null });
  const [newPageType, setNewPageType] = useState(PAGE_TYPE_CANVAS);
  const [newPageMenu, setNewPageMenu] = useState({ open: false, x: 0, y: 0, parentId: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [textValue, setTextValue] = useState('');
  const textEditorRef = useRef(null);
  const [textAi, setTextAi] = useState({ open: false, busy: false, selection: '', history: [], prompt: '' });
  const [markdownInitialBlocks, setMarkdownInitialBlocks] = useState(null);
  const getMonacoSelectedText = useCallback(() => {
    const ed = textEditorRef.current;
    if (!ed) return '';
    try {
      const sel = ed.getSelection?.();
      const model = ed.getModel?.();
      if (!sel || !model) return '';
      return String(model.getValueInRange(sel) || '');
    } catch {
      return '';
    }
  }, []);

  const applyMonacoReplaceSelection = useCallback((newText) => {
    const ed = textEditorRef.current;
    if (!ed) return false;
    try {
      const sel = ed.getSelection?.();
      if (!sel) return false;
      ed.executeEdits('ai', [{ range: sel, text: newText, forceMoveMarkers: true }]);
      return true;
    } catch {
      return false;
    }
  }, []);

  const runTextAi = useCallback(
    async (actionKey, extra = {}) => {
      const selected = getMonacoSelectedText().trim();
      if (!selected) return;
      setTextAi((p) => ({ ...p, open: true, busy: true, selection: selected }));
      try {
        const result = await ipcRenderer.invoke('ai-edit-text', selected, actionKey, extra);
        if (typeof result === 'string' && result.trim()) {
          setTextAi((p) => ({
            ...p,
            history: [...(p.history || []), { q: actionKey === 'custom' ? extra?.instruction || 'Custom' : actionKey, a: result }]
          }));
        }
      } catch (e) {
        window.alert(e?.message || 'AI request failed');
      } finally {
        setTextAi((p) => ({ ...p, busy: false }));
      }
    },
    [getMonacoSelectedText]
  );

  const runTextAiFollowup = useCallback(async () => {
    const instruction = String(textAi.prompt || '').trim();
    if (!instruction) return;
    const last = Array.isArray(textAi.history) && textAi.history.length ? textAi.history[textAi.history.length - 1] : null;
    const base = String(textAi.selection || getMonacoSelectedText() || '').trim();
    if (!base) return;
    // Include last answer as context for follow-ups.
    const contextText = last?.a ? `${base}\n\n---\nAI_OUTPUT:\n${last.a}` : base;
    setTextAi((p) => ({ ...p, open: true, busy: true }));
    try {
      const result = await ipcRenderer.invoke('ai-edit-text', contextText, 'custom', { instruction });
      if (typeof result === 'string' && result.trim()) {
        setTextAi((p) => ({
          ...p,
          prompt: '',
          history: [...(p.history || []), { q: instruction, a: result }]
        }));
      }
    } catch (e) {
      window.alert(e?.message || 'AI request failed');
    } finally {
      setTextAi((p) => ({ ...p, busy: false }));
    }
  }, [textAi.prompt, textAi.history, textAi.selection, getMonacoSelectedText]);
  const [markdownLegacyText, setMarkdownLegacyText] = useState('');
  const [markdownHydrationKey, setMarkdownHydrationKey] = useState(0);

  const editorHostRef = useRef(null);
  const editorRef = useRef(null);
  const blockNoteEditorRef = useRef(null);
  const blockNoteBlocksRef = useRef([]);
  const blockNoteSaveTimerRef = useRef(null);
  /** Ignore editor onChange briefly after loading content (avoids noisy saves; real edits save after this window). */
  const markdownSuppressSaveUntilRef = useRef(0);
  const themeObserverRef = useRef(null);
  const uiHydratedRef = useRef(false);
  const persistUiTimerRef = useRef(null);
  const skipNonCanvasAutosaveRef = useRef(false);
  const newButtonRef = useRef(null);
  const treeRef = useRef(tree);
  const selectedIdRef = useRef(selectedId);
  const markdownTitleRenameTimerRef = useRef(null);
  const pendingSearchHighlightRef = useRef(null);
  const tryApplyPendingSearchHighlightRef = useRef(() => {});

  const selectedNode = useMemo(() => (selectedId ? findNodeById(tree, selectedId) : null), [tree, selectedId]);
  const selectedType = useMemo(() => normalizePageType(selectedNode?.type), [selectedNode]);
  const markdownPageTitle = useMemo(() => {
    if (!selectedId) return 'Untitled';
    return String(findNodeById(tree, selectedId)?.title || '').trim() || 'Untitled';
  }, [tree, selectedId]);

  useLayoutEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  useLayoutEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  tryApplyPendingSearchHighlightRef.current = () => {
    const pending = pendingSearchHighlightRef.current;
    if (!pending?.query || pending.pageId !== selectedIdRef.current) return false;

    const node = findNodeById(treeRef.current, pending.pageId);
    const pageType = normalizePageType(node?.type);
    let applied = false;

    if (pageType === PAGE_TYPE_TEXT && textEditorRef.current) {
      applied = applyMonacoSearchHighlight(textEditorRef.current, pending.query);
    } else if (pageType === PAGE_TYPE_CANVAS && editorRef.current) {
      applied = applyCanvasSearchHighlight(editorRef.current, pending.query);
    } else if (pageType === PAGE_TYPE_MARKDOWN) {
      applied = applyMarkdownSearchHighlight(pending.query);
    }

    if (applied) {
      pendingSearchHighlightRef.current = null;
    }
    return applied;
  };

  useEffect(() => {
    return () => {
      if (markdownTitleRenameTimerRef.current) {
        clearTimeout(markdownTitleRenameTimerRef.current);
        markdownTitleRenameTimerRef.current = null;
      }
    };
  }, [selectedId, selectedType]);

  useLayoutEffect(() => {
    if (!selectedId || selectedType !== PAGE_TYPE_MARKDOWN) return;
    setMarkdownInitialBlocks(null);
    setMarkdownLegacyText('');
  }, [selectedId, selectedType]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const hasPages = await ipcRenderer.invoke('notes:has-pages');
        if (!hasPages) {
          const legacyTree = safeJsonParse(localStorage.getItem(LEGACY_TREE_STORAGE_KEY), null);
          if (Array.isArray(legacyTree)) {
            const ids = flattenIds(legacyTree);
            const pageStatesById = {};
            ids.forEach((id) => {
              try {
                const raw = localStorage.getItem(LEGACY_PAGE_STATE_KEY_PREFIX + id);
                if (raw) pageStatesById[id] = raw;
              } catch {}
            });
            await ipcRenderer.invoke('notes:migrate-legacy', { tree: legacyTree, pageStatesById });
            try {
              localStorage.removeItem(LEGACY_TREE_STORAGE_KEY);
              ids.forEach((id) => localStorage.removeItem(LEGACY_PAGE_STATE_KEY_PREFIX + id));
            } catch {}
          }
        }

        const nextTree = await ipcRenderer.invoke('notes:list-tree');
        if (cancelled) return;
        if (!Array.isArray(nextTree)) {
          setLoadError(isElectron() ? 'Failed to load notes.' : 'DeskMaster desktop app must be running to access Notes.');
          setIsLoading(false);
          return;
        }
        setTree(nextTree);
        try {
          const settings = await ipcRenderer.invoke('get-settings');
          const ui = settings?.notesUi || {};
          const nextMode = ui.mode === 'archive' ? 'archive' : 'notes';
          const nextNewType = normalizePageType(ui.newPageType);
          const allNodeIds = new Set(flattenIds(nextTree));
          const expandedIds = Array.isArray(ui.expandedIds) ? ui.expandedIds.filter((id) => allNodeIds.has(id)) : [];
          const candidateSelected = ui.selectedId && allNodeIds.has(ui.selectedId) && ui.selectedId !== ARCHIVE_ROOT_ID ? ui.selectedId : null;

          setMode(nextMode);
          setNewPageType(nextNewType);
          setExpanded(new Set(expandedIds));
          if (candidateSelected) setSelectedId(candidateSelected);
        } catch {}
        uiHydratedRef.current = true;
        setIsLoading(false);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e?.message || (isElectron() ? 'Failed to load notes' : 'DeskMaster desktop app must be running to access Notes.'));
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (persistUiTimerRef.current) {
        clearTimeout(persistUiTimerRef.current);
        persistUiTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!uiHydratedRef.current) return;
    if (allIds.length && (!selectedId || !allIds.includes(selectedId))) setSelectedId(allIds[0]);
  }, [allIds, selectedId]);

  useEffect(() => {
    if (!uiHydratedRef.current) return;
    if (expanded.size) return;
    const first = (mode === 'notes' ? tree.filter((n) => n.id !== ARCHIVE_ROOT_ID) : getArchivedChildren(tree))[0];
    if (!first) return;
    setExpanded(new Set([first.id]));
  }, [tree, mode, expanded.size]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await ipcRenderer.invoke('notes:search', query);
        setSearchResults(Array.isArray(results) ? results : []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!uiHydratedRef.current) return;
    if (persistUiTimerRef.current) clearTimeout(persistUiTimerRef.current);
    persistUiTimerRef.current = setTimeout(() => {
      persistUiTimerRef.current = null;
      try {
        ipcRenderer.invoke('update-settings', {
          notesUi: {
            mode,
            selectedId: selectedId || null,
            expandedIds: Array.from(expanded),
            newPageType
          }
        });
      } catch {}
    }, 400);
  }, [mode, selectedId, expanded, newPageType]);

  useEffect(() => {
    if (!editorHostRef.current) return undefined;

    if (!selectedId || selectedType !== PAGE_TYPE_CANVAS) {
      if (themeObserverRef.current) themeObserverRef.current.disconnect();
      if (editorRef.current) {
        try {
          editorRef.current.destroy();
        } catch {}
        editorRef.current = null;
      }
      editorHostRef.current.innerHTML = '';
      return undefined;
    }

    editorHostRef.current.innerHTML = '';

    const getDark = () => document.body.getAttribute('data-theme') === 'dark';
    const editor = new OneNoteEditor(editorHostRef.current, { dark: getDark(), showHint: true });
    editorRef.current = editor;

    let disposed = false;
    let saveTimer = null;

    void (async () => {
      try {
        const savedState = await ipcRenderer.invoke('notes:get-page-state', selectedId);
        if (disposed) return;
        if (savedState && Array.isArray(savedState.blocks)) editor.loadState(savedState);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => tryApplyPendingSearchHighlightRef.current());
        });
      } catch {}
    })();

    const doSave = () => {
      if (disposed) return;
      try {
        const state = editor.getState();
        void ipcRenderer.invoke('notes:save-page-state', { id: selectedId, state });
      } catch {}
    };

    const scheduleSave = () => {
      if (disposed) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        doSave();
      }, 250);
    };

    editor.on('content:changed', scheduleSave).on('block:created', doSave).on('block:deleted', doSave).on('block:moved', doSave);

    if (themeObserverRef.current) themeObserverRef.current.disconnect();
    const observer = new MutationObserver(() => {
      try {
        editor.setDark(getDark());
      } catch {}
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    themeObserverRef.current = observer;

    return () => {
      if (themeObserverRef.current) themeObserverRef.current.disconnect();
      disposed = true;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      try {
        editor.off('content:changed', scheduleSave);
        editor.off('block:created', doSave);
        editor.off('block:deleted', doSave);
        editor.off('block:moved', doSave);
      } catch {}
      try {
        editor.destroy();
      } catch {}
      editorRef.current = null;
    };
  }, [selectedId, selectedType]);

  useEffect(() => {
    if (selectedType !== PAGE_TYPE_TEXT || !selectedId) return undefined;
    const timer = setTimeout(() => tryApplyPendingSearchHighlightRef.current(), 120);
    return () => clearTimeout(timer);
  }, [selectedId, selectedType, textValue]);

  useEffect(() => {
    if (selectedType !== PAGE_TYPE_MARKDOWN || !selectedId) return undefined;
    const timer = setTimeout(() => tryApplyPendingSearchHighlightRef.current(), 350);
    return () => clearTimeout(timer);
  }, [selectedId, selectedType, markdownHydrationKey]);

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const savePageStateIfSelected = async (id) => {
    if (!id) return;
    if (id !== selectedId) return;
    try {
      if (selectedType === PAGE_TYPE_CANVAS) {
        if (!editorRef.current) return;
        const state = editorRef.current.getState();
        await ipcRenderer.invoke('notes:save-page-state', { id, state });
        return;
      }
      if (selectedType === PAGE_TYPE_TEXT) {
        await ipcRenderer.invoke('notes:save-page-state', { id, state: { text: textValue } });
        return;
      }
      if (selectedType === PAGE_TYPE_MARKDOWN) {
        const blocks = Array.isArray(blockNoteBlocksRef.current) ? blockNoteBlocksRef.current : [];
        await ipcRenderer.invoke('notes:save-page-state', { id, state: { blocknote: blocks } });
      }
    } catch {}
  };

  const saveSelectedPageState = () => savePageStateIfSelected(selectedId);

  useEffect(() => {
    if (!selectedId) return undefined;
    if (selectedType === PAGE_TYPE_CANVAS) return undefined;

    let cancelled = false;
    skipNonCanvasAutosaveRef.current = true;

    void (async () => {
      try {
        const state = await ipcRenderer.invoke('notes:get-page-state', selectedId);
        if (cancelled) return;
        const text = typeof state?.text === 'string' ? state.text : '';
        if (selectedType === PAGE_TYPE_TEXT) {
          setTextValue(text);
        }
        if (selectedType === PAGE_TYPE_MARKDOWN) {
          const pageTitle =
            String(findNodeById(treeRef.current, selectedId)?.title || '').trim() || 'Untitled';
          const rawBlocks = isValidBlockNoteBlocks(state?.blocknote) ? state.blocknote : null;
          const legacyText = typeof text === 'string' ? text : '';

          let nextBlocks = rawBlocks;
          let nextLegacy = legacyText;

          if (rawBlocks) {
            nextBlocks = ensureMarkdownLeadingTitle(rawBlocks, pageTitle);
          } else if (!legacyText.trim()) {
            nextBlocks = ensureMarkdownLeadingTitle(null, pageTitle);
            nextLegacy = '';
          }

          setMarkdownInitialBlocks(nextBlocks);
          setMarkdownLegacyText(nextLegacy);
          blockNoteBlocksRef.current = Array.isArray(nextBlocks) ? nextBlocks : [];
          setMarkdownHydrationKey((k) => k + 1);
          markdownSuppressSaveUntilRef.current = Date.now() + 750;
        }
      } catch {
        if (cancelled) return;
        if (selectedType === PAGE_TYPE_TEXT) setTextValue('');
        if (selectedType === PAGE_TYPE_MARKDOWN) {
          const pageTitle =
            String(findNodeById(treeRef.current, selectedId)?.title || '').trim() || 'Untitled';
          const fallback = ensureMarkdownLeadingTitle(null, pageTitle);
          setMarkdownInitialBlocks(fallback);
          setMarkdownLegacyText('');
          blockNoteBlocksRef.current = fallback;
          setMarkdownHydrationKey((k) => k + 1);
          markdownSuppressSaveUntilRef.current = Date.now() + 750;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedType]);

  /** Keep the first H1 in sync with the sidebar title (rename, navigation). */
  useEffect(() => {
    if (selectedType !== PAGE_TYPE_MARKDOWN || !selectedId) return undefined;
    const frame = requestAnimationFrame(() => {
      const ed = blockNoteEditorRef.current;
      if (!ed) return;
      const first = Array.isArray(ed.document) ? ed.document[0] : null;
      const cursorBlock = ed.getTextCursorPosition?.()?.block;
      const isEditingTitle = first && cursorBlock && cursorBlock.id === first.id;
      if (isEditingTitle) return;
      markdownSuppressSaveUntilRef.current = Date.now() + 400;
      syncMarkdownTitleHeadingEditor(ed, markdownPageTitle);
    });
    return () => cancelAnimationFrame(frame);
  }, [markdownPageTitle, selectedType, selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    if (selectedType !== PAGE_TYPE_TEXT) return undefined;
    if (skipNonCanvasAutosaveRef.current) {
      skipNonCanvasAutosaveRef.current = false;
      return undefined;
    }

    const timer = setTimeout(() => {
      try {
        ipcRenderer.invoke('notes:save-page-state', { id: selectedId, state: { text: textValue } });
      } catch {}
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedId, selectedType, textValue]);

  useEffect(() => {
    return () => {
      if (blockNoteSaveTimerRef.current) {
        clearTimeout(blockNoteSaveTimerRef.current);
        blockNoteSaveTimerRef.current = null;
      }
    };
  }, [selectedId, selectedType]);

  const refreshTree = async () => {
    try {
      const nextTree = await ipcRenderer.invoke('notes:list-tree');
      setTree(Array.isArray(nextTree) ? nextTree : []);
      return nextTree;
    } catch {
      setTree([]);
      return [];
    }
  };

  const openSearchResult = (result) => {
    if (!result?.id) return;
    const query = searchQuery.trim();
    if (query) {
      pendingSearchHighlightRef.current = { pageId: result.id, query };
    }
    const nextMode = result.archived ? 'archive' : 'notes';
    setMode(nextMode);
    const isSamePage = result.id === selectedId;
    if (!isSamePage) {
      setSelectedId(result.id);
    }
    void refreshTree().then(() => {
      const currentTree = treeRef.current;
      const roots = nextMode === 'archive'
        ? getArchivedChildren(currentTree)
        : currentTree.filter((n) => n.id !== ARCHIVE_ROOT_ID);
      const path = getPathIds(roots, result.id) || [];
      if (path.length) {
        setExpanded((prev) => new Set([...prev, ...path]));
      }
      setTimeout(() => tryApplyPendingSearchHighlightRef.current(), isSamePage ? 50 : 400);
    });
  };

  const getVisiblePageIdsInOrder = useCallback(
    () => {
      const roots = mode === 'notes' ? tree.filter((n) => n.id !== ARCHIVE_ROOT_ID) : getArchivedChildren(tree);
      const out = [];
      const walk = (nodes) => {
        (nodes || []).forEach((n) => {
          if (!n?.id) return;
          out.push(n.id);
          if (Array.isArray(n.children) && n.children.length && expanded.has(n.id)) {
            walk(n.children);
          }
        });
      };
      walk(roots);
      return out;
    },
    [tree, mode, expanded]
  );

  const selectPage = (id, event) => {
    if (!id) return;
    setRenamingId(null);
    const isMulti = Boolean(event && (event.ctrlKey || event.metaKey));
    const isRange = Boolean(event && event.shiftKey);

    if (isRange) {
      const anchor = selectionAnchorIdRef.current || selectedId || id;
      const ordered = getVisiblePageIdsInOrder();
      const a = ordered.indexOf(anchor);
      const b = ordered.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [from, to] = a < b ? [a, b] : [b, a];
        const rangeIds = ordered.slice(from, to + 1);
        const next = new Set(isMulti ? Array.from(selectedIds) : []);
        rangeIds.forEach((x) => next.add(x));
        setSelectedIds(next);
        setSelectedId(id);
        return;
      }
      // Fallback: if we can't compute range, behave like single select.
    }

    if (isMulti) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (!next.size) next.add(id);
        return next;
      });
      setSelectedId(id);
      selectionAnchorIdRef.current = id;
      return;
    }

    setSelectedIds(new Set([id]));
    selectionAnchorIdRef.current = id;
    if (id === selectedId) return;
    void (async () => {
      await saveSelectedPageState();
      setSelectedId(id);
    })();
  };

  const closeNewPageMenu = () => setNewPageMenu({ open: false, x: 0, y: 0, parentId: null });

  const openNewPageMenu = (event, parentId = null) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = newButtonRef.current?.getBoundingClientRect?.();
    const x = rect ? rect.left : event.clientX;
    const y = rect ? rect.bottom + 6 : event.clientY;
    setNewPageMenu({ open: true, x, y, parentId: parentId || null });
  };

  const createPage = (parentId, typeOverride) => {
    const type = normalizePageType(typeOverride || newPageType);
    void (async () => {
      await saveSelectedPageState();
      if (parentId) setExpanded((prev) => new Set([...prev, parentId]));
      const result = await ipcRenderer.invoke('notes:create-page', { parentId: parentId || null, title: 'New page', type });
      await refreshTree();
      if (result?.id) setSelectedId(result.id);
    })();
  };

  const addRootPage = () => createPage(null, null);
  const addChildPage = (parentId) => createPage(parentId, null);

  const startInlineRename = (id) => {
    if (!id) return;
    const node = findNodeById(tree, id);
    if (!node) return;
    setRenamingId(id);
    setRenameValue(node.title || '');
  };

  const commitInlineRename = () => {
    const id = renamingId;
    if (!id) return;
    const nextTitle = (renameValue || '').trim();
    setRenamingId(null);
    void (async () => {
      let title = nextTitle;
      if (!title) {
        try {
          const state = await ipcRenderer.invoke('notes:get-page-state', id);
          const derive = (s) => {
            if (!s) return '';
            if (typeof s.text === 'string') return s.text;
            if (Array.isArray(s.blocks)) {
              return s.blocks.map((b) => (typeof b?.content === 'string' ? b.content : '')).join('\n');
            }
            if (Array.isArray(s.blocknote)) {
              // Best-effort: stringify minimal text-ish parts.
              return JSON.stringify(s.blocknote);
            }
            return '';
          };
          const raw = derive(state);
          const visible = String(raw || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          title = visible.slice(0, 40).trim();
        } catch {}
      }

      if (!title) title = 'Untitled';

      await ipcRenderer.invoke('notes:rename-page', { id, title });
      await refreshTree();
    })();
  };

  const cancelInlineRename = () => {
    setRenamingId(null);
  };

  const closeContextMenu = () => setContextMenu({ open: false, x: 0, y: 0, targetId: null });

  const openContextMenu = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    selectPage(id, event);
    setContextMenu({ open: true, x: event.clientX, y: event.clientY, targetId: id });
  };

  const deletePage = (id) => {
    if (id === ARCHIVE_ROOT_ID) return;
    const node = findNodeById(tree, id);
    if (!node) return;

    void (async () => {
      const subtreeIds = collectSubtreeIds(node, []);
      if (subtreeIds.includes(selectedId)) await saveSelectedPageState();
      await ipcRenderer.invoke('notes:delete-page', id);
      const nextTree = await refreshTree();
      setExpanded((prev) => {
        const next = new Set(prev);
        subtreeIds.forEach((subId) => next.delete(subId));
        return next;
      });

      if (subtreeIds.includes(selectedId)) {
        const remainingIds = flattenIds(nextTree).filter((x) => x !== ARCHIVE_ROOT_ID);
        setSelectedId(remainingIds[0] || null);
      }
    })();
  };

  const archivePage = (id) => {
    if (id === ARCHIVE_ROOT_ID) return;
    void (async () => {
      await saveSelectedPageState();
      await ipcRenderer.invoke('notes:move-page', { id, targetParentId: ARCHIVE_ROOT_ID });
      await refreshTree();
      setExpanded((prev) => new Set([...prev, ARCHIVE_ROOT_ID]));
      setSelectedId(id);
    })();
  };

  const requestArchive = (id) => {
    if (!id) return;
    setArchiveConfirm({ open: true, targetId: id });
  };

  const confirmArchive = () => {
    const id = archiveConfirm.targetId;
    setArchiveConfirm({ open: false, targetId: null });
    if (!id) return;
    archivePage(id);
  };

  const cancelArchive = () => {
    setArchiveConfirm({ open: false, targetId: null });
  };

  const requestDeletePermanently = (id) => {
    if (!id) return;
    if (id === ARCHIVE_ROOT_ID) return;
    void (async () => {
      try {
        const state = await ipcRenderer.invoke('notes:get-page-state', id);
        const hasContent = (() => {
          if (!state) return false;
          if (Array.isArray(state.blocks)) {
            return state.blocks.some((b) => String(b?.content || '').replace(/<[^>]+>/g, '').trim());
          }
          if (Array.isArray(state.blocknote)) {
            return state.blocknote.length > 0;
          }
          if (typeof state.text === 'string') {
            return state.text.trim().length > 0;
          }
          return false;
        })();

        if (!hasContent) {
          deletePage(id);
          return;
        }
      } catch {}
      setDeleteConfirm({ open: true, targetId: id });
    })();
  };

  const confirmDeletePermanently = () => {
    const id = deleteConfirm.targetId;
    setDeleteConfirm({ open: false, targetId: null });
    if (!id) return;
    deletePage(id);
  };

  const cancelDeletePermanently = () => {
    setDeleteConfirm({ open: false, targetId: null });
  };

  const restorePage = (id) => {
    if (!id) return;
    if (id === ARCHIVE_ROOT_ID) return;
    void (async () => {
      await saveSelectedPageState();
      await ipcRenderer.invoke('notes:move-page', { id, targetParentId: null });
      await refreshTree();
      setSelectedId(id);
    })();
  };

  const cutPage = (id) => {
    if (id === ARCHIVE_ROOT_ID) return;
    const node = findNodeById(tree, id);
    void (async () => {
      const subtreeIds = collectSubtreeIds(node, []);
      if (subtreeIds.includes(selectedId)) await saveSelectedPageState();
      await ipcRenderer.invoke('notes:cut-page', id);
      const nextTree = await refreshTree();
      if (subtreeIds.includes(selectedId)) {
        const remainingIds = flattenIds(nextTree).filter((x) => x !== ARCHIVE_ROOT_ID);
        setSelectedId(remainingIds[0] || null);
      }
      setClipboard({ mode: 'cut' });
    })();
  };

  const copyPage = (id) => {
    if (!id) return;
    setClipboard({ mode: 'copy', sourceId: id });
  };

  const pasteInto = (targetId) => {
    if (!clipboard) return;
    const targetNode = findNodeById(tree, targetId);
    if (!targetNode) return;

    if (clipboard.mode === 'copy') {
      void (async () => {
        await saveSelectedPageState();
        const result = await ipcRenderer.invoke('notes:copy-page', { id: clipboard.sourceId, targetParentId: targetId });
        await refreshTree();
        setExpanded((prev) => new Set([...prev, targetId]));
        if (result?.id) setSelectedId(result.id);
      })();
      return;
    }

    void (async () => {
      await saveSelectedPageState();
      const result = await ipcRenderer.invoke('notes:paste-cut', { targetParentId: targetId });
      await refreshTree();
      setExpanded((prev) => new Set([...prev, targetId]));
      if (result?.id) setSelectedId(result.id);
      setClipboard(null);
    })();
  };

  const menuLeft = contextMenu.open ? Math.min(contextMenu.x, window.innerWidth - 220) : 0;
  const menuTop = contextMenu.open ? Math.min(contextMenu.y, window.innerHeight - 260) : 0;
  const canPaste = Boolean(clipboard);

  const movePageAsync = async (sourceId, targetId, opts = {}) => {
    if (!sourceId) return;
    if (sourceId === targetId) return;
    if (sourceId === ARCHIVE_ROOT_ID) return;

    const sourceNode = findNodeById(tree, sourceId);
    if (!sourceNode) return;
    if (targetId && containsIdInSubtree(sourceNode, targetId)) return;
    if (mode === 'archive' && targetId === null) return;

    await saveSelectedPageState();
    await ipcRenderer.invoke('notes:move-page', { id: sourceId, targetParentId: targetId, ...opts });
    await refreshTree();
    if (targetId) setExpanded((prev) => new Set([...prev, targetId]));
  };

  const movePage = (sourceId, targetId, opts = {}) => {
    void movePageAsync(sourceId, targetId, opts);
  };

  const handleDragStart = (event, id) => {
    event.stopPropagation();
    try {
      const ids = selectedIds?.has?.(id) ? Array.from(selectedIds) : [id];
      event.dataTransfer.setData('application/x-deskmaster-page-ids', JSON.stringify(ids));
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'move';
    } catch {}
  };

  const handleDragOver = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget?.getBoundingClientRect?.();
    let position = 'inside';
    if (rect) {
      const y = event.clientY - rect.top;
      const ratio = rect.height ? y / rect.height : 0.5;
      if (ratio < 0.25) position = 'before';
      else if (ratio > 0.75) position = 'after';
      else position = 'inside';
    }
    setDragOver({ id, position });
    try {
      event.dataTransfer.dropEffect = 'move';
    } catch {}
  };

  const handleDragLeave = (event, id) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    const cur = event.currentTarget;
    const rel = event.relatedTarget;
    // If we're still within the row (e.g. moving between icon/text inside), don't clear.
    if (cur && rel && cur.contains(rel)) return;
    setDragOver((prev) => (prev.id === id ? { id: null, position: null } : prev));
  };

  const handleDrop = (event, targetId) => {
    event.preventDefault();
    event.stopPropagation();
    // Recompute drop position from actual drop cursor location,
    // so behavior always matches the visual suggestion line.
    const rect = event.currentTarget?.getBoundingClientRect?.();
    let position = 'inside';
    if (rect) {
      const y = event.clientY - rect.top;
      const ratio = rect.height ? y / rect.height : 0.5;
      if (ratio < 0.25) position = 'before';
      else if (ratio > 0.75) position = 'after';
      else position = 'inside';
    } else if (dragOver.id === targetId && dragOver.position) {
      position = dragOver.position;
    }
    setDragOver({ id: null, position: null });
    let ids = [];
    try {
      const raw = event.dataTransfer.getData('application/x-deskmaster-page-ids');
      if (raw) ids = JSON.parse(raw);
    } catch {}
    if (!Array.isArray(ids) || !ids.length) {
      const sourceId = event.dataTransfer.getData('text/plain');
      if (sourceId) ids = [sourceId];
    }
    ids = ids.filter((x) => x && x !== ARCHIVE_ROOT_ID);
    if (!ids.length) return;

    // If any selected id is the target itself, ignore it for the move.
    ids = ids.filter((x) => x !== targetId);
    if (!ids.length) return;

    if (position === 'inside') {
      void (async () => {
        for (const id of ids) {
          await movePageAsync(id, targetId);
        }
      })();
      return;
    }

    const parentId = findParentId(tree, targetId);
    const destParent = parentId === undefined ? null : parentId; // undefined => not found (treat as root)
    if (position === 'before') {
      // Preserve ordering by moving in reverse before the same pivot.
      void (async () => {
        for (const id of [...ids].reverse()) {
          await movePageAsync(id, destParent, { beforeId: targetId });
        }
      })();
    } else {
      // Preserve ordering by chaining after the last inserted.
      void (async () => {
        let pivot = targetId;
        for (const id of ids) {
          await movePageAsync(id, destParent, { afterId: pivot });
          pivot = id;
        }
      })();
    }
  };

  const visibleTree = useMemo(() => {
    if (mode === 'notes') return tree.filter((n) => n.id !== ARCHIVE_ROOT_ID);
    return getArchivedChildren(tree);
  }, [tree, mode]);

  const trimmedSearch = searchQuery.trim();
  const hasSearch = Boolean(trimmedSearch);

  const archiveTargetTitle = useMemo(() => {
    const id = archiveConfirm.targetId;
    if (!id) return '';
    const node = findNodeById(tree, id);
    return node?.title || '';
  }, [archiveConfirm.targetId, tree]);

  const deleteTargetTitle = useMemo(() => {
    const id = deleteConfirm.targetId;
    if (!id) return '';
    const node = findNodeById(tree, id);
    return node?.title || '';
  }, [deleteConfirm.targetId, tree]);

  const newPageTypeLabel = useMemo(() => {
    if (newPageType === PAGE_TYPE_MARKDOWN) return 'Markdown';
    if (newPageType === PAGE_TYPE_TEXT) return 'Plain Text';
    return 'OneNote';
  }, [newPageType]);

  const newMenuLeft = newPageMenu.open ? Math.min(newPageMenu.x, window.innerWidth - 220) : 0;
  const newMenuTop = newPageMenu.open ? Math.min(newPageMenu.y, window.innerHeight - 180) : 0;
  const isDark = document.body.getAttribute('data-theme') === 'dark';

  if (isLoading) {
    return <div className="h-full flex items-center justify-center bg-theme-primary text-theme-muted">Loading…</div>;
  }

  if (loadError) {
    return <div className="h-full flex items-center justify-center bg-theme-primary text-theme-muted">{loadError}</div>;
  }

  return (
    <div className="h-full flex bg-theme-primary">
      <div className="w-80 flex-shrink-0 border-r border-theme bg-theme-secondary h-full overflow-hidden flex flex-col">
        <div className="h-[44px] px-3 flex items-center justify-between border-b border-theme">
          <div className="flex items-center gap-2 text-theme-primary font-semibold">
            {mode === 'notes' ? <MdNotes className="w-5 h-5" /> : <MdArchive className="w-5 h-5" />}
            {mode === 'notes' ? 'Notes' : 'Archive'}
          </div>
          {mode === 'notes' && (
            <div ref={newButtonRef} className="inline-flex overflow-hidden rounded-md border border-theme bg-theme-card">
              <button
                className="px-2 py-1 hover:bg-theme-card-hover text-theme-primary text-sm inline-flex items-center gap-1"
                onClick={(e) => openNewPageMenu(e, null)}
              >
                New: {newPageTypeLabel}
                <MdExpandMore className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-b border-theme">
          <div className="relative">
            <MdSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-md border border-theme bg-theme-card py-1.5 pl-8 pr-8 text-sm text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary"
                onClick={() => {
                  pendingSearchHighlightRef.current = null;
                  setSearchQuery('');
                }}
                title="Clear search"
              >
                <MdClose className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {hasSearch ? (
            <div className="mt-1 px-1 text-[11px] text-theme-muted">
              {isSearching ? 'Searching…' : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`}
            </div>
          ) : null}
        </div>

        <div
          className="p-2 overflow-auto flex-1"
          onDragOver={hasSearch ? undefined : (e) => {
            e.preventDefault();
            setDragOver({ id: null, position: null });
          }}
          onDrop={hasSearch ? undefined : (e) => {
            e.preventDefault();
            setDragOver({ id: null, position: null });
            const sourceId = e.dataTransfer.getData('text/plain');
            if (!sourceId) return;
            void (async () => {
              let ids = [];
              try {
                const raw = e.dataTransfer.getData('application/x-deskmaster-page-ids');
                if (raw) ids = JSON.parse(raw);
              } catch {}
              if (!Array.isArray(ids) || !ids.length) ids = [sourceId];
              ids = ids.filter((x) => x && x !== ARCHIVE_ROOT_ID);
              for (const id of ids) await movePageAsync(id, null);
            })();
          }}
        >
          {hasSearch ? (
            <div className="space-y-1">
              {!isSearching && searchResults.length === 0 ? (
                <div className="px-2 py-4 text-sm text-theme-muted">No pages match your search.</div>
              ) : null}
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className={`w-full rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:border-theme hover:bg-theme-card-hover ${
                    selectedId === result.id ? 'border-theme bg-theme-card-hover' : ''
                  }`}
                  onClick={() => openSearchResult(result)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-theme-primary">
                      {result.title || 'Untitled'}
                      {result.archived ? (
                        <span className="ml-1.5 text-[11px] font-normal text-theme-muted">(Archived)</span>
                      ) : null}
                    </div>
                    {result.snippet ? (
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-theme-muted">{result.snippet}</div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            visibleTree.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={selectPage}
              onToggle={toggleExpanded}
              onAddChild={addChildPage}
              onStartRename={startInlineRename}
              onRequestArchive={requestArchive}
              onRequestRestore={restorePage}
              onContextMenu={openContextMenu}
              renamingId={renamingId}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              onCommitRename={commitInlineRename}
              onCancelRename={cancelInlineRename}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              dragOverId={dragOver.id}
              dragOverPosition={dragOver.position}
              mode={mode}
            />
          )))}
        </div>

        <div className="h-12 border-t border-theme px-2 flex items-center justify-between">
          <button
            className={`flex items-center gap-2 px-3 py-2 rounded-md border border-theme ${
              mode === 'notes' ? 'bg-theme-card text-theme-primary' : 'bg-transparent text-theme-muted hover:bg-theme-card-hover'
            }`}
            onClick={() => setMode('notes')}
            title="Notes"
          >
            <MdNotes className="w-5 h-5" />
            <span className="text-sm font-medium">Notes</span>
          </button>
          <button
            className={`flex items-center gap-2 px-3 py-2 rounded-md border border-theme ${
              mode === 'archive' ? 'bg-theme-card text-theme-primary' : 'bg-transparent text-theme-muted hover:bg-theme-card-hover'
            }`}
            onClick={() => setMode('archive')}
            title="Archive"
          >
            <MdArchive className="w-5 h-5" />
            <span className="text-sm font-medium">Archive</span>
          </button>
        </div>
      </div>

      <div className="flex-1 h-full overflow-hidden">
        <div className="h-full bg-theme-primary">
          {!selectedId && (
            <div className="h-full flex items-center justify-center text-theme-muted">Select a page</div>
          )}

          {selectedId && selectedType === PAGE_TYPE_CANVAS && <div ref={editorHostRef} className="w-full h-full" />}

          {selectedId && selectedType === PAGE_TYPE_TEXT && (
            <div className="h-full w-full overflow-hidden relative">
              <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded-md border border-theme bg-theme-card hover:bg-theme-card-hover text-theme-primary text-xs"
                  onClick={() => {
                    const sel = getMonacoSelectedText().trim();
                    if (!sel) return;
                    setTextAi((p) => ({ ...p, open: true, selection: sel }));
                  }}
                  title="Edit selection with AI"
                >
                  AI
                </button>
              </div>

              {textAi.open ? (
                <div className="absolute top-10 right-2 z-30 w-[420px] max-h-[60vh] overflow-hidden rounded-lg border border-theme bg-theme-secondary shadow-xl flex flex-col">
                  <div className="px-3 py-2 border-b border-theme flex items-center justify-between">
                    <div className="text-theme-primary text-sm font-medium">AI</div>
                    <button
                      className="text-theme-muted hover:text-theme-primary text-sm"
                      onClick={() => setTextAi((p) => ({ ...p, open: false, prompt: '' }))}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-3 flex flex-col gap-2 overflow-auto">
                    <div className="flex gap-2 flex-wrap">
                      <button className="px-2 py-1 rounded border border-theme text-xs hover:bg-theme-card-hover" disabled={textAi.busy} onClick={() => void runTextAi('improve')}>
                        Improve
                      </button>
                      <button className="px-2 py-1 rounded border border-theme text-xs hover:bg-theme-card-hover" disabled={textAi.busy} onClick={() => void runTextAi('fix-grammar')}>
                        Fix
                      </button>
                      <button className="px-2 py-1 rounded border border-theme text-xs hover:bg-theme-card-hover" disabled={textAi.busy} onClick={() => void runTextAi('simplify')}>
                        Simplify
                      </button>
                    </div>

                    {Array.isArray(textAi.history) && textAi.history.length ? (
                      <div className="space-y-2">
                        {textAi.history.slice(-3).map((h, idx) => (
                          // eslint-disable-next-line react/no-array-index-key
                          <div key={idx} className="rounded border border-theme bg-theme-card p-2">
                            <div className="text-[11px] text-theme-muted mb-1">Q: {h.q}</div>
                            <div className="text-xs text-theme-primary whitespace-pre-wrap">{h.a}</div>
                            <div className="mt-2 flex gap-2">
                              <button
                                className="px-2 py-1 rounded border border-theme text-xs hover:bg-theme-card-hover"
                                onClick={() => applyMonacoReplaceSelection(h.a)}
                                disabled={textAi.busy}
                              >
                                Apply to selection
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-theme-muted">Select text in the editor, then choose an AI action.</div>
                    )}

                    <div className="pt-2 border-t border-theme">
                      <div className="text-[11px] text-theme-muted mb-1">Follow-up</div>
                      <div className="flex gap-2">
                        <input
                          value={textAi.prompt}
                          disabled={textAi.busy}
                          onChange={(e) => setTextAi((p) => ({ ...p, prompt: e.target.value }))}
                          className="flex-1 px-2 py-1 rounded border border-theme bg-theme-primary text-theme-primary text-xs outline-none"
                          placeholder="Ask a follow-up..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void runTextAiFollowup();
                            }
                          }}
                        />
                        <button className="px-2 py-1 rounded border border-theme text-xs hover:bg-theme-card-hover" disabled={textAi.busy} onClick={() => void runTextAiFollowup()}>
                          Send
                        </button>
                      </div>
                      {textAi.busy ? <div className="mt-2 text-[11px] text-theme-muted">AI is working…</div> : null}
                    </div>
                  </div>
                </div>
              ) : null}
              <MonacoEditor
                value={textValue}
                language="plaintext"
                theme={isDark ? 'vs-dark' : 'vs'}
                options={{
                  minimap: { enabled: false },
                  fontFamily: 'SF Mono, Monaco, monospace',
                  fontSize: 13,
                  lineHeight: 20,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true
                }}
                onMount={(editor) => {
                  textEditorRef.current = editor;
                  setTimeout(() => tryApplyPendingSearchHighlightRef.current(), 120);
                }}
                onChange={(value) => setTextValue(typeof value === 'string' ? value : '')}
              />
            </div>
          )}

          {selectedId && selectedType === PAGE_TYPE_MARKDOWN && (
            <div className="notes-markdown-root h-full w-full min-h-0 overflow-hidden bg-theme-primary flex flex-col">
              <BlockNoteMarkdownEditor
                key={`${selectedId}-${markdownHydrationKey}`}
                initialBlocks={markdownInitialBlocks}
                legacyMarkdown={markdownLegacyText}
                pageTitle={markdownPageTitle}
                dark={isDark}
                onEditorReady={(ed) => {
                  blockNoteEditorRef.current = ed;
                  setTimeout(() => tryApplyPendingSearchHighlightRef.current(), 200);
                }}
                onBlocksChange={(blocks) => {
                  if (!selectedId) return;
                  if (Date.now() < markdownSuppressSaveUntilRef.current) return;
                  blockNoteBlocksRef.current = Array.isArray(blocks) ? blocks : [];
                  if (blockNoteSaveTimerRef.current) clearTimeout(blockNoteSaveTimerRef.current);
                  const id = selectedId;
                  const snapshot = blockNoteBlocksRef.current;
                  blockNoteSaveTimerRef.current = setTimeout(() => {
                    try {
                      ipcRenderer.invoke('notes:save-page-state', { id, state: { blocknote: snapshot } });
                    } catch {}
                  }, 350);

                  if (markdownTitleRenameTimerRef.current) clearTimeout(markdownTitleRenameTimerRef.current);
                  markdownTitleRenameTimerRef.current = setTimeout(() => {
                    markdownTitleRenameTimerRef.current = null;
                    const pageId = selectedIdRef.current;
                    if (!pageId || pageId !== id) return;
                    const h1Title = getFirstH1PlainTitle(blockNoteBlocksRef.current);
                    if (!h1Title) return;
                    const sidebarTitle = String(findNodeById(treeRef.current, pageId)?.title || '').trim() || 'Untitled';
                    if (h1Title === sidebarTitle) return;
                    markdownSuppressSaveUntilRef.current = Date.now() + 500;
                    void (async () => {
                      try {
                        await ipcRenderer.invoke('notes:rename-page', { id: pageId, title: h1Title });
                        await refreshTree();
                      } catch {}
                    })();
                  }, 450);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {newPageMenu.open && (
        <div className="fixed inset-0 z-50" onMouseDown={closeNewPageMenu}>
          <div
            className="absolute w-52 rounded-md border border-theme bg-theme-secondary shadow-lg overflow-hidden"
            style={{ left: newMenuLeft, top: newMenuTop }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className={`w-full text-left px-3 py-2 text-sm hover:bg-theme-card-hover ${
                newPageType === PAGE_TYPE_CANVAS ? 'text-theme-primary' : 'text-theme-secondary'
              }`}
              onClick={() => {
                setNewPageType(PAGE_TYPE_CANVAS);
                closeNewPageMenu();
                createPage(newPageMenu.parentId, PAGE_TYPE_CANVAS);
              }}
            >
              OneNote
            </button>
            <button
              className={`w-full text-left px-3 py-2 text-sm hover:bg-theme-card-hover ${
                newPageType === PAGE_TYPE_MARKDOWN ? 'text-theme-primary' : 'text-theme-secondary'
              }`}
              onClick={() => {
                setNewPageType(PAGE_TYPE_MARKDOWN);
                closeNewPageMenu();
                createPage(newPageMenu.parentId, PAGE_TYPE_MARKDOWN);
              }}
            >
              Markdown
            </button>
            <button
              className={`w-full text-left px-3 py-2 text-sm hover:bg-theme-card-hover ${
                newPageType === PAGE_TYPE_TEXT ? 'text-theme-primary' : 'text-theme-secondary'
              }`}
              onClick={() => {
                setNewPageType(PAGE_TYPE_TEXT);
                closeNewPageMenu();
                createPage(newPageMenu.parentId, PAGE_TYPE_TEXT);
              }}
            >
              Plain Text
            </button>
          </div>
        </div>
      )}

      {contextMenu.open && (
        <div
          className="fixed inset-0 z-50"
          onMouseDown={closeContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeContextMenu();
          }}
        >
          <div
            className="absolute w-52 rounded-md border border-theme bg-theme-secondary shadow-lg overflow-hidden"
            style={{ left: menuLeft, top: menuTop }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2 text-sm text-theme-primary hover:bg-theme-card-hover"
              onClick={() => {
                closeContextMenu();
                startInlineRename(contextMenu.targetId);
              }}
            >
              Rename
            </button>
            {mode === 'notes' && (
              <button
                className="w-full text-left px-3 py-2 text-sm text-theme-primary hover:bg-theme-card-hover"
                onClick={() => {
                  closeContextMenu();
                  requestArchive(contextMenu.targetId);
                }}
              >
                Move to Archive
              </button>
            )}
            {mode === 'archive' && (
              <button
                className="w-full text-left px-3 py-2 text-sm text-theme-primary hover:bg-theme-card-hover"
                onClick={() => {
                  closeContextMenu();
                  restorePage(contextMenu.targetId);
                }}
              >
                Restore
              </button>
            )}
            <button
              className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-theme-card-hover"
              onClick={() => {
                closeContextMenu();
                requestDeletePermanently(contextMenu.targetId);
              }}
            >
              Delete Permanently
            </button>

            <div className="h-px bg-theme-card-hover" />

            <button
              className="w-full text-left px-3 py-2 text-sm text-theme-primary hover:bg-theme-card-hover"
              onClick={() => {
                closeContextMenu();
                cutPage(contextMenu.targetId);
              }}
            >
              Cut
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-theme-primary hover:bg-theme-card-hover"
              onClick={() => {
                closeContextMenu();
                copyPage(contextMenu.targetId);
              }}
            >
              Copy
            </button>
            <button
              className={`w-full text-left px-3 py-2 text-sm hover:bg-theme-card-hover ${
                canPaste ? 'text-theme-primary' : 'text-theme-muted cursor-not-allowed'
              }`}
              disabled={!canPaste}
              onClick={() => {
                closeContextMenu();
                pasteInto(contextMenu.targetId);
              }}
            >
              Paste
            </button>
          </div>
        </div>
      )}

      {archiveConfirm.open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onMouseDown={cancelArchive} />
          <div className="absolute left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-theme bg-theme-secondary shadow-xl">
            <div className="px-4 py-3 border-b border-theme text-theme-primary font-semibold">Archive page?</div>
            <div className="px-4 py-4 text-theme-secondary text-sm">
              Are you sure you want to archive <span className="text-theme-primary font-medium">{archiveTargetTitle || 'this page'}</span>?
            </div>
            <div className="px-4 py-3 border-t border-theme flex items-center justify-end gap-2">
              <button
                className="px-3 py-2 rounded-md border border-theme bg-transparent hover:bg-theme-card-hover text-theme-primary text-sm"
                onClick={cancelArchive}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-md border border-theme bg-theme-card hover:bg-theme-card-hover text-theme-primary text-sm"
                onClick={confirmArchive}
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm.open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onMouseDown={cancelDeletePermanently} />
          <div className="absolute left-1/2 top-1/2 w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-theme bg-theme-secondary shadow-xl">
            <div className="px-4 py-3 border-b border-theme text-theme-primary font-semibold">Delete permanently?</div>
            <div className="px-4 py-4 text-theme-secondary text-sm">
              This will permanently delete <span className="text-theme-primary font-medium">{deleteTargetTitle || 'this page'}</span> and all its nested pages. This cannot be undone.
            </div>
            <div className="px-4 py-3 border-t border-theme flex items-center justify-end gap-2">
              <button
                className="px-3 py-2 rounded-md border border-theme bg-transparent hover:bg-theme-card-hover text-theme-primary text-sm"
                onClick={cancelDeletePermanently}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-md border border-theme bg-theme-card hover:bg-theme-card-hover text-red-500 text-sm"
                onClick={confirmDeletePermanently}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notes;
