import React, { useState, useEffect, useRef } from 'react';
import { MdAdd, MdEdit, MdDelete, MdContentCopy, MdOpenInNew, MdSearch, MdDeleteForever, MdRestore } from 'react-icons/md';
import { getIpcRenderer } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

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
      // Initialize codes using batch API (single call instead of multiple)
      if (data && data.length > 0) {
        const secrets = data.map(auth => auth.secret).filter(Boolean);
        let codesMap = {};
        
        if (secrets.length > 0) {
          codesMap = await ipcRenderer.invoke('get-all-totp-codes', secrets) || {};
        }
        
        const withCodes = data.map((auth) => ({
          ...auth,
          currentCode: codesMap[auth.secret] || '---'
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
        // Update codes for regular authenticators
        const updated = authenticators.map((auth) => ({
          ...auth,
          currentCode: data.codes[auth.secret] || auth.currentCode || '---'
        }));
        setAuthenticators(updated);
        
        // Update codes for trash entries if in trash view
        if (viewMode === 'trash' && trashEntries.length > 0) {
          const updatedTrash = trashEntries.map((entry) => ({
            ...entry,
            currentCode: data.codes[entry.secret] || entry.currentCode || '---'
          }));
          setTrashEntries(updatedTrash);
        }
        
        // Update time remaining from server
        if (data.timeRemaining !== undefined) {
          setTimeRemaining(data.timeRemaining);
        }
        
        setUpdateKey(prev => prev + 1); // Force re-render
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
      await ipcRenderer.invoke('open-external-url', url);
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
        let codesMap = {};
        
        if (secrets.length > 0) {
          codesMap = await ipcRenderer.invoke('get-all-totp-codes', secrets) || {};
        }
        
        const withCodes = entries.map((entry) => ({
          ...entry,
          currentCode: codesMap[entry.secret] || '---'
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
        <div className="bg-theme-card border border-theme rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-theme bg-theme-secondary">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-theme-primary">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-theme-primary">URL</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-theme-primary">Username</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-theme-primary">Password</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-theme-primary">
                    Code ({timeRemaining}s)
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-theme-primary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((item) => (
                  <tr key={item.id} className="border-b border-theme hover:bg-theme-secondary transition-colors">
                    <td className="px-3 py-2 text-sm text-theme-primary">{item.name}</td>
                    <td className="px-3 py-2">
                      {item.url ? (
                        <button
                          onClick={() => handleOpenUrl(item.url)}
                          className="flex items-center gap-1 text-blue-500 hover:text-blue-600 transition-colors text-sm"
                        >
                          <MdOpenInNew className="w-3 h-3" />
                          <span className="truncate max-w-xs">{item.url}</span>
                        </button>
                      ) : (
                        <span className="text-theme-muted text-sm">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.username ? (
                        <button
                          onClick={() => handleCopyPassword(item.username)}
                          className="flex items-center gap-1 text-theme-primary hover:text-red-500 transition-colors text-sm"
                          title="Click to copy username"
                        >
                          <span className="text-sm">{item.username}</span>
                          <MdContentCopy className="w-3 h-3 flex-shrink-0" />
                        </button>
                      ) : (
                        <span className="text-theme-muted text-sm">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.password ? (
                        <button
                          onClick={() => handleCopyPassword(item.password)}
                          className="flex items-center gap-1 text-theme-primary hover:text-red-500 transition-colors text-sm"
                          title="Click to copy password"
                        >
                          <MdContentCopy className="w-3 h-3" />
                          <span className="font-mono">••••••••</span>
                        </button>
                      ) : (
                        <span className="text-theme-muted text-sm">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleCopyCode(item.currentCode)}
                        className="flex items-center gap-1 text-theme-primary hover:text-red-500 transition-colors cursor-pointer"
                        title="Click to copy code"
                      >
                        <span className="font-mono text-base font-semibold">
                          {item.currentCode || '---'}
                        </span>
                        <MdContentCopy className="w-3 h-3 flex-shrink-0" />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {viewMode === 'regular' ? (
                          <>
                        <button
                              onClick={() => handleOpenModal(item)}
                          className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded transition-colors"
                          title="Edit"
                        >
                          <MdEdit className="w-3.5 h-3.5" />
                        </button>
                        <button
                              onClick={() => handleDeleteClick(item)}
                          className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete"
                        >
                          <MdDelete className="w-3.5 h-3.5" />
                        </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleRestoreFromTrash(item.id)}
                              className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded transition-colors"
                              title="Restore"
                            >
                              <MdRestore className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handlePermanentlyDelete(item.id)}
                              className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                              title="Permanently delete"
                            >
                              <MdDeleteForever className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  <label className="block text-sm font-medium text-theme-primary mb-1">Secret *</label>
                  <input
                    type="text"
                    value={formData.secret}
                    onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                    className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded text-theme-primary font-mono"
                    required
                    placeholder="TOTP secret key"
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

