import React, { useState, useEffect } from 'react';
import { MdClose, MdPlayArrow, MdStop, MdSettings, MdContentCopy, MdCheck } from 'react-icons/md';
import { getIpcRenderer } from '../../utils/electron';

const ipcRenderer = getIpcRenderer();

const PinggyTunnelTool = ({ onClose }) => {
  const [port, setPort] = useState('');
  const [provider, setProvider] = useState('pinggy');
  const [instances, setInstances] = useState([]);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState({
    http: true,
    https: true,
    debug: true,
    tcp: false
  });
  const [isStarting, setIsStarting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    loadInstances();

    const handleUpdate = () => {
      loadInstances();
    };

    if (ipcRenderer && typeof ipcRenderer.on === 'function') {
      ipcRenderer.on('pinggy-instance-updated', handleUpdate);

      return () => {
        if (ipcRenderer && typeof ipcRenderer.removeListener === 'function') {
          ipcRenderer.removeListener('pinggy-instance-updated', handleUpdate);
        }
      };
    }

    const interval = setInterval(() => {
      loadInstances();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timerInterval);
  }, []);

  const formatTime = (seconds) => {
    if (seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const loadInstances = async () => {
    try {
      const runningInstances = await ipcRenderer.invoke('get-pinggy-instances');
      setInstances(runningInstances || []);
    } catch (error) {
      console.error('Error loading instances:', error);
    }
  };

  const handleStart = async () => {
    if (!port.trim() || isNaN(parseInt(port))) {
      alert('Please enter a valid port number');
      return;
    }

    setIsStarting(true);
    setStatusMessage(
      provider === 'cloudflared'
        ? 'Starting Cloudflare tunnel (may download cloudflared once)…'
        : 'Starting Pinggy tunnel…'
    );
    try {
      if (provider === 'cloudflared') {
        await ipcRenderer.invoke('start-cloudflared-tunnel', {
          port: parseInt(port, 10)
        });
      } else {
        await ipcRenderer.invoke('start-pinggy-tunnel', {
          port: parseInt(port, 10),
          options
        });
      }
      setPort('');
      setShowOptions(false);
      setStatusMessage('');
      await loadInstances();
    } catch (error) {
      console.error('Error starting tunnel:', error);
      alert(error.message || 'Failed to start tunnel');
      setStatusMessage('');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async (instanceId) => {
    try {
      await ipcRenderer.invoke('stop-pinggy-tunnel', instanceId);
      await loadInstances();
    } catch (error) {
      console.error('Error stopping tunnel:', error);
      alert(error.message || 'Failed to stop tunnel');
    }
  };

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4">
      {onClose && (
        <button
          onClick={() => onClose('pinggy')}
          className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
          title="Close"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}
      <h3 className="text-sm font-semibold text-theme-primary mb-3 pr-6">Tunnel</h3>

      <div className="space-y-3">
        <div className="flex gap-1 p-0.5 bg-theme-secondary border border-theme rounded-lg">
          <button
            type="button"
            onClick={() => setProvider('pinggy')}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              provider === 'pinggy'
                ? 'bg-red-500 text-white'
                : 'text-theme-muted hover:text-theme-primary'
            }`}
          >
            Pinggy
          </button>
          <button
            type="button"
            onClick={() => setProvider('cloudflared')}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              provider === 'cloudflared'
                ? 'bg-red-500 text-white'
                : 'text-theme-muted hover:text-theme-primary'
            }`}
          >
            Cloudflare
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-theme-primary mb-1">
            Local Port
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="e.g., 3000, 8080"
              className="flex-1 px-3 py-2 h-[38px] bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            />
            {provider === 'pinggy' && (
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="px-3 py-2 h-[38px] bg-theme-secondary border border-theme rounded-lg text-theme-primary hover:bg-theme-card-hover transition-colors duration-200"
                title="Options"
              >
                <MdSettings className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleStart}
              disabled={!port.trim() || isStarting}
              className="px-4 py-2 h-[38px] bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 whitespace-nowrap"
            >
              {isStarting ? 'Starting...' : <><MdPlayArrow className="w-4 h-4 inline mr-1" />Start</>}
            </button>
          </div>
          {statusMessage ? (
            <p className="mt-1.5 text-[11px] text-theme-muted">{statusMessage}</p>
          ) : null}
        </div>

        {provider === 'pinggy' && showOptions && (
          <div className="p-3 bg-theme-secondary border border-theme rounded-lg space-y-2">
            <div className="text-xs font-medium text-theme-primary mb-2">Tunnel Options</div>
            <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer">
              <input
                type="checkbox"
                checked={options.http}
                onChange={(e) => setOptions({ ...options, http: e.target.checked })}
                className="w-4 h-4"
              />
              HTTP Tunnel
            </label>
            <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer">
              <input
                type="checkbox"
                checked={options.https}
                onChange={(e) => setOptions({ ...options, https: e.target.checked })}
                className="w-4 h-4"
              />
              HTTPS Tunnel
            </label>
            <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer">
              <input
                type="checkbox"
                checked={options.debug}
                onChange={(e) => setOptions({ ...options, debug: e.target.checked })}
                className="w-4 h-4"
              />
              Debug Page
            </label>
            <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer">
              <input
                type="checkbox"
                checked={options.tcp}
                onChange={(e) => setOptions({ ...options, tcp: e.target.checked })}
                className="w-4 h-4"
              />
              TCP Tunnel
            </label>
          </div>
        )}

        {instances.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-theme-primary">Running Tunnels</div>
            {instances.map((instance) => {
              const isCloudflare = instance.provider === 'cloudflared';
              const remaining = !isCloudflare && instance.startTime
                ? Math.max(0, 3600 - Math.floor((currentTime - instance.startTime) / 1000))
                : null;
              const isExpiring = remaining !== null && remaining < 300;
              const isExpired = remaining === 0;

              return (
                <div key={instance.id} className="p-3 bg-theme-secondary border border-theme rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-xs font-semibold text-theme-primary">
                        Port {instance.port}
                      </div>
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-theme text-theme-muted">
                        {isCloudflare ? 'Cloudflare' : 'Pinggy'}
                      </span>
                      {remaining !== null && (
                        <div className={`text-xs font-mono px-2 py-0.5 rounded ${
                          isExpired
                            ? 'bg-red-500/30 text-red-500 border border-red-500'
                            : isExpiring
                              ? 'bg-red-500/20 text-red-500 border border-red-500/50'
                              : 'bg-theme-primary/10 text-theme-muted border border-theme'
                        }`}>
                          {formatTime(remaining)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleStop(instance.id)}
                      className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors duration-200 flex items-center gap-1"
                    >
                      <MdStop className="w-3 h-3" />
                      Stop
                    </button>
                  </div>

                  <div className="space-y-1">
                    {instance.urls?.https && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-theme-muted w-12">HTTPS:</span>
                        <input
                          type="text"
                          value={instance.urls.https}
                          readOnly
                          className="flex-1 px-2 py-1 bg-theme-primary border border-theme rounded text-xs font-mono text-theme-primary"
                        />
                        <CopyButton text={instance.urls.https} />
                      </div>
                    )}
                    {instance.urls?.http && instance.urls.http !== instance.urls.https && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-theme-muted w-12">HTTP:</span>
                        <input
                          type="text"
                          value={instance.urls.http}
                          readOnly
                          className="flex-1 px-2 py-1 bg-theme-primary border border-theme rounded text-xs font-mono text-theme-primary"
                        />
                        <CopyButton text={instance.urls.http} />
                      </div>
                    )}
                    {instance.urls?.debug && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-theme-muted w-12">Debug:</span>
                        <input
                          type="text"
                          value={instance.urls.debug}
                          readOnly
                          className="flex-1 px-2 py-1 bg-theme-primary border border-theme rounded text-xs font-mono text-theme-primary"
                        />
                        <CopyButton text={instance.urls.debug} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying:', error);
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

  return (
    <button
      onClick={handleCopy}
      className="p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
      title="Copy to clipboard"
    >
      {copied ? (
        <MdCheck className="w-4 h-4 text-green-500" />
      ) : (
        <MdContentCopy className="w-4 h-4" />
      )}
    </button>
  );
};

export default PinggyTunnelTool;
