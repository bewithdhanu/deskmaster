import React, { useState, useEffect } from 'react';
import { MdContentCopy, MdCheck, MdSearch, MdRefresh, MdDelete, MdClose, MdVisibility } from 'react-icons/md';
import { getIpcRenderer } from '../utils/electron';
import moment from 'moment';

const ipcRenderer = getIpcRenderer();

const ClipboardHistory = () => {
  const [clipboardHistory, setClipboardHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null);

  const loadClipboardHistory = async () => {
    try {
      setIsLoading(true);
      let history;
      if (searchQuery.trim()) {
        history = await ipcRenderer.invoke('search-clipboard-history', searchQuery.trim(), 333);
      } else {
        history = await ipcRenderer.invoke('get-clipboard-history', 333);
      }
      setClipboardHistory(history || []);
    } catch (error) {
      console.error('Error loading clipboard history:', error);
      setClipboardHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClipboardHistory();
    
    // Listen for clipboard updates via WebSocket instead of polling
    const handleClipboardUpdate = () => {
      loadClipboardHistory();
    };
    
    // Register WebSocket listener
    if (ipcRenderer && typeof ipcRenderer.on === 'function') {
      ipcRenderer.on('clipboard-updated', handleClipboardUpdate);
    }

    return () => {
      if (ipcRenderer && typeof ipcRenderer.removeListener === 'function') {
        ipcRenderer.removeListener('clipboard-updated', handleClipboardUpdate);
      }
    };
  }, [searchQuery]);

  const handleCopy = async (text, id) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      // Fallback: select text
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = async (id) => {
    try {
      await ipcRenderer.invoke('delete-clipboard-entry', id);
      loadClipboardHistory();
    } catch (error) {
      console.error('Error deleting clipboard entry:', error);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all clipboard history?')) {
      try {
        await ipcRenderer.invoke('clear-clipboard-history');
        loadClipboardHistory();
      } catch (error) {
        console.error('Error clearing clipboard history:', error);
      }
    }
  };

  const formatTimestamp = (timestamp) => {
    return moment(timestamp).format('MMM DD, HH:mm');
  };

  const truncateText = (text, maxLength = 150) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const isTruncated = (text, maxLength = 150) => {
    return text && text.length > maxLength;
  };

  const handleView = (entry) => {
    setViewingEntry(entry);
  };

  const handleCloseView = () => {
    setViewingEntry(null);
  };

  return (
    <div className="h-full flex flex-col bg-theme-primary p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-theme-primary">Clipboard History</h1>
        <div className="flex items-center gap-2">
          {clipboardHistory.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 text-sm"
              title="Clear all"
            >
              <MdDelete className="w-4 h-4" />
              Clear All
            </button>
          )}
          <button
            onClick={loadClipboardHistory}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary hover:bg-theme-card-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            title="Refresh"
          >
            <MdRefresh className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clipboard history..."
            className="w-full pl-10 pr-4 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Clipboard List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && clipboardHistory.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-theme-muted">Loading clipboard history...</div>
          </div>
        ) : clipboardHistory.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-theme-muted">
              {searchQuery ? 'No clipboard entries found matching your search.' : 'No clipboard history yet. Start copying text to see it here.'}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {clipboardHistory.map((entry) => (
              <div
                key={entry.id}
                className="bg-theme-card border border-theme rounded-lg px-3 py-2 hover:border-red-500 transition-colors duration-200 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className="text-xs font-medium text-theme-muted whitespace-nowrap">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span className="text-xs text-theme-muted">•</span>
                  <span className="text-xs font-medium text-red-500 whitespace-nowrap">
                    {entry.source || 'System'}
                  </span>
                  <span className="text-xs text-theme-muted">•</span>
                  <span className="text-sm text-theme-primary truncate flex-1">
                    {truncateText(entry.content, 150)}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isTruncated(entry.content, 150) && (
                    <button
                      onClick={() => handleView(entry)}
                      className="p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200"
                      title="View full content"
                    >
                      <MdVisibility className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleCopy(entry.content, entry.id)}
                    className="p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200"
                    title="Copy to clipboard"
                  >
                    {copiedId === entry.id ? (
                      <MdCheck className="w-4 h-4 text-green-500" />
                    ) : (
                      <MdContentCopy className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="p-1.5 text-theme-muted hover:text-red-500 transition-colors duration-200"
                    title="Delete entry"
                  >
                    <MdClose className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with count */}
      {clipboardHistory.length > 0 && (
        <div className="mt-4 text-xs text-theme-muted text-center">
          Showing {clipboardHistory.length} {clipboardHistory.length === 1 ? 'entry' : 'entries'} 
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      )}

      {/* View Modal */}
      {viewingEntry && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={handleCloseView}
        >
          <div 
            className="bg-theme-primary border border-theme rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-theme">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-theme-primary">Clipboard Content</h2>
                <span className="text-xs text-theme-muted">
                  {formatTimestamp(viewingEntry.timestamp)}
                </span>
                <span className="text-xs text-theme-muted">•</span>
                <span className="text-xs font-medium text-red-500">
                  {viewingEntry.source || 'System'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(viewingEntry.content, viewingEntry.id)}
                  className="p-2 text-theme-muted hover:text-theme-primary transition-colors duration-200"
                  title="Copy to clipboard"
                >
                  {copiedId === viewingEntry.id ? (
                    <MdCheck className="w-5 h-5 text-green-500" />
                  ) : (
                    <MdContentCopy className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={handleCloseView}
                  className="p-2 text-theme-muted hover:text-theme-primary transition-colors duration-200"
                  title="Close"
                >
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap break-words text-sm text-theme-primary font-mono bg-theme-secondary p-4 rounded-lg border border-theme">
                {viewingEntry.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClipboardHistory;

