import React, { useState } from 'react';
import { MdClose, MdRefresh, MdArrowDropDown, MdContentCopy, MdCheck } from 'react-icons/md';
import { getIpcRenderer } from '../../utils/electron';

const ipcRenderer = getIpcRenderer();

const TextReformatTool = ({ onClose }) => {
  const [mode, setMode] = useState('reformat'); // 'reformat' or 'translate'
  const [targetLanguage, setTargetLanguage] = useState('');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [isHoveringOutput, setIsHoveringOutput] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleProcess = async () => {
    if (!inputText.trim()) {
      setError(`Please enter some text to ${mode === 'reformat' ? 'reformat' : 'translate'}`);
      return;
    }

    if (mode === 'translate' && !targetLanguage.trim()) {
      setError('Please enter a target language');
      return;
    }

    setIsLoading(true);
    setError(null);
    setOutputText('');

    try {
      let result;
      if (mode === 'reformat') {
        result = await ipcRenderer.invoke('reformat-text', inputText);
      } else {
        result = await ipcRenderer.invoke('translate-text', inputText, targetLanguage);
      }
      setOutputText(result);
      setError(null);
    } catch (error) {
      console.error(`Error ${mode === 'reformat' ? 'reformatting' : 'translating'} text:`, error);
      setError(error.message || `Error ${mode === 'reformat' ? 'reformatting' : 'translating'} text. Please check your API key in settings.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setError(null);
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setShowModeDropdown(false);
    setOutputText(''); // Clear output when switching modes
    setError(null);
  };

  const handleCopyOutput = async () => {
    if (!outputText) return;

    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      // Fallback: select text
      const textArea = document.createElement('textarea');
      textArea.value = outputText;
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
          onClick={() => onClose('text-reformat')}
          className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
          title="Close"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-center justify-between mb-3 pr-6">
        <div className="relative">
          <button
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            className="flex items-center gap-1 text-sm font-semibold text-theme-primary hover:text-red-500 transition-colors duration-200"
          >
            {mode === 'reformat' ? 'Text Reformat' : 'Translator'} (ChatGPT)
            <MdArrowDropDown className={`w-4 h-4 transition-transform duration-200 ${showModeDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showModeDropdown && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowModeDropdown(false)}
              />
              <div className="absolute top-full left-0 mt-1 bg-theme-primary border border-theme rounded-lg shadow-lg z-20 min-w-[180px]">
                <button
                  onClick={() => handleModeChange('reformat')}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-theme-secondary transition-colors duration-200 ${
                    mode === 'reformat' ? 'text-red-500 font-medium' : 'text-theme-primary'
                  }`}
                >
                  Text Reformat
                </button>
                <button
                  onClick={() => handleModeChange('translate')}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-theme-secondary transition-colors duration-200 ${
                    mode === 'translate' ? 'text-red-500 font-medium' : 'text-theme-primary'
                  }`}
                >
                  Translator
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Input Text Area */}
          <div className="flex flex-col h-[280px]">
            <label className="block text-xs font-medium text-theme-primary mb-1">
              Input Text
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={mode === 'reformat' ? 'Enter text to reformat...' : 'Enter text to translate...'}
              className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none flex-1"
              rows={10}
            />
          </div>

          {/* Output Text Area */}
          <div className="flex flex-col h-[280px]">
            {mode === 'translate' && (
              <div className="mb-2">
                <label className="block text-xs font-medium text-theme-primary mb-1">
                  Target Language
                </label>
                <input
                  type="text"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  placeholder="e.g., Spanish, French, German..."
                  className="w-full px-3 py-2 h-[38px] bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                />
              </div>
            )}
            <label className="block text-xs font-medium text-theme-primary mb-1">
              {mode === 'reformat' ? 'Reformatted Text' : 'Translated Text'}
            </label>
            <div 
              className="relative flex-1"
              onMouseEnter={() => setIsHoveringOutput(true)}
              onMouseLeave={() => setIsHoveringOutput(false)}
            >
              <textarea
                value={outputText}
                readOnly
                placeholder={mode === 'reformat' ? 'Reformatted text will appear here...' : 'Translated text will appear here...'}
                className="w-full h-full px-3 py-2 pr-9 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-muted text-sm resize-none"
                rows={mode === 'translate' ? 8 : 10}
              />
              {isHoveringOutput && outputText && (
                <button
                  onClick={handleCopyOutput}
                  className="absolute right-2 top-2 p-1.5 text-theme-muted hover:text-theme-primary transition-colors duration-200 bg-theme-secondary/80 hover:bg-theme-secondary rounded"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <MdCheck className="w-4 h-4 text-green-500" />
                  ) : (
                    <MdContentCopy className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-2 rounded-lg border bg-red-500/10 border-red-500 text-red-500 text-xs">
            <p>{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleProcess}
            disabled={!inputText.trim() || isLoading || (mode === 'translate' && !targetLanguage.trim())}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <MdRefresh className="w-4 h-4 animate-spin" />
                {mode === 'reformat' ? 'Reformatting...' : 'Translating...'}
              </>
            ) : (
              mode === 'reformat' ? 'Reformat Text' : 'Translate Text'
            )}
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

export default TextReformatTool;

