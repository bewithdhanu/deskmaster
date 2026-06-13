import React, { useEffect, useMemo, useState } from 'react';
import { MdChevronRight, MdClose, MdExpandMore, MdNotes } from 'react-icons/md';
import { getIpcRenderer } from '../../utils/electron';

const ipcRenderer = getIpcRenderer();

function filterPickerTree(nodes) {
  return (nodes || [])
    .filter((n) => n.id !== 'notes_archived_root')
    .map((n) => ({
      ...n,
      children: filterPickerTree(n.children)
    }));
}

function collectAncestorIds(nodes, targetId, path = []) {
  for (const n of nodes || []) {
    if (n.id === targetId) return path;
    if (n.children?.length) {
      const found = collectAncestorIds(n.children, targetId, [...path, n.id]);
      if (found) return found;
    }
  }
  return null;
}

function TreePickerRow({
  node,
  depth,
  expanded,
  selectedId,
  onSelect,
  onToggle
}) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
          isSelected ? 'bg-red-500/15 text-red-500' : 'text-theme-primary hover:bg-theme-secondary'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={0}
            className="shrink-0 text-theme-muted"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onToggle(node.id);
              }
            }}
          >
            {isExpanded ? <MdExpandMore className="h-4 w-4" /> : <MdChevronRight className="h-4 w-4" />}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <MdNotes className="h-3.5 w-3.5 shrink-0 text-theme-muted" />
        <span className="truncate">{node.title || 'Untitled'}</span>
      </button>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreePickerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SaveToNotesDialog({ open, markdown, defaultTitle, onClose, onSaved }) {
  const [tree, setTree] = useState([]);
  const [selectedParentId, setSelectedParentId] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pickerTree = useMemo(() => filterPickerTree(tree), [tree]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const ctx = await ipcRenderer.invoke('agent:get-notes-save-context');
        if (cancelled) return;
        setTree(ctx?.tree || []);
        const selected = ctx?.selectedParentId || ctx?.aiResponsesFolderId || null;
        setSelectedParentId(selected);
        const ancestors = collectAncestorIds(filterPickerTree(ctx?.tree || []), selected) || [];
        setExpanded(new Set([...ancestors, selected].filter(Boolean)));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load notes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  const handleSelect = async (id) => {
    setSelectedParentId(id);
    try {
      await ipcRenderer.invoke('agent:set-notes-save-parent', id);
    } catch {}
  };

  const handleToggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedParentId) return;
    setSaving(true);
    setError('');
    try {
      const result = await ipcRenderer.invoke('agent:save-to-notes', {
        parentId: selectedParentId,
        title: defaultTitle,
        markdown
      });
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-md flex-col rounded-xl border border-theme bg-theme-primary shadow-xl">
        <div className="flex items-center justify-between border-b border-theme px-4 py-3">
          <h2 className="text-sm font-semibold text-theme-primary">Save to Notes</h2>
          <button type="button" onClick={onClose} className="text-theme-muted hover:text-theme-primary">
            <MdClose className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-2 text-xs text-theme-muted">
          Choose where to save this message. New note will be created inside the selected page.
        </div>
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {loading && <p className="px-2 py-3 text-xs text-theme-muted">Loading notes…</p>}
          {!loading && pickerTree.length === 0 && (
            <p className="px-2 py-3 text-xs text-theme-muted">No notes found.</p>
          )}
          {!loading && pickerTree.map((node) => (
            <TreePickerRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              selectedId={selectedParentId}
              onSelect={handleSelect}
              onToggle={handleToggle}
            />
          ))}
        </div>
        {error && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-theme px-4 py-3">
          <button type="button" className="btn btn-secondary text-xs" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary text-xs"
            onClick={handleSave}
            disabled={saving || !selectedParentId || loading}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
