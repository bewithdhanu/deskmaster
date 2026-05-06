import { generateId, clamp } from './utils.js';
import { EventEmitter } from './EventEmitter.js';

export class TextBlock extends EventEmitter {
  constructor({ x, y, content = '', width = 200, id, canvasEl }) {
    super();
    this.id = id || generateId();
    this.x = x;
    this.y = y;
    this.width = width;
    this.canvasEl = canvasEl;
    this._isDragging = false;
    this._isResizing = false;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;
    this._resizeStartX = 0;
    this._resizeStartWidth = 0;
    this._isSelected = false;

    this._buildDOM();
    this._setContent(content);
    this._bindEvents();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'one-block';
    this.el.dataset.blockId = this.id;
    this.el.style.left = `${this.x}px`;
    this.el.style.top = `${this.y}px`;
    this.el.style.width = `${this.width}px`;

    this._handleEl = document.createElement('div');
    this._handleEl.className = 'one-block__handle';
    this._handleEl.title = 'Drag to move';

    this._actionsEl = document.createElement('div');
    this._actionsEl.className = 'one-block__actions';

    this._duplicateBtn = document.createElement('button');
    this._duplicateBtn.className = 'one-block__btn one-block__btn--duplicate';
    this._duplicateBtn.innerHTML = '⧉';
    this._duplicateBtn.title = 'Duplicate';

    this._deleteBtn = document.createElement('button');
    this._deleteBtn.className = 'one-block__btn one-block__btn--delete';
    this._deleteBtn.innerHTML = '✕';
    this._deleteBtn.title = 'Delete block';

    this._actionsEl.appendChild(this._duplicateBtn);
    this._actionsEl.appendChild(this._deleteBtn);

    this._contentEl = document.createElement('div');
    this._contentEl.className = 'one-block__content';
    this._contentEl.contentEditable = 'true';
    this._contentEl.dataset.placeholder = 'Type something…';
    this._contentEl.spellcheck = true;

    this._resizeEl = document.createElement('div');
    this._resizeEl.className = 'one-block__resize';
    this._resizeEl.title = 'Resize';

    this.el.appendChild(this._handleEl);
    this.el.appendChild(this._actionsEl);
    this.el.appendChild(this._contentEl);
    this.el.appendChild(this._resizeEl);
  }

  _setContent(html) {
    this._contentEl.innerHTML = html;
  }

  _bindEvents() {
    this._contentEl.addEventListener('focus', () => {
      this.setActive(true);
      this.emit('focus', this);
    });

    this._contentEl.addEventListener('blur', () => {
      this.emit('blur', this);
    });

    this._contentEl.addEventListener('input', () => {
      this.emit('change', this);
    });

    this.el.addEventListener('mousedown', (e) => {
      this.emit('block:mousedown', this, e);
      e.stopPropagation();
    });

    this.el.addEventListener('dblclick', (e) => e.stopPropagation());

    this._deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emit('delete', this);
    });

    this._duplicateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emit('duplicate', this);
    });

    this._handleEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.emit('handle:mousedown', this, e);
    });

    this._resizeEl.addEventListener('mousedown', (e) => this._onResizeStart(e));
  }

  startDrag(e) {
    this._onDragStart(e);
  }

  _onDragStart(e) {
    e.preventDefault();
    this.emit('drag:start', this);
    this._isDragging = true;
    const rect = this.el.getBoundingClientRect();
    this._dragOffsetX = e.clientX - rect.left;
    this._dragOffsetY = e.clientY - rect.top;
    this.el.style.zIndex = '100';

    const onMove = (ev) => {
      if (!this._isDragging) return;
      const canvasRect = this.canvasEl.getBoundingClientRect();
      const newX = clamp(ev.clientX - canvasRect.left + this.canvasEl.scrollLeft - this._dragOffsetX, 0, this.canvasEl.scrollWidth - this.el.offsetWidth);
      const newY = clamp(ev.clientY - canvasRect.top + this.canvasEl.scrollTop - this._dragOffsetY, 0, this.canvasEl.scrollHeight - this.el.offsetHeight);
      this.x = newX;
      this.y = newY;
      this.el.style.left = `${newX}px`;
      this.el.style.top = `${newY}px`;
      this.emit('move', this);
    };

    const onUp = () => {
      this._isDragging = false;
      this.el.style.zIndex = this.el.classList.contains('one-block--active') ? '20' : '10';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  _onResizeStart(e) {
    e.preventDefault();
    e.stopPropagation();
    this.emit('resize:start', this);
    this._isResizing = true;
    this._resizeStartX = e.clientX;
    this._resizeStartWidth = this.el.offsetWidth;

    const onMove = (ev) => {
      if (!this._isResizing) return;
      const delta = ev.clientX - this._resizeStartX;
      const newWidth = clamp(this._resizeStartWidth + delta, 120, 1200);
      this.width = newWidth;
      this.el.style.width = `${newWidth}px`;
    };

    const onUp = () => {
      this._isResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  setActive(active) {
    this.el.classList.toggle('one-block--active', active);
  }

  setSelected(selected) {
    this._isSelected = selected;
    this.el.classList.toggle('one-block--selected', selected);
  }

  focus() {
    this._contentEl.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(this._contentEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  toJSON() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      width: this.width,
      content: this._contentEl.innerHTML
    };
  }

  destroy() {
    this.el.remove();
    this.removeAllListeners();
  }
}
