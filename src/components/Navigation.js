import React from 'react';
import { MdHome, MdAccessTime, MdSettings, MdSpeed, MdContentPaste, MdSecurity, MdNotes, MdComputer, MdSmartToy } from 'react-icons/md';

const Navigation = ({ activeTab, onTabChange, uptimeKumaEnabled = true }) => {
  const menuItems = [
    {
      id: 'home',
      label: 'Home',
      icon: <MdHome className="w-5 h-5" />
    },
    {
      id: 'world-clocks',
      label: 'World Clocks',
      icon: <MdAccessTime className="w-5 h-5" />
    },
    {
      id: 'system-performance',
      label: 'Performance',
      icon: <MdSpeed className="w-5 h-5" />
    },
    {
      id: 'notes',
      label: 'Notes',
      icon: <MdNotes className="w-5 h-5" />
    },
    {
      id: 'agent',
      label: 'Agent',
      icon: <MdSmartToy className="w-5 h-5" />
    },
    {
      id: 'uptime',
      label: 'Uptime',
      icon: <MdComputer className="w-5 h-5" />
    },
    {
      id: 'clipboard',
      label: 'Clipboard',
      icon: <MdContentPaste className="w-5 h-5" />
    },
    {
      id: 'authenticator',
      label: 'Authenticator',
      icon: <MdSecurity className="w-5 h-5" />
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <MdSettings className="w-5 h-5" />
    },
  ].filter((item) => item.id !== 'uptime' || uptimeKumaEnabled);

  return (
    <div className="bg-theme-secondary border-b border-theme flex-shrink-0">
      <nav className="flex items-center px-4 h-16">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center gap-1 px-6 py-3 border-none bg-transparent text-theme-muted cursor-pointer transition-all duration-200 rounded-lg mx-1 min-w-20 ${
              activeTab === item.id 
                ? 'text-red-500 border-b-4 border-red-500 bg-transparent font-semibold' 
                : 'hover:bg-theme-card-hover hover:text-theme-primary'
            }`}
          >
            <span className="relative flex items-center justify-center flex-shrink-0 min-w-6">
              {item.icon}
            </span>
            <span className="font-medium text-xs text-center">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Navigation;
