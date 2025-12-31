import React, { useState, useEffect } from 'react';
import { MdClose, MdContentCopy, MdCheck, MdRefresh } from 'react-icons/md';

const PasswordGenerator = ({ onClose }) => {
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [length, setLength] = useState(16);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  // Character sets
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  // Generate password based on current configuration
  const generatePassword = () => {
    let charset = '';
    
    if (includeUppercase) charset += uppercase;
    if (includeLowercase) charset += lowercase;
    if (includeNumbers) charset += numbers;
    if (includeSymbols) charset += symbols;

    if (charset.length === 0) {
      setPassword('');
      return;
    }

    let generated = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      generated += charset[randomIndex];
    }
    setPassword(generated);
  };

  // Generate password whenever configuration changes
  useEffect(() => {
    generatePassword();
  }, [includeUppercase, includeLowercase, includeNumbers, includeSymbols, length]);

  const handleCopy = async () => {
    if (!password) return;

    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      // Fallback: select text
      const textArea = document.createElement('textarea');
      textArea.value = password;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = () => {
    generatePassword();
  };

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4">
      {onClose && (
        <button
          onClick={() => onClose('password-generator')}
          className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
          title="Close"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}
      <h3 className="text-sm font-semibold text-theme-primary mb-3 pr-6">Password Generator</h3>
      
      <div className="space-y-3">
        {/* First Row: Configuration */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeUppercase}
              onChange={(e) => setIncludeUppercase(e.target.checked)}
              className="w-4 h-4 text-red-500 bg-theme-secondary border-theme rounded focus:ring-red-500 focus:ring-2"
            />
            <span className="text-xs text-theme-primary">Uppercase</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeLowercase}
              onChange={(e) => setIncludeLowercase(e.target.checked)}
              className="w-4 h-4 text-red-500 bg-theme-secondary border-theme rounded focus:ring-red-500 focus:ring-2"
            />
            <span className="text-xs text-theme-primary">Lowercase</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeNumbers}
              onChange={(e) => setIncludeNumbers(e.target.checked)}
              className="w-4 h-4 text-red-500 bg-theme-secondary border-theme rounded focus:ring-red-500 focus:ring-2"
            />
            <span className="text-xs text-theme-primary">Numbers</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSymbols}
              onChange={(e) => setIncludeSymbols(e.target.checked)}
              className="w-4 h-4 text-red-500 bg-theme-secondary border-theme rounded focus:ring-red-500 focus:ring-2"
            />
            <span className="text-xs text-theme-primary">Symbols</span>
          </label>
          
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-theme-primary whitespace-nowrap">Length:</label>
            <input
              type="number"
              min="4"
              max="128"
              value={length}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 4;
                setLength(Math.max(4, Math.min(128, val)));
              }}
              className="w-16 px-2 py-1 h-[32px] bg-theme-secondary border border-theme rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Second Row: Generated Password */}
        <div>
          <label className="block text-xs font-medium text-theme-primary mb-1">
            Generated Password
          </label>
          <div className="relative">
            <input
              type="text"
              value={password}
              readOnly
              onClick={handleCopy}
              placeholder="Password will appear here..."
              className="w-full px-3 py-2 pr-20 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm cursor-pointer"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={handleRegenerate}
                className="p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200"
                title="Regenerate"
              >
                <MdRefresh className="w-4 h-4" />
              </button>
              <button
                onClick={handleCopy}
                className="p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200"
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
        </div>
      </div>
    </div>
  );
};

export default PasswordGenerator;

