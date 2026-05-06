export class HistoryManager {
  constructor({ maxHistory = 100 } = {}) {
    this._undoStack = [];
    this._redoStack = [];
    this._maxHistory = maxHistory;
  }

  push(state) {
    this._undoStack.push(JSON.stringify(state));
    if (this._undoStack.length > this._maxHistory) {
      this._undoStack.shift();
    }
    this._redoStack = [];
  }

  undo(currentState) {
    if (!this._undoStack.length) return null;
    this._redoStack.push(JSON.stringify(currentState));
    return JSON.parse(this._undoStack.pop());
  }

  redo(currentState) {
    if (!this._redoStack.length) return null;
    this._undoStack.push(JSON.stringify(currentState));
    return JSON.parse(this._redoStack.pop());
  }

  get canUndo() {
    return this._undoStack.length > 0;
  }

  get canRedo() {
    return this._redoStack.length > 0;
  }

  get undoCount() {
    return this._undoStack.length;
  }

  get redoCount() {
    return this._redoStack.length;
  }

  clear() {
    this._undoStack = [];
    this._redoStack = [];
  }
}
