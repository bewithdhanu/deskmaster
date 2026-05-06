export class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, listener) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(listener);
    return this;
  }

  off(event, listener) {
    if (!this._listeners[event]) return this;
    if (listener) {
      this._listeners[event] = this._listeners[event].filter((l) => l !== listener);
    } else {
      delete this._listeners[event];
    }
    return this;
  }

  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  emit(event, ...args) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach((listener) => {
      try {
        listener(...args);
      } catch (e) {
        console.error(`[OneNoteEditor] Error in listener for "${event}":`, e);
      }
    });
    return this;
  }

  removeAllListeners() {
    this._listeners = {};
    return this;
  }
}
