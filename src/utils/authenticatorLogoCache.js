import { getIpcRenderer, isElectron } from './electron';

const LOGO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** In-memory only — cleared on app restart. Entries expire after one week. */
const logoCache = new Map();
const pendingLoads = new Map();

export function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function getCachedLogo(domain) {
  const entry = logoCache.get(domain);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    logoCache.delete(domain);
    return null;
  }
  return entry.dataUrl;
}

function setCachedLogo(domain, dataUrl) {
  logoCache.set(domain, {
    dataUrl,
    expiresAt: Date.now() + LOGO_CACHE_TTL_MS
  });
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchLogoDataUrlRenderer(domain) {
  const response = await fetch(getFaviconUrl(domain));
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.size) return null;
  return readBlobAsDataUrl(blob);
}

async function fetchLogoDataUrl(domain) {
  if (isElectron()) {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      return ipcRenderer.invoke('fetch-authenticator-logo', domain);
    }
  }
  return fetchLogoDataUrlRenderer(domain);
}

export function getCachedAuthenticatorLogo(domain) {
  if (!domain) return null;
  return getCachedLogo(domain);
}

export async function loadAuthenticatorLogo(domain) {
  if (!domain) return null;

  const cached = getCachedLogo(domain);
  if (cached) return cached;

  const pending = pendingLoads.get(domain);
  if (pending) return pending;

  const loadPromise = fetchLogoDataUrl(domain)
    .then((dataUrl) => {
      if (dataUrl) setCachedLogo(domain, dataUrl);
      return dataUrl;
    })
    .finally(() => {
      pendingLoads.delete(domain);
    });

  pendingLoads.set(domain, loadPromise);
  return loadPromise;
}
