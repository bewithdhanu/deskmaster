import React, { useState, useEffect } from 'react';
import { MdContentCopy, MdCheck, MdClose, MdRefresh } from 'react-icons/md';
import { getIpcRenderer } from '../../utils/electron';

const ipcRenderer = getIpcRenderer();

const PublicIPTool = ({ onClose }) => {
  const [publicIP, setPublicIP] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchPublicIP = async () => {
    setIsLoading(true);
    try {
      const ip = await ipcRenderer.invoke('get-public-ip');
      setPublicIP(ip);
    } catch (error) {
      console.error('Error fetching public IP:', error);
      setPublicIP('Error fetching IP');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicIP();
  }, []);

  const handleCopy = async () => {
    if (!publicIP) return;

    try {
      await navigator.clipboard.writeText(publicIP);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      const textArea = document.createElement('textarea');
      textArea.value = publicIP;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4">
      {onClose && (
        <button
          onClick={() => onClose('public-ip')}
          className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
          title="Close"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}
      <h3 className="text-sm font-semibold text-theme-primary mb-3 pr-6">Public IP Address</h3>
      
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={isLoading ? 'Loading...' : publicIP}
              readOnly
              className="w-full px-3 py-2 pr-9 h-[38px] bg-theme-secondary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
            />
            <button
              onClick={handleCopy}
              disabled={!publicIP || isLoading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200 disabled:opacity-50"
              title="Copy to clipboard"
            >
              {copied ? (
                <MdCheck className="w-4 h-4 text-green-500" />
              ) : (
                <MdContentCopy className="w-4 h-4" />
              )}
            </button>
          </div>
          <button
            onClick={fetchPublicIP}
            disabled={isLoading}
            className="px-4 py-2 h-[38px] bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 whitespace-nowrap"
            title="Refresh IP"
          >
            <MdRefresh className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublicIPTool;

