import { Canvas } from './Canvas.js';

export class OneNoteEditor {
  constructor(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error(`[OneNoteEditor] Cannot find element: ${target}`);
    this._canvas = new Canvas(el, options);
  }

  on(event, listener) {
    this._canvas.on(event, listener);
    return this;
  }

  off(event, listener) {
    this._canvas.off(event, listener);
    return this;
  }

  addBlock(options = {}) {
    return this._canvas.addBlock(options);
  }

  removeBlock(id) {
    this._canvas.removeBlock(id);
    return this;
  }

  getBlocks() {
    return this._canvas.getBlocks();
  }

  getSelectedBlocks() {
    return this._canvas._selectionManager.getSelectedBlocks();
  }

  getState() {
    return this._canvas.getState();
  }

  loadState(state) {
    this._canvas.loadState(state);
    return this;
  }

  setDark(dark) {
    this._canvas.setDark(dark);
    return this;
  }

  undo() {
    this._canvas._undo();
    return this;
  }

  redo() {
    this._canvas._redo();
    return this;
  }

  get canUndo() {
    return this._canvas._history.canUndo;
  }

  get canRedo() {
    return this._canvas._history.canRedo;
  }

  destroy() {
    this._canvas.destroy();
  }
}

export default OneNoteEditor;
