import React, { useState } from 'react';
import { MdHome, MdAccessTime, MdSettings, MdSpeed, MdContentPaste, MdSecurity, MdNotes, MdComputer, MdSmartToy, MdPerson, MdChevronLeft, MdChevronRight } from 'react-icons/md';

const Navigation = ({ activeTab, onTabChange, uptimeKumaEnabled = true }) => {
  // Icons-only by default; expand to show labels
  const [expanded, setExpanded] = useState(false);

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
      id: 'fake-identity',
      label: 'Fake Identity',
      icon: <MdPerson className="w-5 h-5" />
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <MdSettings className="w-5 h-5" />
    },
  ].filter((item) => item.id !== 'uptime' || uptimeKumaEnabled);

  return (
    <div
      className={`bg-theme-secondary border-r border-theme flex-shrink-0 flex flex-col h-full transition-[width] duration-200 ${
        expanded ? 'w-48' : 'w-14'
      }`}
    >
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 flex flex-col gap-1">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={expanded ? undefined : item.label}
              className={`flex items-center gap-3 border-none cursor-pointer transition-all duration-200 rounded-lg ${
                expanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'
              } ${
                isActive
                  ? 'text-red-500 bg-theme-card font-semibold'
                  : 'bg-transparent text-theme-muted hover:bg-theme-card-hover hover:text-theme-primary'
              }`}
            >
              <span className="relative flex items-center justify-center flex-shrink-0 w-6">
                {item.icon}
              </span>
              {expanded ? (
                <span className="font-medium text-sm whitespace-nowrap truncate">{item.label}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-theme p-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Collapse menu' : 'Expand menu'}
          className={`w-full flex items-center border-none bg-transparent text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover cursor-pointer transition-all duration-200 rounded-lg ${
            expanded ? 'px-3 py-2.5 gap-3' : 'px-0 py-2.5 justify-center'
          }`}
        >
          <span className="flex items-center justify-center w-6 flex-shrink-0">
            {expanded ? <MdChevronLeft className="w-5 h-5" /> : <MdChevronRight className="w-5 h-5" />}
          </span>
          {expanded ? <span className="font-medium text-sm">Collapse</span> : null}
        </button>
      </div>
    </div>
  );
};

export default Navigation;
