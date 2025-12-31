import React, { useState } from 'react';
import { MdContentCopy, MdCheck, MdClose } from 'react-icons/md';
import { getIpcRenderer } from '../../utils/electron';

const ipcRenderer = getIpcRenderer();

const BcryptHashGenerator = ({ onClose, showGenerate = true, showVerify = true, toolId }) => {
  const [textToHash, setTextToHash] = useState('');
  const [generatedHash, setGeneratedHash] = useState('');
  const [hashToVerify, setHashToVerify] = useState('');
  const [textToVerify, setTextToVerify] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!textToHash.trim()) {
      return;
    }

    setIsGenerating(true);
    try {
      const hash = await ipcRenderer.invoke('bcrypt-generate', textToHash);
      setGeneratedHash(hash);
    } catch (error) {
      console.error('Error generating hash:', error);
      alert('Error generating hash. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVerify = async () => {
    if (!hashToVerify.trim() || !textToVerify.trim()) {
      return;
    }

    setIsVerifying(true);
    try {
      const isValid = await ipcRenderer.invoke('bcrypt-verify', textToVerify, hashToVerify);
      setVerificationResult(isValid);
    } catch (error) {
      console.error('Error verifying hash:', error);
      setVerificationResult(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyHash = async () => {
    if (!generatedHash) return;

    try {
      await navigator.clipboard.writeText(generatedHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      // Fallback: select text
      const textArea = document.createElement('textarea');
      textArea.value = generatedHash;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Don't render if both are hidden
  if (!showGenerate && !showVerify) {
    return null;
  }

  return (
    <>
      {/* Generate Section */}
      {showGenerate && (
        <div className="bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4">
          {onClose && (
            <button
              onClick={() => onClose(toolId || 'bcrypt-generate')}
              className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
              title="Close"
            >
              <MdClose className="w-4 h-4" />
            </button>
          )}
          <h3 className="text-sm font-semibold text-theme-primary mb-3 pr-6">Generate Hash</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-theme-primary mb-1">
                Text to Hash
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textToHash}
                  onChange={(e) => setTextToHash(e.target.value)}
                  placeholder="Enter text to hash..."
                  className="flex-1 px-3 py-2 h-[38px] bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                />
                <button
                  onClick={handleGenerate}
                  disabled={!textToHash.trim() || isGenerating}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 whitespace-nowrap"
                >
                  {isGenerating ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>

            {generatedHash && (
              <div>
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  Generated Hash
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={generatedHash}
                    readOnly
                    className="w-full px-3 py-2 pr-9 bg-theme-secondary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-xs"
                  />
                  <button
                    onClick={handleCopyHash}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <MdCheck className="w-4 h-4 text-green-500" />
                    ) : (
                      <MdContentCopy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verify Section */}
      {showVerify && (
        <div className="bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4">
          {onClose && (
            <button
              onClick={() => onClose(toolId || 'bcrypt-verify')}
              className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
              title="Close"
            >
              <MdClose className="w-4 h-4" />
            </button>
          )}
          <h3 className="text-sm font-semibold text-theme-primary mb-3 pr-6">Verify Hash</h3>
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  Bcrypt Hash
                </label>
                <input
                  type="text"
                  value={hashToVerify}
                  onChange={(e) => setHashToVerify(e.target.value)}
                  placeholder="Hash..."
                  className="w-full px-3 py-2 h-[38px] bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  Original Text
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textToVerify}
                    onChange={(e) => setTextToVerify(e.target.value)}
                    placeholder="Text..."
                    className="flex-1 px-3 py-2 h-[38px] bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  />
                  <button
                    onClick={handleVerify}
                    disabled={!hashToVerify.trim() || !textToVerify.trim() || isVerifying}
                    className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 whitespace-nowrap"
                  >
                    {isVerifying ? '...' : 'Verify'}
                  </button>
                </div>
              </div>
            </div>

            {verificationResult !== null && (
              <div className={`p-2 rounded-lg border text-xs ${
                verificationResult
                  ? 'bg-green-500/10 border-green-500 text-green-500'
                  : 'bg-red-500/10 border-red-500 text-red-500'
              }`}>
                <p className="font-medium">
                  {verificationResult
                    ? '✓ Hash matches!'
                    : '✗ Hash does not match.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default BcryptHashGenerator;

