import { TextBlock } from './TextBlock.js';
import { SelectionManager } from './SelectionManager.js';
import { Toolbar } from './Toolbar.js';
import { HistoryManager } from './HistoryManager.js';
import { EventEmitter } from './EventEmitter.js';
import { clipboardHtmlToCanvasBlocks, clipboardPlainTextToCanvasBlocks, isDescendant, clamp } from './utils.js';

export class Canvas extends EventEmitter {
  constructor(containerEl, { dark = 'auto', showHint = true } = {}) {
    super();
    this.containerEl = containerEl;
    this.containerEl.classList.add('one-editor');
    this.containerEl.style.display = 'flex';
    this.containerEl.style.flexDirection = 'column';
    // Use the parent layout height; 100vh can clip the header toolbar in nested layouts.
    this.containerEl.style.height = '100%';
    this.containerEl.style.overflow = 'hidden';

    if (dark === 'auto') {
      this.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._onSystemThemeChange = (e) => this.setDark(e.matches);
      this._mediaQuery.addEventListener('change', this._onSystemThemeChange);
    } else {
      this.dark = !!dark;
    }

    this._blocks = new Map();
    this._selectionManager = new SelectionManager();
    this._toolbar = new Toolbar({ containerEl: this.containerEl, canvas: this, dark: this.dark });
    this._rubberBanding = false;
    this._rbOrigin = { x: 0, y: 0 };
    this._rbEl = null;
    this._groupDragging = false;
    this._clipboard = [];
    this._history = new HistoryManager({ maxHistory: 100 });
    this._contentChangeTimer = null;
    this._hintShown = false;
    this._surfaceResizeRaf = null;
    this._lastPointerPos = null;

    this._buildDOM();
    this._bindEvents();
    this._watchSelectionChange();

    this.containerEl.classList.toggle('one-editor--dark', this.dark);
    this.containerEl.style.backgroundColor = this.dark ? '#1e1e2e' : '#f5f5f0';
    if (showHint) this._showHint();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'one-canvas';
    if (this.dark) this.el.classList.add('one-canvas--dark');
    this.el.setAttribute('role', 'presentation');
    this.el.setAttribute('aria-label', 'OneNote-style canvas editor');
    // Allow the canvas to receive focus so 'paste' events fire here when user clicks the surface.
    this.el.tabIndex = 0;
    this.containerEl.appendChild(this.el);

    this._surfaceEl = document.createElement('div');
    this._surfaceEl.className = 'one-canvas__surface';
    this._surfaceEl.style.position = 'relative';
    this._surfaceEl.style.minWidth = '100%';
    this._surfaceEl.style.minHeight = '100%';
    this.el.appendChild(this._surfaceEl);
  }

  _showHint() {
    if (this._hintShown) return;
    this._hintShown = true;
    const hint = document.createElement('div');
    hint.className = 'one-canvas__hint';
    hint.textContent = '✦ Double-click to type · Drag to select multiple';
    this._surfaceEl.appendChild(hint);
    setTimeout(() => hint.classList.add('one-canvas__hint--fade'), 3500);
    setTimeout(() => hint.remove(), 4200);
  }

