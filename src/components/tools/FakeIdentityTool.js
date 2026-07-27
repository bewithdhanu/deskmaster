import React, { useEffect, useMemo, useState } from 'react';
import { MdAdd, MdClose, MdContentCopy, MdCheck, MdDelete, MdPerson, MdRefresh } from 'react-icons/md';
import { generateFakeIdentity } from '../../utils/textLlmClient';
import { getIpcRenderer } from '../../utils/electron';
import { navigate } from '../../utils/appRoute';

const ipcRenderer = getIpcRenderer();

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'India',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Ireland',
  'Switzerland',
  'Austria',
  'Belgium',
  'Portugal',
  'Poland',
  'Brazil',
  'Mexico',
  'Argentina',
  'Chile',
  'Colombia',
  'Japan',
  'South Korea',
  'China',
  'Singapore',
  'Malaysia',
  'Indonesia',
  'Philippines',
  'Thailand',
  'Vietnam',
  'United Arab Emirates',
  'Saudi Arabia',
  'South Africa',
  'Nigeria',
  'Kenya',
  'Egypt',
  'New Zealand',
  'Israel',
  'Turkey',
  'Russia'
];

const BUILTIN_FIELDS = [
  { key: 'fullName', label: 'Full Name' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'secondaryPhone', label: 'Secondary Phone' },
  { key: 'email', label: 'Email' },
  { key: 'workEmail', label: 'Work Email' },
  { key: 'ssn', label: 'National ID / SSN' },
  { key: 'jobRole', label: 'Job Role' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' }
];

const WIDGET_KEYS = ['fullName', 'email', 'phone', 'address', 'jobRole'];

function newCustomField() {
  return {
    id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    description: ''
  };
}

/**
 * @param {{ onClose?: (id: string) => void, variant?: 'widget' | 'page' }} props
 */
const FakeIdentityTool = ({ onClose, variant = 'widget' }) => {
  const isPage = variant === 'page';
  const [country, setCountry] = useState('United States');
  const [customFields, setCustomFields] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings');
        const savedCountry = settings?.fakeIdentity?.country;
        const savedFields = settings?.fakeIdentity?.customFields;
        if (typeof savedCountry === 'string' && savedCountry.trim()) {
          setCountry(savedCountry);
        }
        if (Array.isArray(savedFields)) {
          setCustomFields(
            savedFields
              .filter((f) => f && typeof f.name === 'string' && f.name.trim())
              .map((f) => ({
                id: f.id || newCustomField().id,
                name: f.name.trim(),
                description: typeof f.description === 'string' ? f.description : ''
              }))
          );
        }
      } catch (err) {
        console.warn('Failed to load fake identity settings:', err);
      }
    };
    load();
  }, []);

  const persistPrefs = async (nextCountry, nextFields) => {
    try {
      const settings = await ipcRenderer.invoke('get-settings');
      await ipcRenderer.invoke('update-settings', {
        ...settings,
        fakeIdentity: {
          ...(settings.fakeIdentity || {}),
          country: nextCountry,
          customFields: nextFields
        }
      });
    } catch (err) {
      console.error('Failed to save fake identity settings:', err);
    }
  };

  const displayFields = useMemo(() => {
    const custom = customFields
      .filter((f) => f.name.trim())
      .map((f) => ({
        key: `custom_${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || f.id}`,
        label: f.name.trim(),
        custom: true,
        id: f.id
      }));
    return [...BUILTIN_FIELDS, ...custom];
  }, [customFields]);

  const visibleFields = useMemo(() => {
    if (isPage) return displayFields;
    const widgetBuiltins = BUILTIN_FIELDS.filter((f) => WIDGET_KEYS.includes(f.key));
    const custom = displayFields.filter((f) => f.custom).slice(0, 2);
    return [...widgetBuiltins, ...custom];
  }, [displayFields, isPage]);

  const handleCountryChange = (value) => {
    setCountry(value);
    persistPrefs(value, customFields);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await generateFakeIdentity({
        country,
        customFields: customFields
          .filter((f) => f.name.trim())
          .map((f) => ({
            id: f.id,
            name: f.name.trim(),
            description: f.description.trim() || f.name.trim()
          }))
      });
      setIdentity(result);
    } catch (err) {
      setIdentity(null);
      setError(err?.message || 'Failed to generate identity');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (key, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleCopyAll = async () => {
    if (!identity) return;
    const lines = displayFields
      .map((field) => {
        const value = identity[field.key];
        return value ? `${field.label}: ${value}` : null;
      })
      .filter(Boolean);
    if (identity.country) lines.unshift(`Country: ${identity.country}`);
    await handleCopy('__all__', lines.join('\n'));
  };

  const handleAddCustomField = () => {
    const name = draftName.trim();
    if (!name) return;
    const next = [
      ...customFields,
      {
        id: newCustomField().id,
        name,
        description: draftDescription.trim()
      }
    ];
    setCustomFields(next);
    setDraftName('');
    setDraftDescription('');
    persistPrefs(country, next);
  };

  const handleRemoveCustomField = (id) => {
    const next = customFields.filter((f) => f.id !== id);
    setCustomFields(next);
    persistPrefs(country, next);
  };

  const shellClass = isPage
    ? 'h-full overflow-y-auto p-4'
    : 'bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4';

  return (
    <div className={shellClass}>
      {!isPage && onClose && (
        <button
          onClick={() => onClose('fake-identity')}
          className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
          title="Close"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}

      <div className={isPage ? 'max-w-5xl mx-auto space-y-4' : 'space-y-3 pr-4'}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-theme-primary font-semibold">
              <MdPerson className="w-5 h-5 text-red-500" />
              <h3 className={isPage ? 'text-xl' : 'text-sm'}>Fake Identity</h3>
            </div>
            <p className="text-xs text-theme-muted mt-1">
              AI-generated fictional profiles for testing. Configure an LLM in Settings → AI Agent.
            </p>
          </div>
          {!isPage && (
            <button
              type="button"
              onClick={() => navigate({ tab: 'fake-identity' })}
              className="text-xs text-red-500 hover:underline whitespace-nowrap"
            >
              Open page
            </button>
          )}
        </div>

        <div className={`flex ${isPage ? 'flex-row items-end' : 'flex-col'} gap-2`}>
          <div className="flex-1 w-full">
            <label className="block text-xs text-theme-muted mb-1">Country of origin</label>
            <select
              value={country}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-theme bg-theme-secondary text-theme-primary text-sm"
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            <MdRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {isPage && (
          <div className="bg-theme-card border border-theme rounded-lg p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-theme-primary">Custom fields</h4>
                <p className="text-xs text-theme-muted">Add extra fields with a name and description for the AI.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomEditor((v) => !v)}
                className="text-xs px-2 py-1 rounded border border-theme text-theme-primary hover:bg-theme-card-hover"
              >
                {showCustomEditor ? 'Hide' : 'Manage'}
              </button>
            </div>

            {customFields.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {customFields.map((field) => (
                  <span
                    key={field.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-theme-secondary border border-theme text-xs text-theme-primary"
                  >
                    {field.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomField(field.id)}
                      className="text-theme-muted hover:text-red-500"
                      title="Remove field"
                    >
                      <MdDelete className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {showCustomEditor && (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Field name (e.g. Blood Type)"
                  className="px-3 py-2 rounded-md border border-theme bg-theme-secondary text-theme-primary text-sm"
                />
                <input
                  type="text"
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="Description for the AI"
                  className="px-3 py-2 rounded-md border border-theme bg-theme-secondary text-theme-primary text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddCustomField}
                  disabled={!draftName.trim()}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-theme-secondary border border-theme text-theme-primary text-sm hover:bg-theme-card-hover disabled:opacity-50"
                >
                  <MdAdd className="w-4 h-4" />
                  Add
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {identity && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-theme-primary">Generated identity</h4>
              <button
                type="button"
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1 text-xs text-theme-muted hover:text-theme-primary"
              >
                {copiedKey === '__all__' ? <MdCheck className="w-3.5 h-3.5 text-green-500" /> : <MdContentCopy className="w-3.5 h-3.5" />}
                Copy all
              </button>
            </div>

            <div className={`grid gap-2 ${isPage ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
              {visibleFields.map((field) => {
                const value = identity[field.key] || '';
                return (
                  <div
                    key={field.key}
                    className="rounded-md border border-theme bg-theme-secondary px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] uppercase tracking-wide text-theme-muted">{field.label}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(field.key, value)}
                        className="text-theme-muted hover:text-theme-primary"
                        title="Copy"
                      >
                        {copiedKey === field.key ? <MdCheck className="w-3.5 h-3.5 text-green-500" /> : <MdContentCopy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="text-sm text-theme-primary break-words whitespace-pre-wrap">{value || '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!identity && !loading && !error && (
          <div className="text-xs text-theme-muted border border-dashed border-theme rounded-md px-3 py-4 text-center">
            Choose a country and generate a fake identity.
          </div>
        )}
      </div>
    </div>
  );
};

export default FakeIdentityTool;
