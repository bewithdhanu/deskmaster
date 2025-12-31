import React, { useState } from 'react';
import { MdClose, MdSearch } from 'react-icons/md';
import { getIpcRenderer } from '../../utils/electron';

const ipcRenderer = getIpcRenderer();

const IPLocationTool = ({ onClose }) => {
  const [ipInput, setIpInput] = useState('');
  const [locationData, setLocationData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showResultsModal, setShowResultsModal] = useState(false);

  const handleLookup = async () => {
    if (!ipInput.trim()) return;

    setIsLoading(true);
    setError(null);
    setLocationData([]);

    try {
      // Parse IPs from input (comma or newline separated)
      const ips = ipInput
        .split(/[,\n]/)
        .map(ip => ip.trim())
        .filter(ip => ip.length > 0);

      if (ips.length === 0) {
        setError('Please enter at least one IP address');
        setIsLoading(false);
        return;
      }

      const results = await ipcRenderer.invoke('get-ip-location', ips);
      setLocationData(results);
      setShowResultsModal(true);
      setError(null);
    } catch (error) {
      console.error('Error fetching IP location:', error);
      setError(error.message || 'Error fetching location data');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4">
      {onClose && (
        <button
          onClick={() => onClose('ip-location')}
          className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
          title="Close"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}
      <h3 className="text-sm font-semibold text-theme-primary mb-3 pr-6">IP Location Lookup</h3>
      
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-theme-primary mb-1">
            IP Address(es) - Separate by comma or new line
          </label>
          <div className="flex gap-2">
            <textarea
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
              placeholder="Enter IP address(es)..."
              className="flex-1 px-3 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none"
              rows={3}
            />
            <button
              onClick={handleLookup}
              disabled={!ipInput.trim() || isLoading}
              className="px-4 py-2 h-[38px] bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 whitespace-nowrap self-start"
            >
              {isLoading ? '...' : <MdSearch className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-2 rounded-lg border bg-red-500/10 border-red-500 text-red-500 text-xs">
            <p>{error}</p>
          </div>
        )}

        {locationData.length > 0 && (
          <button
            onClick={() => setShowResultsModal(true)}
            className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary text-xs hover:bg-theme-card-hover transition-colors duration-200"
          >
            View {locationData.length} result{locationData.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Results Modal */}
      {showResultsModal && locationData.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowResultsModal(false)}>
          <div className="bg-theme-primary border border-theme rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-theme-primary">IP Location Results</h2>
              <button
                onClick={() => setShowResultsModal(false)}
                className="p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
              >
                <MdClose className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-x-auto overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-theme">
                    <th className="text-left p-2 font-semibold text-theme-primary">IP Address</th>
                    <th className="text-left p-2 font-semibold text-theme-primary">Country</th>
                    <th className="text-left p-2 font-semibold text-theme-primary">Region</th>
                    <th className="text-left p-2 font-semibold text-theme-primary">City</th>
                    <th className="text-left p-2 font-semibold text-theme-primary">ZIP</th>
                    <th className="text-left p-2 font-semibold text-theme-primary">Coordinates</th>
                    <th className="text-left p-2 font-semibold text-theme-primary">ISP</th>
                    <th className="text-left p-2 font-semibold text-theme-primary">Organization</th>
                  </tr>
                </thead>
                <tbody>
                  {locationData.map((data, index) => (
                    <tr key={index} className="border-b border-theme/50 hover:bg-theme-secondary transition-colors">
                      <td className="p-2 text-theme-primary font-mono text-xs">{data.ip}</td>
                      {data.error ? (
                        <td colSpan="7" className="p-2 text-red-500 text-xs">
                          {data.error}
                        </td>
                      ) : (
                        <>
                          <td className="p-2 text-theme-muted text-xs">{data.country || '-'}</td>
                          <td className="p-2 text-theme-muted text-xs">{data.region || '-'}</td>
                          <td className="p-2 text-theme-muted text-xs">{data.city || '-'}</td>
                          <td className="p-2 text-theme-muted text-xs">{data.zip || '-'}</td>
                          <td className="p-2 text-theme-muted text-xs font-mono">
                            {data.lat && data.lon ? `${data.lat}, ${data.lon}` : '-'}
                          </td>
                          <td className="p-2 text-theme-muted text-xs">{data.isp || '-'}</td>
                          <td className="p-2 text-theme-muted text-xs">{data.org || '-'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IPLocationTool;

