import React from 'react';

const { ipcRenderer } = window.require('electron');

const Header = () => {
  const handleClose = () => {
    ipcRenderer.send('hide-window');
  };

  return (
    <div 
      className="flex justify-between items-center p-4 border-b"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottomColor: 'var(--border-color)'
      }}
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent-cpu)' }}
        >
          <span className="text-white font-bold text-sm">DM</span>
        </div>
        <div>
          <h1 
            className="text-lg font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            DeskMaster
          </h1>
          <p 
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Master Your Desktop Experience
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-muted)'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = 'var(--bg-card-hover)';
            e.target.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'var(--bg-card)';
            e.target.style.color = 'var(--text-muted)';
          }}
          title="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default Header;
