import React, { useState, useEffect, useRef } from 'react';
import { MdAdd, MdEdit, MdDelete, MdContentCopy, MdOpenInNew, MdSearch, MdDeleteForever, MdRestore } from 'react-icons/md';
import { getIpcRenderer } from '../utils/electron';
import { getCachedAuthenticatorLogo, getFaviconUrl, loadAuthenticatorLogo } from '../utils/authenticatorLogoCache';
import { openExternalUrl } from '../utils/openExternalUrl';

const ipcRenderer = getIpcRenderer();

const TOTP_PERIOD = 30;

function getProgressBarColor(timeRemaining) {
  const ratio = Math.max(0, Math.min(1, timeRemaining / TOTP_PERIOD));
  const green = { r: 34, g: 197, b: 94 };
  const red = { r: 255, g: 71, b: 87 };
  const r = Math.round(red.r + (green.r - red.r) * ratio);
  const g = Math.round(red.g + (green.g - red.g) * ratio);
  const b = Math.round(red.b + (green.b - red.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatTotpCode(code) {
  if (!code || code === '---') return '--- ---';
  const digits = String(code).replace(/\s/g, '');
  if (digits.length === 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return String(code);
}

const AWS_ACCOUNT_ID_RE = /^\d{12}$/;

function extractAwsAccountIdFromUrl(url) {
  if (!url) return null;
  try {
    const href = url.startsWith('http') ? url : `https://${url}`;
    const hostname = new URL(href).hostname;
    const signInMatch = hostname.match(/^(\d{12})\.signin\.aws\.amazon\.com$/i);
    if (signInMatch) return signInMatch[1];
  } catch {
    // ignore invalid URLs
  }
  return null;
}

function extractAwsAccountIdFromText(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (AWS_ACCOUNT_ID_RE.test(trimmed)) return trimmed;
  const parenMatch = trimmed.match(/\((\d{12})\)/);
  if (parenMatch) return parenMatch[1];
  const awsMatch = trimmed.match(/(?:aws|amazon)[^\d]*(\d{12})/i);
  if (awsMatch) return awsMatch[1];
  return null;
}

function getAwsAccountId(item) {
  const stored = item.aws_account_id || item.awsAccountId;
  if (stored && String(stored).trim()) return String(stored).trim();

  return (
    extractAwsAccountIdFromUrl(item.url)
    || extractAwsAccountIdFromText(item.name)
    || extractAwsAccountIdFromText(item.username)
    || null
  );
}

function getDomainFromUrl(url) {
  if (!url) return null;
  try {
    const href = url.startsWith('http') ? url : `https://${url}`;
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getCardSubtitle(item) {
  const accountId = getAwsAccountId(item);
  if (accountId) return accountId;
  return getDomainFromUrl(item.url);
}

function getCardInitial(name) {
  const trimmed = String(name || '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

function getLogoDomain(item) {
  const urlDomain = getDomainFromUrl(item.url);
  if (urlDomain) {
    if (/\.signin\.aws\.amazon\.com$/i.test(urlDomain) || urlDomain.includes('aws.amazon.com')) {
      return 'aws.amazon.com';
    }
    return urlDomain;
  }

  const name = String(item.name || '').toLowerCase();
  if (getAwsAccountId(item) || /amazon|aws/.test(name)) {
    return 'aws.amazon.com';
  }

  return null;
}

function AuthenticatorCardLogo({ item }) {
  const domain = getLogoDomain(item);
  const [logoSrc, setLogoSrc] = useState(() => getCachedAuthenticatorLogo(domain));
  const [useRemoteFallback, setUseRemoteFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!domain) {
      setLogoSrc(null);
      setUseRemoteFallback(false);
      setFailed(false);
      return undefined;
    }

    const cached = getCachedAuthenticatorLogo(domain);
    if (cached) {
      setLogoSrc(cached);
      setUseRemoteFallback(false);
      setFailed(false);
      return undefined;
    }

    let cancelled = false;
    setLogoSrc(null);
    setUseRemoteFallback(true);
    setFailed(false);

    loadAuthenticatorLogo(domain)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          setLogoSrc(dataUrl);
          setUseRemoteFallback(false);
        }
      })
      .catch(() => {
        // Keep remote fallback URL visible on cache fetch failure.
      });

    return () => {
      cancelled = true;
    };
  }, [domain]);

  const imageSrc = logoSrc || (useRemoteFallback && domain ? getFaviconUrl(domain) : null);
  const showImage = Boolean(imageSrc) && !failed;

  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-theme-secondary text-xs font-semibold text-theme-primary"
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={imageSrc}
          alt=""
          className="h-5 w-5 object-contain"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        getCardInitial(item.name)
      )}
    </div>
  );
}

