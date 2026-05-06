import { ICONS } from './icons.js';

export class Toolbar {
  constructor({ containerEl, canvas, dark = false } = {}) {
    this.containerEl = containerEl;
    this.canvas = canvas;
    this.dark = dark;
    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'one-header-toolbar';
    if (this.dark) this.el.classList.add('one-header-toolbar--dark');

    this.el.innerHTML = `
      <div class="one-ht-group">
        <select class="one-ht-select" id="ht-font-family" title="Font family" style="width:120px">
          <option value="inherit">Default</option>
          <option value="'Segoe UI', system-ui, sans-serif">Segoe UI</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="'Times New Roman', serif">Times New Roman</option>
          <option value="'Courier New', monospace">Courier New</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Verdana, sans-serif">Verdana</option>
          <option value="'Comic Sans MS', cursive">Comic Sans</option>
        </select>
        <select class="one-ht-select" id="ht-font-size" title="Font size" style="width:56px">
          ${[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map((s) => `<option value="${s}" ${s === 14 ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="one-ht-sep"></div>

      <div class="one-ht-group">
        <button class="one-ht-btn" id="ht-bold" data-cmd="bold" title="Bold (Ctrl+B)">${ICONS.bold}</button>
        <button class="one-ht-btn" id="ht-italic" data-cmd="italic" title="Italic (Ctrl+I)">${ICONS.italic}</button>
        <button class="one-ht-btn" id="ht-underline" data-cmd="underline" title="Underline (Ctrl+U)">${ICONS.underline}</button>
        <button class="one-ht-btn" id="ht-strike" data-cmd="strikeThrough" title="Strikethrough">${ICONS.strikethrough}</button>
        <button class="one-ht-btn" id="ht-clear" title="Clear formatting">${ICONS.clearFormat}</button>
      </div>

      <div class="one-ht-sep"></div>

      <div class="one-ht-group">
        <div class="one-ht-color-wrap" title="Text color">
          ${ICONS.textColor}
          <input type="color" class="one-ht-color-input" id="ht-text-color" value="#000000">
        </div>
        <div class="one-ht-color-wrap" title="Highlight color">
          ${ICONS.highlight}
          <input type="color" class="one-ht-color-input" id="ht-highlight-color" value="#ffff00">
        </div>
      </div>

      <div class="one-ht-sep"></div>

      <div class="one-ht-group">
        <button class="one-ht-btn" data-cmd="justifyLeft" title="Align left">${ICONS.alignLeft}</button>
        <button class="one-ht-btn" data-cmd="justifyCenter" title="Align center">${ICONS.alignCenter}</button>
        <button class="one-ht-btn" data-cmd="justifyRight" title="Align right">${ICONS.alignRight}</button>
        <button class="one-ht-btn" data-cmd="insertUnorderedList" title="Bullet list">${ICONS.listBullet}</button>
        <button class="one-ht-btn" data-cmd="insertOrderedList" title="Numbered list">${ICONS.listOrdered}</button>
      </div>

      <div class="one-ht-sep"></div>

      <div class="one-ht-group one-ht-group--right">
        <span class="one-ht-label" id="ht-selection-count">No selection</span>

        <div class="one-ht-sep"></div>

        <button class="one-ht-btn one-ht-action" id="ht-copy" title="Copy selection">${ICONS.copy}<span class="one-ht-btn-label">Copy</span></button>
        <button class="one-ht-btn one-ht-action" id="ht-cut" title="Cut selection">${ICONS.cut}<span class="one-ht-btn-label">Cut</span></button>
        <button class="one-ht-btn one-ht-action one-ht-action--danger" id="ht-delete" title="Delete selection">${ICONS.trash}<span class="one-ht-btn-label">Delete</span></button>

        <div class="one-ht-sep"></div>

        <button class="one-ht-btn one-ht-icon-btn" id="ht-align-left" title="Align left edges">${ICONS.alignBlockLeft}</button>
        <button class="one-ht-btn one-ht-icon-btn" id="ht-align-center" title="Align horizontal centers">${ICONS.alignBlockCenter}</button>
        <button class="one-ht-btn one-ht-icon-btn" id="ht-align-top" title="Align top edges">${ICONS.alignBlockTop}</button>
        <button class="one-ht-btn one-ht-icon-btn" id="ht-align-middle" title="Align vertical midpoints">${ICONS.alignBlockMiddle}</button>
      </div>
    `;

    this.containerEl.appendChild(this.el);

    this._fontFamilyEl = this.el.querySelector('#ht-font-family');
    this._fontSizeEl = this.el.querySelector('#ht-font-size');
    this._textColorEl = this.el.querySelector('#ht-text-color');
    this._highlightColorEl = this.el.querySelector('#ht-highlight-color');
    this._countLabel = this.el.querySelector('#ht-selection-count');
    this._bulkCopy = this.el.querySelector('#ht-copy');
    this._bulkCut = this.el.querySelector('#ht-cut');
    this._bulkDelete = this.el.querySelector('#ht-delete');
  }

  _bindEvents() {
    this.el.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.canvas._historyPush();
        const cmd = btn.dataset.cmd;
        document.execCommand(cmd, false, null);
        const sel = this.canvas._selectionManager.activeBlock;
        if (sel) sel.emit('change', sel);
        this.syncState();
      });
    });

    this._fontFamilyEl.addEventListener('change', (e) => {
      e.preventDefault();
      this.canvas._historyPush();
      document.execCommand('fontName', false, e.target.value);
      const sel = this.canvas._selectionManager.activeBlock;
      if (sel) sel.emit('change', sel);
    });

    this._fontSizeEl.addEventListener('change', (e) => {
      e.preventDefault();
      this.canvas._historyPush();
      this._applyFontSize(parseInt(e.target.value));
      const sel = this.canvas._selectionManager.activeBlock;
      if (sel) sel.emit('change', sel);
    });

    this._textColorEl.addEventListener('input', (e) => {
      this.canvas._historyPush();
      document.execCommand('foreColor', false, e.target.value);
      const sel = this.canvas._selectionManager.activeBlock;
      if (sel) sel.emit('change', sel);
    });

    this._highlightColorEl.addEventListener('input', (e) => {
      this.canvas._historyPush();
      document.execCommand('hiliteColor', false, e.target.value);
      const sel = this.canvas._selectionManager.activeBlock;
      if (sel) sel.emit('change', sel);
    });

    this.el.querySelector('#ht-clear').addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.canvas._historyPush();
      document.execCommand('removeFormat', false, null);
      const sel = this.canvas._selectionManager.activeBlock;
      if (sel) sel.emit('change', sel);
    });

    this._bulkCopy.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.canvas._bulkCopy();
    });
    this._bulkCut.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.canvas._bulkCut();
    });
    this._bulkDelete.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.canvas._bulkDelete();
    });

    ['left', 'center', 'top', 'middle'].forEach((dir) => {
      this.el.querySelector('#ht-align-' + dir).addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.canvas._historyPush();
        this.canvas._bulkAlign(dir);
      });
    });

    document.addEventListener('selectionchange', () => this.syncState());
  }

  _applyFontSize(px) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    document.execCommand('fontSize', false, '7');
    document.querySelectorAll('font[size="7"]').forEach((span) => {
      span.removeAttribute('size');
      span.style.fontSize = px + 'px';
    });
  }

  show() {}

  _syncState() {
    this.syncState();
  }

  syncState() {
    const active = this.canvas._selectionManager.activeBlock;
    const count = this.canvas._selectionManager.selectedCount;
    this._countLabel.textContent = __getSelectionLabel(active, count);

    ['bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight', 'insertUnorderedList', 'insertOrderedList'].forEach((cmd) => {
      const btn = this.el.querySelector(`[data-cmd="${cmd}"]`);
      if (btn) {
        try {
          btn.classList.toggle('one-ht-btn--active', document.queryCommandState(cmd));
        } catch {}
      }
    });

    const hasSel = count > 0;
    this._bulkCopy.disabled = !hasSel;
    this._bulkCut.disabled = !hasSel;
    this._bulkDelete.disabled = !hasSel;
  }

  setDark(dark) {
    this.dark = dark;
    this.el.classList.toggle('one-header-toolbar--dark', dark);
  }

  destroy() {
    this.el.remove();
  }
}

function __getSelectionLabel(activeBlock, count) {
  if (count > 0) return count + ' block' + (count > 1 ? 's' : '') + ' selected';
  if (activeBlock) return 'Editing block';
  return 'No selection';
}
