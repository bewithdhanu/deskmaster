import React, { useEffect, useRef, useState } from 'react';
import { MdClose, MdMinimize, MdCropSquare, MdFilterNone } from 'react-icons/md';
import { getIpcRenderer } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

const TabBar = ({ tabs, activeId, onFocus, onClose, onReorder, onCloseOthers, onCloseToRight, onCloseAll }) => {
  const [maximized, setMaximized] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, tabId }
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    ipcRenderer.invoke('window-is-maximized').then((v) => {
      if (!cancelled) setMaximized(Boolean(v));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setMenu(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const windowAction = async (action) => {
    if (action === 'minimize') await ipcRenderer.invoke('window-minimize');
    if (action === 'maximize') {
      const next = await ipcRenderer.invoke('window-maximize');
      setMaximized(Boolean(next));
    }
    if (action === 'close') await ipcRenderer.invoke('window-close');
  };

  const openContextMenu = (e, tab) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id, pinned: tab.pinned });
  };

  const runMenu = (action) => {
    if (!menu) return;
    const { tabId } = menu;
    setMenu(null);
    if (action === 'close') onClose(tabId);
    if (action === 'close-others') onCloseOthers?.(tabId);
    if (action === 'close-right') onCloseToRight?.(tabId);
    if (action === 'close-all') onCloseAll?.();
  };

  const onDragStart = (e, tab) => {
    if (tab.pinned) {
      e.preventDefault();
      return;
    }
    setDragId(tab.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.id);
  };

  const onDragOver = (e, tab) => {
    if (tab.pinned || !dragId || dragId === tab.id) return;
    e.preventDefault();
    setDragOverId(tab.id);
  };

  const onDrop = (e, tab) => {
    e.preventDefault();
    if (tab.pinned || !dragId || dragId === tab.id) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    onReorder?.(dragId, tab.id);
    setDragId(null);
    setDragOverId(null);
  };

  const onDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <div
      className="relative flex h-11 flex-shrink-0 items-stretch border-b border-theme bg-theme-secondary"
      style={{ WebkitAppRegion: 'drag' }}
      onDoubleClick={() => windowAction('maximize')}
    >
      {/* macOS-style window controls (frameless) */}
      <div
        className="flex flex-shrink-0 items-center gap-1.5 pl-3 pr-2"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <button
          type="button"
          onClick={() => windowAction('close')}
          className="flex h-3 w-3 items-center justify-center rounded-full border-none bg-[#ff5f57] cursor-pointer hover:brightness-110"
          title="Close"
          aria-label="Close window"
        />
        <button
          type="button"
          onClick={() => windowAction('minimize')}
          className="flex h-3 w-3 items-center justify-center rounded-full border-none bg-[#febc2e] cursor-pointer hover:brightness-110"
          title="Minimize"
          aria-label="Minimize window"
        />
        <button
          type="button"
          onClick={() => windowAction('maximize')}
          className="flex h-3 w-3 items-center justify-center rounded-full border-none bg-[#28c840] cursor-pointer hover:brightness-110"
          title={maximized ? 'Restore' : 'Maximize'}
          aria-label={maximized ? 'Restore window' : 'Maximize window'}
        />
      </div>

      <div
        className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-1"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const dragging = dragId === tab.id;
          const over = dragOverId === tab.id;
          return (
            <div
              key={tab.id}
              draggable={!tab.pinned}
              onDragStart={(e) => onDragStart(e, tab)}
              onDragOver={(e) => onDragOver(e, tab)}
              onDrop={(e) => onDrop(e, tab)}
              onDragEnd={onDragEnd}
              onContextMenu={(e) => openContextMenu(e, tab)}
              className={`group relative flex max-w-[180px] min-w-[96px] flex-shrink-0 items-center rounded-t-md ${
                active
                  ? 'bg-theme-primary text-theme-primary'
                  : 'bg-transparent text-theme-muted hover:bg-theme-card-hover hover:text-theme-primary'
              } ${dragging ? 'opacity-50' : ''} ${over ? 'ring-1 ring-red-500/60' : ''}`}
            >
              <button
                type="button"
                onClick={() => onFocus(tab.id)}
                onMouseDown={(e) => {
                  if (e.button === 1 && !tab.pinned) {
                    e.preventDefault();
                    onClose(tab.id);
                  }
                }}
                className="min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent px-3 py-2 text-left text-xs font-medium"
                title={tab.title}
              >
                {tab.title}
              </button>
              {!tab.pinned ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.id);
                  }}
                  className={`mr-1 flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded border-none ${
                    active
                      ? 'text-theme-muted hover:bg-theme-card hover:text-theme-primary'
                      : 'text-transparent group-hover:text-theme-muted hover:bg-theme-card hover:text-theme-primary'
                  }`}
                  title="Close tab"
                  aria-label={`Close ${tab.title}`}
                >
                  <MdClose className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {active ? (
                <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-red-500" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Extra window controls on the right for discoverability */}
      <div
        className="flex flex-shrink-0 items-center gap-0.5 pr-2"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <button
          type="button"
          onClick={() => windowAction('minimize')}
          className="flex h-7 w-8 cursor-pointer items-center justify-center rounded border-none bg-transparent text-theme-muted hover:bg-theme-card-hover hover:text-theme-primary"
          title="Minimize"
        >
          <MdMinimize className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => windowAction('maximize')}
          className="flex h-7 w-8 cursor-pointer items-center justify-center rounded border-none bg-transparent text-theme-muted hover:bg-theme-card-hover hover:text-theme-primary"
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <MdFilterNone className="h-3.5 w-3.5" /> : <MdCropSquare className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => windowAction('close')}
          className="flex h-7 w-8 cursor-pointer items-center justify-center rounded border-none bg-transparent text-theme-muted hover:bg-red-500 hover:text-white"
          title="Close"
        >
          <MdClose className="h-4 w-4" />
        </button>
      </div>

      {menu ? (
        <div
          ref={menuRef}
          className="fixed z-[200] min-w-[180px] rounded-lg border border-theme bg-theme-primary py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y, WebkitAppRegion: 'no-drag' }}
        >
          {!menu.pinned ? (
            <button type="button" className="block w-full cursor-pointer border-none bg-transparent px-3 py-1.5 text-left text-xs text-theme-primary hover:bg-theme-card-hover" onClick={() => runMenu('close')}>
              Close
            </button>
          ) : null}
          <button type="button" className="block w-full cursor-pointer border-none bg-transparent px-3 py-1.5 text-left text-xs text-theme-primary hover:bg-theme-card-hover" onClick={() => runMenu('close-others')}>
            Close other tabs
          </button>
          <button type="button" className="block w-full cursor-pointer border-none bg-transparent px-3 py-1.5 text-left text-xs text-theme-primary hover:bg-theme-card-hover" onClick={() => runMenu('close-right')}>
            Close tabs to the right
          </button>
          <button type="button" className="block w-full cursor-pointer border-none bg-transparent px-3 py-1.5 text-left text-xs text-theme-primary hover:bg-theme-card-hover" onClick={() => runMenu('close-all')}>
            Close all tabs
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default TabBar;