const Authenticator = () => {
  const [authenticators, setAuthenticators] = useState([]);
  const [filteredAuthenticators, setFilteredAuthenticators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    secret: '',
    url: '',
    username: '',
    password: ''
  });
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [updateKey, setUpdateKey] = useState(0); // Force re-render when codes update
  const [viewMode, setViewMode] = useState('regular'); // 'regular' or 'trash'
  const [trashEntries, setTrashEntries] = useState([]);
  const [filteredTrashEntries, setFilteredTrashEntries] = useState([]);
  const timerIntervalRef = useRef(null); // Single interval for both timer and codes
  const previousRemainingRef = useRef(30);

  // Load authenticators
  const loadAuthenticators = async () => {
    try {
      const data = await ipcRenderer.invoke('get-authenticators');
      if (data && data.length > 0) {
        const secrets = data.map(auth => auth.secret).filter(Boolean);
        let codeSets = { codes: {}, nextCodes: {} };

        if (secrets.length > 0) {
          codeSets = await ipcRenderer.invoke('get-all-totp-codes', secrets) || codeSets;
        }

        const withCodes = data.map((auth) => ({
          ...auth,
          currentCode: codeSets.codes?.[auth.secret] || '---',
          nextCode: codeSets.nextCodes?.[auth.secret] || '---'
        }));
        setAuthenticators(withCodes);
      } else {
        setAuthenticators(data || []);
      }
    } catch (error) {
      console.error('Error loading authenticators:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate time remaining client-side (no API call needed)
  const getTimeRemaining = () => {
    const period = 30; // TOTP period is 30 seconds
    const now = Math.floor(Date.now() / 1000);
    return period - (now % period);
  };

  // Filter authenticators based on search query and sort by name
  useEffect(() => {
    if (viewMode === 'regular') {
      let filtered = authenticators;
      if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
        filtered = authenticators.filter(auth => 
        auth.name?.toLowerCase().includes(query) || 
        auth.url?.toLowerCase().includes(query)
      );
      }
      // Sort by name (case-insensitive)
      filtered = [...filtered].sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setFilteredAuthenticators(filtered);
    } else {
      // Filter trash entries
      let filtered = trashEntries;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filtered = trashEntries.filter(entry => 
          entry.name?.toLowerCase().includes(query) || 
          entry.url?.toLowerCase().includes(query)
        );
      }
      // Sort by name (case-insensitive)
      filtered = [...filtered].sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setFilteredTrashEntries(filtered);
    }
  }, [searchQuery, authenticators, trashEntries, viewMode]);

  useEffect(() => {
    loadAuthenticators();
  }, []);

  // WebSocket-based updates - listen for TOTP code updates from server
  useEffect(() => {
    // Update timer immediately (client-side calculation)
    const updateTimer = () => {
      setTimeRemaining(getTimeRemaining());
    };
    
    updateTimer();
    
    // Timer updates every second for smooth countdown (client-side, no API call)
    timerIntervalRef.current = setInterval(() => {
      updateTimer();
    }, 1000);
    
    // Listen for TOTP code updates via WebSocket
    const handleTOTPUpdate = (event, data) => {
      if (data && data.codes) {
        setAuthenticators((prev) =>
          prev.map((auth) => ({
            ...auth,
            currentCode: data.codes[auth.secret] || auth.currentCode || '---',
            nextCode: data.nextCodes?.[auth.secret] || auth.nextCode || '---'
          }))
        );

        if (viewMode === 'trash') {
          setTrashEntries((prev) =>
            prev.map((entry) => ({
              ...entry,
              currentCode: data.codes[entry.secret] || entry.currentCode || '---',
              nextCode: data.nextCodes?.[entry.secret] || entry.nextCode || '---'
            }))
          );
        }

        if (data.timeRemaining !== undefined) {
          setTimeRemaining(data.timeRemaining);
        }

        setUpdateKey((prev) => prev + 1);
      }
    };
    
    // Register WebSocket listener
    if (ipcRenderer && typeof ipcRenderer.on === 'function') {
      ipcRenderer.on('totp-codes-update', handleTOTPUpdate);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (ipcRenderer && typeof ipcRenderer.removeListener === 'function') {
        ipcRenderer.removeListener('totp-codes-update', handleTOTPUpdate);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticators.length, trashEntries.length, viewMode]);

  // Removed duplicate interval - code updates are now handled in the combined timer effect above

  // Helper function to authenticate user (always prompts, regardless of timeout)
  const requireAuthentication = async (action = 'perform this action') => {
    try {
      const result = await ipcRenderer.invoke('authenticate-user', `Authentication required to ${action}`);
      return result && result.authenticated;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  };

  const handleOpenModal = (auth = null) => {
    if (auth) {
      setEditingId(auth.id);
      setFormData({
        name: auth.name || '',
        secret: auth.secret || '',
        url: auth.url || '',
        username: auth.username || '',
        password: auth.password || ''
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        secret: '',
        url: '',
        username: '',
        password: ''
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({
      name: '',
      secret: '',
      url: '',
      username: '',
      password: ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Require authentication for editing (not for creating new)
    if (editingId) {
      const authenticated = await requireAuthentication('edit this authenticator');
      if (!authenticated) {
        return; // Silently cancel if authentication fails
      }
    }
    
    try {
      if (editingId) {
        await ipcRenderer.invoke('update-authenticator', editingId, formData);
      } else {
        await ipcRenderer.invoke('create-authenticator', formData);
      }
      await loadAuthenticators();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving authenticator:', error);
      alert('Error saving authenticator: ' + error.message);
    }
  };

  const handleDeleteClick = (auth) => {
    setDeleteTarget(auth);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    // Require authentication for deletion (regardless of timeout)
    const authenticated = await requireAuthentication('delete this authenticator');
    if (!authenticated) {
      // Silently cancel if authentication fails
      setShowDeleteModal(false);
      setDeleteTarget(null);
      return;
    }

    try {
      await ipcRenderer.invoke('delete-authenticator', deleteTarget.id);
      await loadAuthenticators();
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error('Error deleting authenticator:', error);
      alert('Error deleting authenticator: ' + error.message);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const handleCopyPassword = async (password) => {
    try {
      await ipcRenderer.invoke('copy-to-clipboard', password);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const handleOpenUrl = async (url) => {
    if (!url) return;
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  const handleCopyCode = async (code) => {
    try {
      await ipcRenderer.invoke('copy-to-clipboard', code);
    } catch (error) {
      console.error('Error copying code:', error);
    }
  };

  // Load trash entries
  const loadTrashEntries = async () => {
    try {
      setIsLoading(true);
      const entries = await ipcRenderer.invoke('get-trash-entries');
      // Initialize codes using batch API (single call instead of multiple)
      if (entries && entries.length > 0) {
        const secrets = entries.map(entry => entry.secret).filter(Boolean);
        let codeSets = { codes: {}, nextCodes: {} };

        if (secrets.length > 0) {
          codeSets = await ipcRenderer.invoke('get-all-totp-codes', secrets) || codeSets;
        }

        const withCodes = entries.map((entry) => ({
          ...entry,
          currentCode: codeSets.codes?.[entry.secret] || '---',
          nextCode: codeSets.nextCodes?.[entry.secret] || '---'
        }));
        setTrashEntries(withCodes);
        setFilteredTrashEntries(withCodes);
      } else {
        setTrashEntries(entries || []);
        setFilteredTrashEntries(entries || []);
      }
    } catch (error) {
      console.error('Error loading trash entries:', error);
      alert('Error loading trash entries: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle between regular and trash view
  const handleToggleView = async () => {
    if (viewMode === 'regular') {
      setViewMode('trash');
      await loadTrashEntries();
    } else {
      setViewMode('regular');
      setSearchQuery(''); // Clear search when switching views
    }
  };

  // Restore from trash
  const handleRestoreFromTrash = async (trashId) => {
    // Require authentication for restore (regardless of timeout)
    const authenticated = await requireAuthentication('restore this authenticator');
    if (!authenticated) {
      return; // Silently cancel if authentication fails
    }

    try {
      await ipcRenderer.invoke('restore-from-trash', trashId);
      await loadAuthenticators();
      await loadTrashEntries();
    } catch (error) {
      console.error('Error restoring from trash:', error);
      alert('Error restoring authenticator: ' + error.message);
    }
  };

  // Permanently delete from trash
  const handlePermanentlyDelete = async (trashId) => {
    if (!window.confirm('Are you sure you want to permanently delete this authenticator? This action cannot be undone.')) {
      return;
    }

    // Require authentication for permanent deletion (regardless of timeout)
    const authenticated = await requireAuthentication('permanently delete this authenticator');
    if (!authenticated) {
      return; // Silently cancel if authentication fails
    }

    try {
      await ipcRenderer.invoke('permanently-delete-from-trash', trashId);
      await loadTrashEntries();
    } catch (error) {
      console.error('Error permanently deleting:', error);
      alert('Error permanently deleting authenticator: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary mx-auto mb-2"></div>
          <p className="text-theme-muted text-sm">Loading authenticators...</p>
        </div>
      </div>
    );
  }

  const currentItems = viewMode === 'regular' ? filteredAuthenticators : filteredTrashEntries;
  const hasItems = viewMode === 'regular' ? authenticators.length > 0 : trashEntries.length > 0;

  const renderAuthenticatorCard = (item) => {
    const subtitle = getCardSubtitle(item);
    const progressPct = Math.max(0, Math.min(100, (timeRemaining / TOTP_PERIOD) * 100));

    return (
      <article
        key={item.id}
        className="flex min-w-[240px] flex-1 basis-[260px] max-w-full flex-col overflow-hidden rounded-xl border border-theme bg-theme-card transition-shadow hover:shadow-sm sm:max-w-[320px]"
      >
        <div className="h-1 w-full bg-theme-secondary" aria-hidden="true">
          <div
            className="h-full transition-[width,background-color] duration-1000 ease-linear"
            style={{
              width: `${progressPct}%`,
              backgroundColor: getProgressBarColor(timeRemaining)
            }}
          />
        </div>

        <div className="flex flex-1 flex-col p-3.5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold leading-tight text-theme-primary">
                {item.name}
              </h3>
              {subtitle ? (
                <p className="mt-0.5 truncate text-xs text-theme-muted">{subtitle}</p>
              ) : null}
            </div>
            <AuthenticatorCardLogo item={item} />
          </div>

          <div className="flex items-end justify-between gap-3">
            <button
              type="button"
              onClick={() => handleCopyCode(item.currentCode)}
              className="group min-w-0 text-left transition-opacity hover:opacity-80"
              title="Click to copy current code"
            >
              <span className="font-mono text-xl font-bold leading-none tracking-[0.12em] text-theme-primary sm:text-2xl">
                {formatTotpCode(item.currentCode)}
              </span>
            </button>

            <div className="shrink-0 text-right">
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-theme-muted">next</div>
              <button
                type="button"
                onClick={() => handleCopyCode(item.nextCode)}
                className="font-mono text-sm text-theme-muted transition-colors hover:text-theme-primary"
                title="Click to copy next code"
              >
                {formatTotpCode(item.nextCode)}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-0.5 border-t border-theme pt-2.5">
            {item.url ? (
              <button
                type="button"
                onClick={() => handleOpenUrl(item.url)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-blue-500 transition-colors hover:bg-blue-500/10"
                title="Open link"
              >
                <MdOpenInNew className="h-3.5 w-3.5" />
                <span className="max-w-[100px] truncate">Open</span>
              </button>
            ) : null}
            {item.username ? (
              <button
                type="button"
                onClick={() => handleCopyPassword(item.username)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-theme-primary transition-colors hover:bg-theme-secondary"
                title="Copy username"
              >
                <MdContentCopy className="h-3 w-3" />
                <span className="max-w-[80px] truncate">User</span>
              </button>
            ) : null}
            {item.password ? (
              <button
                type="button"
                onClick={() => handleCopyPassword(item.password)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-theme-primary transition-colors hover:bg-theme-secondary"
                title="Copy password"
              >
                <MdContentCopy className="h-3 w-3" />
                <span>Pass</span>
              </button>
            ) : null}

            <div className="ml-auto flex items-center gap-0.5">
              {viewMode === 'regular' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenModal(item)}
                    className="rounded-md p-1.5 text-blue-500 transition-colors hover:bg-blue-500/10"
                    title="Edit"
                  >
                    <MdEdit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteClick(item)}
                    className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-500/10"
                    title="Delete"
                  >
                    <MdDelete className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleRestoreFromTrash(item.id)}
                    className="rounded-md p-1.5 text-blue-500 transition-colors hover:bg-blue-500/10"
                    title="Restore"
                  >
                    <MdRestore className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePermanentlyDelete(item.id)}
                    className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-500/10"
                    title="Permanently delete"
                  >
                    <MdDeleteForever className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-xl font-semibold text-theme-primary">
          {viewMode === 'trash' ? 'Trash' : 'Authenticator'}
        </h2>
        <div className="flex items-center gap-3">
          {/* Search bar - show when there are items */}
          {hasItems && (
            <div className="relative">
              <MdSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-theme-muted w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name or URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-10 pr-4 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          )}
          <button
            onClick={handleToggleView}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap border ${
              viewMode === 'trash'
                ? 'bg-red-500 text-white hover:bg-red-600 border-red-500'
                : 'bg-theme-secondary text-theme-primary hover:bg-theme-card-hover border-theme'
            }`}
            title={viewMode === 'trash' ? 'Back to authenticators' : 'View deleted authenticators'}
          >
            {viewMode === 'trash' ? (
              <>
                ← Back
              </>
            ) : (
              <>
                <MdDeleteForever className="w-5 h-5" />
                Trash
              </>
            )}
          </button>
          {viewMode === 'regular' && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors whitespace-nowrap"
          >
            <MdAdd className="w-5 h-5" />
            Add New
          </button>
          )}
        </div>
      </div>

      {viewMode === 'regular' && authenticators.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-theme-muted mb-4">No authenticators found</p>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Create Your First Authenticator
          </button>
        </div>
      ) : viewMode === 'trash' && trashEntries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-theme-muted mb-4">No deleted authenticators found</p>
        </div>
      ) : currentItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-theme-muted">No items match your search</p>
        </div>
      ) : (
        <div className="flex max-h-[calc(100vh-200px)] flex-wrap content-start gap-3 overflow-y-auto pr-1">
          {currentItems.map((item) => renderAuthenticatorCard(item))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCloseModal}>
          <div className="bg-theme-primary border border-theme rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-theme-primary mb-4">
              {editingId ? 'Edit Authenticator' : 'Add New Authenticator'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded text-theme-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-1">Secret</label>
                  <input
                    type="text"
                    value={formData.secret}
                    onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                    className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded text-theme-primary font-mono"
                    placeholder="TOTP secret key — leave blank to add without a code"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-1">URL</label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded text-theme-primary"
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded text-theme-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded text-theme-primary"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 bg-theme-secondary text-theme-primary rounded-lg hover:bg-theme-card-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-theme-primary border border-theme rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-xl font-semibold text-theme-primary mb-4">Delete Authenticator</h2>
            <p className="text-theme-muted mb-6">
              Are you sure you want to delete <strong className="text-theme-primary">{deleteTarget.name}</strong>?
              <br />
              <span className="text-sm">This action will move it to trash for 30 days.</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={handleDeleteCancel}
                className="flex-1 px-4 py-2 bg-theme-secondary text-theme-primary rounded-lg hover:bg-theme-card-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Authenticator;

