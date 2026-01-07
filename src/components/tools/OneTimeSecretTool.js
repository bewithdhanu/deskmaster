import React, { useState } from 'react';
import { MdClose, MdContentCopy, MdCheck, MdOpenInNew } from 'react-icons/md';
import { getIpcRenderer } from '../../utils/electron';

const ipcRenderer = getIpcRenderer();

const OneTimeSecretTool = ({ onClose }) => {
  const [secret, setSecret] = useState('');
  const [ttl, setTtl] = useState(3600); // Default 1 hour
  const [secretUrl, setSecretUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const ttlOptions = [
    { value: 300, label: '5 minutes' },
    { value: 900, label: '15 minutes' },
    { value: 1800, label: '30 minutes' },
    { value: 3600, label: '1 hour' },
    { value: 7200, label: '2 hours' },
    { value: 14400, label: '4 hours' },
    { value: 86400, label: '24 hours' }
  ];

  const handleCreateSecret = async () => {
    if (!secret.trim()) {
      setError('Please enter a secret to share');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSecretUrl('');
    setSecretKey('');

    try {
      const result = await ipcRenderer.invoke('create-onetimesecret', secret.trim(), ttl);
      setSecretUrl(result.url);
      setSecretKey(result.secretKey);
    } catch (error) {
      console.error('Error creating OneTimeSecret:', error);
      setError(error.message || 'Failed to create secret. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (text) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      // Fallback: select text
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenUrl = () => {
    if (secretUrl) {
      window.open(secretUrl, '_blank');
    }
  };

  const handleClear = () => {
    setSecret('');
    setSecretUrl('');
    setSecretKey('');
    setError(null);
  };

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4">
      {onClose && (
        <button
          onClick={() => onClose('onetimesecret')}
          className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
          title="Close"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}
      <h3 className="text-sm font-semibold text-theme-primary mb-3 pr-6">OneTimeSecret</h3>
      
      <div className="space-y-3">
        {/* Secret Input */}
        <div>
          <label className="block text-xs font-medium text-theme-primary mb-1">
            Secret to Share
          </label>
          <textarea
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter the secret text you want to share..."
            className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none"
            rows={4}
          />
        </div>

        {/* TTL Selection */}
        <div>
          <label className="block text-xs font-medium text-theme-primary mb-1">
            Time to Live (TTL)
          </label>
          <select
            value={ttl}
            onChange={(e) => setTtl(parseInt(e.target.value))}
            className="w-full px-3 py-2 h-[38px] bg-theme-secondary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
          >
            {ttlOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-2 rounded-lg border bg-red-500/10 border-red-500 text-red-500 text-xs">
            <p>{error}</p>
          </div>
        )}

        {/* Generated Secret URL */}
        {secretUrl && (
          <div>
            <label className="block text-xs font-medium text-theme-primary mb-1">
              Secret URL
            </label>
            <div className="relative">
              <input
                type="text"
                value={secretUrl}
                readOnly
                className="w-full px-3 py-2 pr-20 bg-theme-secondary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-xs font-mono break-all"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={handleOpenUrl}
                  className="p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200"
                  title="Open in browser"
                >
                  <MdOpenInNew className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleCopy(secretUrl)}
                  className="p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200"
                  title="Copy URL"
                >
                  {copied ? (
                    <MdCheck className="w-4 h-4 text-green-500" />
                  ) : (
                    <MdContentCopy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            {secretKey && (
              <p className="text-xs text-theme-muted mt-1">
                Secret Key: <span className="font-mono">{secretKey}</span>
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCreateSecret}
            disabled={!secret.trim() || isLoading}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isLoading ? 'Creating...' : 'Create Secret'}
          </button>
          <button
            onClick={handleClear}
            disabled={isLoading}
            className="px-4 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary text-sm font-medium hover:bg-theme-card-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default OneTimeSecretTool;
