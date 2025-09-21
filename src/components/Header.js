import React from 'react';

const { ipcRenderer } = window.require('electron');

const Header = () => {
  const handleClose = () => {
    ipcRenderer.send('hide-window');
  };

  return (
    <div className="flex justify-between items-center p-4 bg-bg-secondary border-b border-border-color">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-accent-cpu rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">DM</span>
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-primary">DeskMaster</h1>
          <p className="text-xs text-text-muted">Master Your Desktop Experience</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClose}
          className="w-8 h-8 bg-bg-card hover:bg-bg-card-hover border border-border-color rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary transition-all duration-200"
          title="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default Header;
