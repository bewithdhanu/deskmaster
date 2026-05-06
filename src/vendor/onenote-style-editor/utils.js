export function generateId() {
  return `one-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getRelativePosition(event, container) {
  const rect = container.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + container.scrollLeft,
    y: event.clientY - rect.top + container.scrollTop
  };
}

export function throttle(fn, ms = 16) {
  let lastTime = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastTime >= ms) {
      lastTime = now;
      fn(...args);
    }
  };
}

export function injectStyles(css, id = 'onenote-editor-styles') {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isDescendant(parent, child) {
  let node = child;
  while (node) {
    if (node === parent) return true;
    node = node.parentNode;
  }
  return false;
}