  _getRelativePosition(event) {
    // Use the surface rect directly. Since the surface scrolls with the container,
    // its boundingClientRect already reflects scroll offset (so we must NOT add scrollTop).
    const rect = this._surfaceEl.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  _scheduleSurfaceResize() {
    if (this._surfaceResizeRaf) return;
    this._surfaceResizeRaf = requestAnimationFrame(() => {
      this._surfaceResizeRaf = null;
      this._updateSurfaceSize();
    });
  }

  _updateSurfaceSize() {
    const padding = 160;
    const minW = this.el.clientWidth || 0;
    const minH = this.el.clientHeight || 0;
    let maxRight = 0;
    let maxBottom = 0;
    this._blocks.forEach((b) => {
      const w = b.el.offsetWidth || 0;
      const h = b.el.offsetHeight || 0;
      maxRight = Math.max(maxRight, b.x + w);
      maxBottom = Math.max(maxBottom, b.y + h);
    });
    this._surfaceEl.style.width = `${Math.max(minW, maxRight + padding)}px`;
    this._surfaceEl.style.height = `${Math.max(minH, maxBottom + padding)}px`;
  }

  _bindEvents() {
    // Track last pointer position to anchor paste near where the user is working.
    this.el.addEventListener('mousemove', (e) => {
      if (e.target !== this._surfaceEl) return;
      this._lastPointerPos = this._getRelativePosition(e);
    });

    this.el.addEventListener('dblclick', (e) => {
      if (e.target !== this._surfaceEl) return;
      this.el.focus();
      this._historyPush();
      const pos = this._getRelativePosition(e);
      const block = this.addBlock({ x: pos.x - 100, y: pos.y - 16 });
      requestAnimationFrame(() => block.focus());
    });

    this.el.addEventListener('mousedown', (e) => {
      if (e.target !== this._surfaceEl) return;
      this.el.focus();
      this._selectionManager.clear();
      this._toolbar.syncState();
      if (e.button !== 0) return;
      this._startRubberBand(e);
    });

    this.el.addEventListener('paste', (e) => {
      // Only handle system-clipboard paste when user is pasting onto the empty surface (not inside a text block).
      const isEditing = document.activeElement?.classList.contains('one-block__content');
      if (isEditing) return;
      if (e.target !== this.el && e.target !== this._surfaceEl) return;

      const cd = e.clipboardData;
      if (!cd) return;

      const anchor = this._lastPointerPos || { x: this.el.scrollLeft + 80, y: this.el.scrollTop + 80 };
      const maxWidth = Math.max(240, Math.min(720, (this.el.clientWidth || 720) - 160));

      const html = cd.getData('text/html');
      const text = cd.getData('text/plain');
      const parsed = html
        ? clipboardHtmlToCanvasBlocks(html, { anchorX: anchor.x, anchorY: anchor.y, maxWidth })
        : { blocks: clipboardPlainTextToCanvasBlocks(text, { anchorX: anchor.x, anchorY: anchor.y, maxWidth }), usedAbsolute: false };

      const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
      const usedAbsolute = Boolean(parsed?.usedAbsolute);

      if (!blocks.length) return;

      e.preventDefault();
      this._historyPush();
      this._clearMultiSelection();
      this._selectionManager.clear();

      const created = blocks.map((b) => this.addBlock({ x: b.x, y: b.y, width: b.width || 240, content: b.content }));
      if (!usedAbsolute) {
        this._reflowBlocks(created, { anchorX: anchor.x, anchorY: anchor.y, gap: 18 });
      }
      // Adjust positions after render to account for real block heights (images load async)
      // and prevent overlaps regardless of paste mode.
      this._resolveOverlapsAfterRender(created, { gap: 14 });
      this._selectionManager.setMultiSelection(created);
      this._toolbar.syncState();
      this._scheduleSurfaceResize();
    });

    this.el.addEventListener(
      'wheel',
      (e) => {
        if (e.shiftKey && !e.deltaX) {
          this.el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false }
    );

    document.addEventListener('keydown', (e) => {
      const isEditing = document.activeElement?.classList.contains('one-block__content');
      const activeBlock = this._selectionManager.activeBlock;
      const selectedBlocks = this._selectionManager.getSelectedBlocks();
      const hasMultiSelect = selectedBlocks.length >= 1;

      if (e.key === 'Escape') {
        if (isEditing && activeBlock) {
          activeBlock._contentEl.blur();
        }
        if (activeBlock) {
          this._selectionManager.clear();
          this._toolbar.syncState();
        }
        this._clearMultiSelection();
        return;
      }

      if (!isEditing) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          this._selectionManager.setMultiSelection(this.getBlocks());
          this._toolbar.syncState();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          const targets = hasMultiSelect ? selectedBlocks : activeBlock ? [activeBlock] : [];
          if (targets.length) {
            e.preventDefault();
            this._clipboardSave(targets);
            this.emit('keyboard:copy', this._clipboard);
          }
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
          const targets = hasMultiSelect ? selectedBlocks : activeBlock ? [activeBlock] : [];
          if (targets.length) {
            e.preventDefault();
            this._clipboardSave(targets);
            const ids = targets.map((b) => b.id);
            this._clearMultiSelection();
            this._selectionManager.clear();
            this._toolbar.syncState();
            ids.forEach((id) => this.removeBlock(id));
            this.emit('bulk:cut', this._clipboard);
          }
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
          if (this._clipboard.length) {
            e.preventDefault();
            this._bulkPaste();
          }
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
          const targets = hasMultiSelect ? selectedBlocks : activeBlock ? [activeBlock] : [];
          if (targets.length) {
            e.preventDefault();
            this._clipboardSave(targets);
            this._bulkPaste();
          }
          return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (hasMultiSelect) {
            e.preventDefault();
            this._bulkDelete();
            return;
          }
          if (activeBlock) {
            e.preventDefault();
            const id = activeBlock.id;
            this._selectionManager.clear();
            this._toolbar.syncState();
            this.removeBlock(id);
            return;
          }
        }

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          this._undo();
          return;
        }

        if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')) {
          e.preventDefault();
          this._redo();
          return;
        }
      }
    });
  }

  _reflowBlocks(blocks, { anchorX = 80, anchorY = 80, gap = 18 } = {}) {
    if (!Array.isArray(blocks) || !blocks.length) return;
    requestAnimationFrame(() => {
      let y = anchorY;
      for (const b of blocks) {
        if (!b?.el) continue;
        b.x = anchorX;
        b.y = y;
        b.el.style.left = `${b.x}px`;
        b.el.style.top = `${b.y}px`;
        const h = b.el.offsetHeight || 56;
        y += h + gap;
      }
      this._scheduleSurfaceResize();
      // Persist updated positions (Notes.js listens to 'content:changed' with debounce).
      this.emit('content:changed', { source: 'layout:reflow' });
    });
  }

  _resolveOverlapsAfterRender(blocks, { gap = 14 } = {}) {
    if (!Array.isArray(blocks) || !blocks.length) return;
    const run = () => {
      const items = blocks
        .filter((b) => b && b.el)
        .map((b) => ({
          b,
          x: Number(b.x) || 0,
          y: Number(b.y) || 0,
          w: b.el.offsetWidth || b.width || 240,
          h: b.el.offsetHeight || 56
        }))
        .sort((a, b) => (a.y - b.y) || (a.x - b.x));

      const placed = [];
      const overlaps = (r1, r2) =>
        !(r1.x + r1.w <= r2.x || r2.x + r2.w <= r1.x || r1.y + r1.h <= r2.y || r2.y + r2.h <= r1.y);

      for (const it of items) {
        let rect = { x: it.x, y: it.y, w: it.w, h: it.h };
        let guard = 0;
        while (placed.some((p) => overlaps(rect, p))) {
          const colliders = placed.filter((p) => overlaps(rect, p));
          const nextY = Math.max(...colliders.map((p) => p.y + p.h)) + gap;
          rect = { ...rect, y: nextY };
          guard++;
          if (guard > 80) break;
        }
        placed.push(rect);
        it.b.x = rect.x;
        it.b.y = rect.y;
        it.b.el.style.left = `${rect.x}px`;
        it.b.el.style.top = `${rect.y}px`;
      }

      this._scheduleSurfaceResize();
      // Persist updated positions (Notes.js listens to 'content:changed' with debounce).
      this.emit('content:changed', { source: 'layout:resolve-overlaps' });
    };

    // Run after initial layout.
    requestAnimationFrame(run);
    // Run again shortly after (images/fonts can change heights after first paint).
    setTimeout(() => requestAnimationFrame(run), 250);

    // Re-run when pasted images finish loading.
    try {
      const handled = new WeakSet();
      blocks.forEach((b) => {
        const imgs = b?.el?.querySelectorAll ? b.el.querySelectorAll('img') : [];
        imgs.forEach((img) => {
          if (handled.has(img)) return;
          handled.add(img);
          img.addEventListener(
            'load',
            () => {
              requestAnimationFrame(run);
              setTimeout(() => requestAnimationFrame(run), 120);
            },
            { once: true }
          );
        });
      });
    } catch {}
  }

  _startRubberBand(e) {
    this._rubberBanding = true;
    const pos = this._getRelativePosition(e);
    this._rbOrigin = pos;

    this._rbEl = document.createElement('div');
    this._rbEl.className = 'one-selection-rect';
    this._rbEl.style.left = `${pos.x}px`;
    this._rbEl.style.top = `${pos.y}px`;
    this._rbEl.style.width = '0';
    this._rbEl.style.height = '0';
    this._surfaceEl.appendChild(this._rbEl);

    this._selectionManager.clearMultiSelection();
    this._toolbar.syncState();

    const onMove = (ev) => {
      if (!this._rubberBanding) return;
      this._updateRubberBand(ev);
    };

    const onUp = (ev) => {
      if (!this._rubberBanding) return;
      this._finishRubberBand(ev);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  _updateRubberBand(e) {
    if (!this._rbEl) return;
    const pos = this._getRelativePosition(e);
    const x = Math.min(pos.x, this._rbOrigin.x);
    const y = Math.min(pos.y, this._rbOrigin.y);
    const w = Math.abs(pos.x - this._rbOrigin.x);
    const h = Math.abs(pos.y - this._rbOrigin.y);

    this._rbEl.style.left = `${x}px`;
    this._rbEl.style.top = `${y}px`;
    this._rbEl.style.width = `${w}px`;
    this._rbEl.style.height = `${h}px`;

    const selRect = { x, y, width: w, height: h };
    const hits = this.getBlocks().filter((b) => this._rectsIntersect(selRect, b));
    this._selectionManager.setMultiSelection(hits);
  }

  _finishRubberBand() {
    this._rubberBanding = false;
    if (this._rbEl) {
      this._rbEl.remove();
      this._rbEl = null;
    }

    const selected = this._selectionManager.getSelectedBlocks();
    if (selected.length >= 1) {
      this._toolbar.syncState();
    } else {
      this._selectionManager.clearMultiSelection();
      this._toolbar.syncState();
    }
  }

  _rectsIntersect(selRect, block) {
    const bx = block.x;
    const by = block.y;
    const bw = block.el.offsetWidth;
    const bh = block.el.offsetHeight;
    return !(selRect.x + selRect.width < bx || selRect.x > bx + bw || selRect.y + selRect.height < by || selRect.y > by + bh);
  }

  _startGroupDrag(leadBlock, e) {
    e.preventDefault();
    this._historyPush();
    const selected = this._selectionManager.getSelectedBlocks();

    const leadRect = leadBlock.el.getBoundingClientRect();
    const offsetX = e.clientX - leadRect.left;
    const offsetY = e.clientY - leadRect.top;
    let prevClientX = e.clientX;
    let prevClientY = e.clientY;

    this._groupDragging = true;
    selected.forEach((b) => {
      b.el.style.zIndex = '100';
    });

    const onMove = (ev) => {
      const dx = ev.clientX - prevClientX;
      const dy = ev.clientY - prevClientY;
      prevClientX = ev.clientX;
      prevClientY = ev.clientY;

      selected.forEach((b) => {
        b.x = clamp(b.x + dx, 0, this.el.scrollWidth - b.el.offsetWidth);
        b.y = clamp(b.y + dy, 0, this.el.scrollHeight - b.el.offsetHeight);
        b.el.style.left = `${b.x}px`;
        b.el.style.top = `${b.y}px`;
      });

      this._toolbar.syncState();
    };

    const onUp = () => {
      this._groupDragging = false;
      selected.forEach((b) => {
        b.el.style.zIndex = b._isSelected ? '15' : '10';
        this.emit('block:moved', b.toJSON());
      });
      this._toolbar.syncState();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  _wireBlock(block) {
    block.on('focus', (b) => {
      this._clearMultiSelection();
      this._selectionManager.setActive(b);
      this._toolbar.syncState();
    });

    block.on('blur', () => {});

    block.on('change', (b) => {
      clearTimeout(this._contentChangeTimer);
      this._contentChangeTimer = setTimeout(() => {
        this._historyPush();
      }, 800);
      this.emit('content:changed', b.toJSON());
      this._scheduleSurfaceResize();
    });

    block.on('drag:start', () => this._historyPush());
    block.on('resize:start', () => this._historyPush());

    block.on('move', (b) => {
      this.emit('block:moved', b.toJSON());
      this._scheduleSurfaceResize();
    });

    block.on('delete', (b) => {
      this._historyPush();
      this.removeBlock(b.id);
    });

    block.on('duplicate', (b) => {
      this._historyPush();
      this.addBlock({ x: b.x + 24, y: b.y + 24, content: b._contentEl.innerHTML, width: b.width });
    });

    block.on('block:mousedown', (b, e) => {
      const inGrip = Boolean(e.target?.closest?.('.one-block__grip'));
      const inResize = Boolean(e.target?.closest?.('.one-block__resize'));
      const inContent = Boolean(e.target?.closest?.('.one-block__content'));
      const isEditing = document.activeElement === b._contentEl;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this._selectionManager.clear();
        this._selectionManager.toggleInSelection(b);
        this._toolbar.syncState();
      } else {
        if (e.target === b.el) {
          e.preventDefault();
          this._selectionManager.clear();
          this._selectionManager.setMultiSelection([b]);
          this._toolbar.syncState();
        } else {
          if (!this._selectionManager.isSelected(b) && this._selectionManager.selectedCount > 0) {
            this._clearMultiSelection();
          }
        }
      }

      // Drag from anywhere on selected blocks (except resize and while actively editing text).
      if (inResize) return;
      if (inContent && isEditing) return;

      if (this._selectionManager.isSelected(b) && this._selectionManager.selectedCount >= 2) {
        this._startGroupDrag(b, e);
        return;
      }
      if (this._selectionManager.isSelected(b) && this._selectionManager.selectedCount === 1) {
        b.startDrag(e);
      }
    });

    // Explicit drag grip at top-center.
    block.on('grip:mousedown', (b, e) => {
      if (this._selectionManager.isSelected(b) && this._selectionManager.selectedCount >= 2) {
        this._startGroupDrag(b, e);
        return;
      }
      if (!this._selectionManager.isSelected(b)) {
        this._selectionManager.clear();
        this._selectionManager.setMultiSelection([b]);
        this._toolbar.syncState();
      }
      b.startDrag(e);
    });
  }

  _historyPush() {
    this._history.push(this.getState());
  }

  _clearMultiSelection() {
    this._selectionManager.clearMultiSelection();
    this._toolbar.syncState();
  }

  _clipboardSave(blocks) {
    this._clipboard = blocks.map((b) => b.toJSON());
  }

  _bulkPaste(offset = 32) {
    if (!this._clipboard.length) return;
    this._historyPush();
    this._clearMultiSelection();
    this._selectionManager.clear();
    const newBlocks = this._clipboard.map((snap) => this.addBlock({ x: snap.x + offset, y: snap.y + offset, content: snap.content, width: snap.width }));
    this._selectionManager.setMultiSelection(newBlocks);
    this._toolbar.syncState();
    this.emit('bulk:paste', this._clipboard);
  }

  _bulkCopy() {
    const selected = this._selectionManager.getSelectedBlocks();
    this._clipboardSave(selected);
    this._bulkPaste(24);
    this.emit('bulk:copy', this._clipboard);
  }

  _bulkCut() {
    const selected = this._selectionManager.getSelectedBlocks();
    this._clipboardSave(selected);
    this._historyPush();
    const ids = selected.map((b) => b.id);
    this._clearMultiSelection();
    ids.forEach((id) => this.removeBlock(id));
    this.emit('bulk:cut', this._clipboard);
  }

  _bulkDelete() {
    const selected = this._selectionManager.getSelectedBlocks();
    const ids = selected.map((b) => b.id);
    this._historyPush();
    this._clearMultiSelection();
    ids.forEach((id) => this.removeBlock(id));
    this.emit('bulk:delete', { count: ids.length });
  }

  _bulkAlign(direction) {
    const selected = this._selectionManager.getSelectedBlocks();
    if (selected.length < 2) return;

    if (direction === 'left') {
      const minX = Math.min(...selected.map((b) => b.x));
      selected.forEach((b) => {
        b.x = minX;
        b.el.style.left = `${minX}px`;
      });
    } else if (direction === 'center') {
      const avgX = selected.reduce((s, b) => s + b.x + b.el.offsetWidth / 2, 0) / selected.length;
      selected.forEach((b) => {
        b.x = avgX - b.el.offsetWidth / 2;
        b.el.style.left = `${b.x}px`;
      });
    } else if (direction === 'top') {
      const minY = Math.min(...selected.map((b) => b.y));
      selected.forEach((b) => {
        b.y = minY;
        b.el.style.top = `${minY}px`;
      });
    } else if (direction === 'middle') {
      const avgY = selected.reduce((s, b) => s + b.y + b.el.offsetHeight / 2, 0) / selected.length;
      selected.forEach((b) => {
        b.y = avgY - b.el.offsetHeight / 2;
        b.el.style.top = `${b.y}px`;
      });
    }

    this._toolbar.syncState();
    this.emit('bulk:align', { direction });
  }

  addBlock({ x = 100, y = 100, content = '', width = 240, id, _silent = false } = {}) {
    const block = new TextBlock({ x, y, content, width, id, canvasEl: this.el });
    this._wireBlock(block);
    this._blocks.set(block.id, block);
    this._surfaceEl.appendChild(block.el);
    this.emit('block:created', block.toJSON());
    this._scheduleSurfaceResize();
    return block;
  }

  removeBlock(id, _silent = false) {
    const block = this._blocks.get(id);
    if (!block) return;
    if (this._selectionManager.activeBlock === block) {
      this._selectionManager.clear();
      this._toolbar.syncState();
    }
    block.destroy();
    this._blocks.delete(id);
    this.emit('block:deleted', { id });
    this._scheduleSurfaceResize();
  }

  getBlocks() {
    return [...this._blocks.values()];
  }

  _watchSelectionChange() {
    document.addEventListener('selectionchange', () => {
      const active = this._selectionManager.activeBlock;
      if (!active) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.anchorNode && isDescendant(active._contentEl, sel.anchorNode)) {
        this._toolbar.show(active.el);
        this._toolbar._syncState();
      }
    });

    this._selectionManager.onChange((block) => {
      if (!block) {
        setTimeout(() => {
          if (!this._selectionManager.activeBlock) this._toolbar.syncState();
        }, 150);
      }
    });
  }

  getState() {
    return { blocks: this.getBlocks().map((b) => b.toJSON()) };
  }

  loadState(state, { silent = false } = {}) {
    if (!silent) this._historyPush();
    this._clearMultiSelection();
    this._selectionManager.clear();
    this._toolbar.syncState();
    [...this._blocks.keys()].forEach((id) => this.removeBlock(id));
    if (state && Array.isArray(state.blocks)) {
      state.blocks.forEach((b) => this.addBlock(b));
    }
    this._scheduleSurfaceResize();
  }

  _undo() {
    const prev = this._history.undo(this.getState());
    if (!prev) {
      this.emit('history:no-undo');
      return;
    }
    this.loadState(prev, { silent: true });
    this.emit('history:undo', { undoCount: this._history.undoCount, redoCount: this._history.redoCount });
  }

  _redo() {
    const next = this._history.redo(this.getState());
    if (!next) {
      this.emit('history:no-redo');
      return;
    }
    this.loadState(next, { silent: true });
    this.emit('history:redo', { undoCount: this._history.undoCount, redoCount: this._history.redoCount });
  }

  setDark(dark) {
    this.dark = dark;
    this.el.classList.toggle('one-canvas--dark', dark);
    this.containerEl.classList.toggle('one-editor--dark', dark);
    this.containerEl.style.backgroundColor = dark ? '#1e1e2e' : '#f5f5f0';
    if (this._toolbar) this._toolbar.setDark(dark);
  }

  destroy() {
    clearTimeout(this._contentChangeTimer);
    if (this._surfaceResizeRaf) cancelAnimationFrame(this._surfaceResizeRaf);
    this._surfaceResizeRaf = null;
    if (this._mediaQuery && this._onSystemThemeChange) {
      try {
        this._mediaQuery.removeEventListener('change', this._onSystemThemeChange);
      } catch {}
    }
    [...this._blocks.keys()].forEach((id) => this.removeBlock(id));
    if (this._toolbar) this._toolbar.destroy();
    this._selectionManager.destroy();
    this._history.clear();
    this.el.remove();
    this.removeAllListeners();
  }
}
