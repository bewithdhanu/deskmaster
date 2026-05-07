import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FormattingToolbar,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState
} from '@blocknote/react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronRight, Languages, Sparkles, SpellCheck, Type } from 'lucide-react';
import { getIpcRenderer } from '../../utils/electron';

const ipcRenderer = getIpcRenderer();

/** Replace current ProseMirror selection with plain text (uses BlockNote transaction). */
function replaceSelectionWithText(editor, newText) {
  const { from, to } = editor.prosemirrorState.selection;
  if (from === to) return false;
  editor.transact((tr) => {
    tr.insertText(newText, from, to);
  });
  return true;
}

const TRANSLATE_TARGETS = [
  { label: 'English', value: 'English' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'French', value: 'French' },
  { label: 'German', value: 'German' },
  { label: 'Japanese', value: 'Japanese' },
  { label: 'Portuguese', value: 'Portuguese' },
  { label: 'Chinese (Simplified)', value: 'Simplified Chinese' },
  { label: 'Korean', value: 'Korean' }
];

const menuItemClass =
  'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-[var(--bg-card-hover)] focus:bg-[var(--bg-card-hover)] text-[var(--text-primary)]';

const subContentClass =
  'z-[110] max-h-[min(280px,50vh)] min-w-[11rem] overflow-y-auto rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-1 text-[var(--text-primary)] shadow-lg';

function MarkdownAiToolbarButtonsInner() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyRects, setBusyRects] = useState([]);
  const [customPrompt, setCustomPrompt] = useState('');
  const promptInputRef = useRef(null);

  useEffect(() => {
    if (!busy) {
      setBusyRects([]);
      return;
    }

    const update = () => {
      try {
        const sel = editor?.prosemirrorState?.selection;
        const view = editor?.prosemirrorView;
        const from = sel?.from;
        const to = sel?.to;
        if (!view || typeof from !== 'number' || typeof to !== 'number') return;
        if (from === to) return;

        const a = Math.min(from, to);
        const b = Math.max(from, to);
        const start = view.domAtPos(a);
        const end = view.domAtPos(b);

        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);

        const rects = Array.from(range.getClientRects?.() || [])
          .map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height }))
          .filter((r) => r.width > 1 && r.height > 1);
        setBusyRects(rects);
      } catch {}
    };

    update();
    const t = setInterval(update, 120);
    return () => clearInterval(t);
  }, [busy, editor]);

  const canUseAi = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed.isEditable) return false;
      const sel = ed.getSelectedText();
      return typeof sel === 'string' && sel.trim().length > 0;
    }
  });

  useEffect(() => {
    if (!menuOpen) setCustomPrompt('');
  }, [menuOpen]);

  const runAction = useCallback(
    async (actionKey, extra = {}) => {
      const selected = editor.getSelectedText();
      if (!selected.trim()) return;
      setBusy(true);
      try {
        const result = await ipcRenderer.invoke('ai-edit-text', selected, actionKey, extra);
        if (typeof result === 'string' && result.length > 0) {
          replaceSelectionWithText(editor, result);
          setMenuOpen(false);
        }
      } catch (e) {
        const msg = e?.message || 'AI request failed';
        window.alert(msg);
      } finally {
        setBusy(false);
      }
    },
    [editor]
  );

  const runCustomPrompt = useCallback(async () => {
    const instruction = customPrompt.trim();
    if (!instruction) return;
    await runAction('custom', { instruction });
  }, [customPrompt, runAction]);

  if (!canUseAi) return null;

  return (
    <>
      <style>{`
        @keyframes dmAiShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {busy && busyRects.length
        ? busyRects.map((r, idx) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              style={{
                position: 'fixed',
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                zIndex: 2000,
                pointerEvents: 'none',
                borderRadius: 3,
                background:
                  'linear-gradient(90deg, rgba(0,120,212,0.10) 0%, rgba(0,120,212,0.30) 50%, rgba(0,120,212,0.10) 100%)',
                backgroundSize: '200% 100%',
                animation: 'dmAiShimmer 1.0s linear infinite'
              }}
              aria-hidden
            />
          ))
        : null}
      <span
        key="ai-divider"
        className="mx-1 w-px self-stretch shrink-0 bg-border opacity-70"
        aria-hidden
      />
      <DropdownMenuPrimitive.Root modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuPrimitive.Trigger asChild>
          <span className="inline-flex">
            <Components.FormattingToolbar.Button
              className="bn-button"
              label=""
              variant="compact"
              mainTooltip="Edit with AI"
              icon={<Sparkles className="h-4 w-4" aria-hidden />}
              isDisabled={busy}
            />
          </span>
        </DropdownMenuPrimitive.Trigger>

        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            className="z-[100] max-h-[min(420px,70vh)] min-w-[300px] overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] py-1 text-[var(--text-primary)] shadow-lg outline-none"
            side="bottom"
            align="end"
            sideOffset={6}
            alignOffset={0}
            collisionPadding={12}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              requestAnimationFrame(() => promptInputRef.current?.focus());
            }}
          >
            <div
              className="flex items-center gap-2 border-b border-[var(--border-color)] px-3 py-2.5"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Sparkles className="h-4 w-4 shrink-0 opacity-70 text-[var(--text-secondary)]" aria-hidden />
              <input
                ref={promptInputRef}
                type="text"
                value={customPrompt}
                disabled={busy}
                placeholder="Ask AI anything..."
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runCustomPrompt();
                  }
                }}
              />
            </div>

            <DropdownMenuPrimitive.Item
              className={menuItemClass}
              disabled={busy}
              onSelect={() => {
                void runAction('improve');
              }}
            >
              <Type className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              Improve Writing
            </DropdownMenuPrimitive.Item>

            <DropdownMenuPrimitive.Item
              className={menuItemClass}
              disabled={busy}
              onSelect={() => {
                void runAction('fix-grammar');
              }}
            >
              <SpellCheck className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              Fix Spelling
            </DropdownMenuPrimitive.Item>

            <DropdownMenuPrimitive.Sub>
              <DropdownMenuPrimitive.SubTrigger className={`${menuItemClass} data-[state=open]:bg-[var(--bg-card-hover)]`} disabled={busy}>
                <Languages className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span className="flex-1 text-left">Translate…</span>
                <ChevronRight className="ml-auto h-4 w-4 opacity-70" aria-hidden />
              </DropdownMenuPrimitive.SubTrigger>
              <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.SubContent className={subContentClass} sideOffset={4} alignOffset={-4}>
                  {TRANSLATE_TARGETS.map(({ label, value }) => (
                    <DropdownMenuPrimitive.Item
                      key={value}
                      className={menuItemClass}
                      disabled={busy}
                      onSelect={() => {
                        void runAction('translate', { targetLanguage: value });
                      }}
                    >
                      {label}
                    </DropdownMenuPrimitive.Item>
                  ))}
                </DropdownMenuPrimitive.SubContent>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Sub>

            <DropdownMenuPrimitive.Item
              className={menuItemClass}
              disabled={busy}
              onSelect={() => {
                void runAction('simplify');
              }}
            >
              <Sparkles className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              Simplify
            </DropdownMenuPrimitive.Item>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </>
  );
}

/** Full formatting toolbar: default BlockNote items plus AI (BlockNote-style panel). */
export function DeskMasterFormattingToolbar() {
  return (
    <FormattingToolbar>
      {getFormattingToolbarItems()}
      <MarkdownAiToolbarButtonsInner />
    </FormattingToolbar>
  );
}
