import { getIpcRenderer, isElectron } from './electron';

const EXTERNAL_PROTOCOL_RE = /^(https?:|mailto:|tel:)/i;

export function isExternalAppUrl(url) {
  const value = String(url || '').trim();
  return Boolean(value) && EXTERNAL_PROTOCOL_RE.test(value);
}

export async function openExternalUrl(url) {
  const trimmed = String(url || '').trim();
  if (!isExternalAppUrl(trimmed)) return false;

  if (isElectron()) {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      await ipcRenderer.invoke('open-external-url', trimmed);
      return true;
    }
  }

  window.open(trimmed, '_blank', 'noopener,noreferrer');
  return true;
}

export function installExternalLinkHandler() {
  if (typeof document === 'undefined') return;

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href')?.trim();
    if (!href || href.startsWith('#')) return;
    if (!isExternalAppUrl(href)) return;

    event.preventDefault();
    openExternalUrl(href).catch((error) => {
      console.warn('Failed to open external link:', error);
    });
  }, true);
}
