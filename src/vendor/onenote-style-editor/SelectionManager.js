export class SelectionManager {
  constructor() {
    this._activeBlock = null;
    this._selectedBlocks = new Set();
    this._listeners = [];
    this._multiListeners = [];
  }

  get activeBlock() {
    return this._activeBlock;
  }

  setActive(block) {
    if (this._activeBlock === block) return;
    if (this._activeBlock) this._activeBlock.setActive(false);
    this._activeBlock = block;
    if (block) block.setActive(true);
    this._notify(block);
  }

  clear() {
    this.setActive(null);
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  _notify(block) {
    for (const fn of this._listeners) {
      try {
        fn(block);
      } catch {}
    }
  }

  setMultiSelection(blocks) {
    this._selectedBlocks.forEach((b) => b.setSelected(false));
    this._selectedBlocks.clear();

    blocks.forEach((b) => {
      b.setSelected(true);
      this._selectedBlocks.add(b);
    });

    this._notifyMulti();
  }

  toggleInSelection(block) {
    if (this._selectedBlocks.has(block)) {
      block.setSelected(false);
      this._selectedBlocks.delete(block);
    } else {
      block.setSelected(true);
      this._selectedBlocks.add(block);
    }
    this._notifyMulti();
  }

  clearMultiSelection() {
    this._selectedBlocks.forEach((b) => b.setSelected(false));
    this._selectedBlocks.clear();
    this._notifyMulti();
  }

  getSelectedBlocks() {
    return [...this._selectedBlocks];
  }

  get selectedCount() {
    return this._selectedBlocks.size;
  }

  isSelected(block) {
    return this._selectedBlocks.has(block);
  }

  onMultiChange(fn) {
    this._multiListeners.push(fn);
  }

  _notifyMulti() {
    const blocks = this.getSelectedBlocks();
    for (const fn of this._multiListeners) {
      try {
        fn(blocks);
      } catch {}
    }
  }

  destroy() {
    this.clearMultiSelection();
    this._listeners = [];
    this._multiListeners = [];
    this._activeBlock = null;
  }
}
