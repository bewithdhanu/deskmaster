import React from 'react';

const Header = () => {
  return (
    <div 
      className="flex items-center gap-3 p-4 border-b"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottomColor: 'var(--border-color)'
      }}
    >
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
  );
};

export default Header;
