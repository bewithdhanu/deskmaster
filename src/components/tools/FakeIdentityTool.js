import React, { useEffect, useMemo, useState } from 'react';
import {
  MdAdd,
  MdCheck,
  MdClose,
  MdContentCopy,
  MdDelete,
  MdEdit,
  MdExpandLess,
  MdExpandMore,
  MdPerson,
  MdRefresh,
  MdSave
} from 'react-icons/md';
import { generateFakeIdentity, getFakeIdentityMeta } from '../../utils/textLlmClient';
import { getIpcRenderer } from '../../utils/electron';
import { navigate } from '../../utils/appRoute';

const ipcRenderer = getIpcRenderer();

const FALLBACK_FIELDS = [
  { key: 'fullName', label: 'Full Name', source: 'faker' },
  { key: 'firstName', label: 'First Name', source: 'faker' },
  { key: 'lastName', label: 'Last Name', source: 'faker' },
  { key: 'address', label: 'Address', source: 'real' },
  { key: 'city', label: 'City', source: 'real' },
  { key: 'state', label: 'State / Region', source: 'real' },
  { key: 'zipCode', label: 'Postal Code', source: 'real' },
  { key: 'phone', label: 'Phone', source: 'faker' },
  { key: 'secondaryPhone', label: 'Secondary Phone', source: 'faker' },
  { key: 'email', label: 'Email', source: 'faker' },
  { key: 'workEmail', label: 'Work Email', source: 'faker' },
  { key: 'ssn', label: 'National ID / SSN', source: 'faker' },
  { key: 'jobRole', label: 'Job Role', source: 'faker' },
  { key: 'company', label: 'Company', source: 'faker' },
  { key: 'dateOfBirth', label: 'Date of Birth', source: 'faker' },
  { key: 'gender', label: 'Gender', source: 'faker' },
  { key: 'username', label: 'Username', source: 'faker' },
  { key: 'website', label: 'Website', source: 'faker' },
  { key: 'latitude', label: 'Latitude', source: 'real' },
  { key: 'longitude', label: 'Longitude', source: 'real' }
];

const FALLBACK_COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'India', 'Germany', 'France'
];

const FALLBACK_DEFAULTS = [
  'fullName', 'address', 'phone', 'secondaryPhone', 'email', 'workEmail', 'ssn', 'jobRole', 'latitude', 'longitude'
];

const WIDGET_KEYS = ['fullName', 'email', 'phone', 'address', 'jobRole', 'city'];

function newCustomField(partial = {}) {
  return {
    id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    description: '',
    ...partial
  };
}

function customFieldKey(field) {
  const name = String(field?.name || '').trim();
  return `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || field.id}`;
}

function FieldRow({ label, value, onCopy, copied }) {
  return (
    <div className="rounded-md border border-theme bg-theme-secondary px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] uppercase tracking-wide text-theme-muted">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-theme-muted hover:text-theme-primary"
          title="Copy"
        >
          {copied ? <MdCheck className="w-3.5 h-3.5 text-green-500" /> : <MdContentCopy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="text-sm text-theme-primary break-words whitespace-pre-wrap">{value || '—'}</div>
    </div>
  );
}

/**
 * @param {{ onClose?: (id: string) => void, variant?: 'widget' | 'page' }} props
 */
const FakeIdentityTool = ({ onClose, variant = 'widget' }) => {
  const isPage = variant === 'page';

  const [countries, setCountries] = useState(FALLBACK_COUNTRIES);
  const [builtinFields, setBuiltinFields] = useState(FALLBACK_FIELDS);
  const [country, setCountry] = useState('United States');
  const [selectedFields, setSelectedFields] = useState(FALLBACK_DEFAULTS);
  const [customFields, setCustomFields] = useState([]);
  const [recordCount, setRecordCount] = useState(1);
  const [records, setRecords] = useState([]);
  const [openRecordIds, setOpenRecordIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [editingCustomId, setEditingCustomId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [meta, settings] = await Promise.all([
          getFakeIdentityMeta().catch(() => null),
          ipcRenderer.invoke('get-settings')
        ]);

        if (meta?.countries?.length) setCountries(meta.countries);
        if (meta?.builtinFields?.length) setBuiltinFields(meta.builtinFields);

        const saved = settings?.fakeIdentity || {};
        if (typeof saved.country === 'string' && saved.country.trim()) {
          setCountry(saved.country);
        }
        if (Array.isArray(saved.selectedFields) && saved.selectedFields.length) {
          setSelectedFields(saved.selectedFields);
        } else if (meta?.defaultSelectedFields?.length) {
          setSelectedFields(meta.defaultSelectedFields);
        }
        if (Array.isArray(saved.customFields)) {
          setCustomFields(
            saved.customFields
              .filter((f) => f && typeof f.name === 'string' && f.name.trim())
              .map((f) => ({
                id: f.id || newCustomField().id,
                name: f.name.trim(),
                description: typeof f.description === 'string' ? f.description : ''
              }))
          );
        }
        if (saved.recordCount) {
          const n = Number(saved.recordCount);
          if (n >= 1 && n <= 20) setRecordCount(n);
        }
      } catch (err) {
        console.warn('Failed to load fake identity settings:', err);
      }
    };
    load();
  }, []);

  const persistPrefs = async (patch) => {
    try {
      const settings = await ipcRenderer.invoke('get-settings');
      const next = {
        country,
        selectedFields,
        customFields,
        recordCount,
        ...(settings.fakeIdentity || {}),
        ...patch
      };
      await ipcRenderer.invoke('update-settings', {
        ...settings,
        fakeIdentity: next
      });
    } catch (err) {
      console.error('Failed to save fake identity settings:', err);
    }
  };

  const labelMap = useMemo(() => {
    const map = {};
    builtinFields.forEach((f) => {
      map[f.key] = f.label;
    });
    customFields.forEach((f) => {
      map[customFieldKey(f)] = f.name;
    });
    return map;
  }, [builtinFields, customFields]);

  const toggleField = (key) => {
    setSelectedFields((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      const safe = next.length ? next : [key];
      persistPrefs({ selectedFields: safe });
      return safe;
    });
  };

  const selectAllFields = () => {
    const next = builtinFields.map((f) => f.key);
    setSelectedFields(next);
    persistPrefs({ selectedFields: next });
  };

  const clearAllFields = () => {
    const next = ['fullName'];
    setSelectedFields(next);
    persistPrefs({ selectedFields: next });
  };

  const startAddCustom = () => {
    setEditingCustomId('new');
    setDraftName('');
    setDraftDescription('');
  };

  const startEditCustom = (field) => {
    setEditingCustomId(field.id);
    setDraftName(field.name);
    setDraftDescription(field.description || '');
  };

  const cancelCustomEdit = () => {
    setEditingCustomId(null);
    setDraftName('');
    setDraftDescription('');
  };

  const saveCustomField = () => {
    const name = draftName.trim();
    if (!name) return;

    let next;
    if (editingCustomId === 'new') {
      next = [...customFields, newCustomField({ name, description: draftDescription.trim() })];
    } else {
      next = customFields.map((f) =>
        f.id === editingCustomId
          ? { ...f, name, description: draftDescription.trim() }
          : f
      );
    }
    setCustomFields(next);
    persistPrefs({ customFields: next });
    cancelCustomEdit();
  };

  const removeCustomField = (id) => {
    const next = customFields.filter((f) => f.id !== id);
    setCustomFields(next);
    persistPrefs({ customFields: next });
    if (editingCustomId === id) cancelCustomEdit();
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const count = isPage ? Math.max(1, Math.min(20, Number(recordCount) || 1)) : 1;
      const fields = isPage
        ? (selectedFields.length ? selectedFields : FALLBACK_DEFAULTS)
        : WIDGET_KEYS;

      const result = await generateFakeIdentity({
        country,
        count,
        selectedFields: fields,
        customFields: isPage
          ? customFields
            .filter((f) => f.name.trim())
            .map((f) => ({
              id: f.id,
              name: f.name.trim(),
              description: f.description.trim() || f.name.trim()
            }))
          : [],
        libraryOnly: !isPage
      });

      setRecords(result);
      setOpenRecordIds(result.map((_, idx) => `record-${idx}`));
    } catch (err) {
      setRecords([]);
      setOpenRecordIds([]);
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

  const handleCopyRecord = async (record, index) => {
    const lines = Object.keys(record)
      .filter((k) => k !== 'country')
      .map((key) => `${labelMap[key] || key}: ${record[key]}`)
      .filter((line) => !line.endsWith(': '));
    if (record.country) lines.unshift(`Country: ${record.country}`);
    await handleCopy(`record-${index}`, lines.join('\n'));
  };

  const toggleAccordion = (id) => {
    setOpenRecordIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const renderRecordFields = (record, index) => {
    const keys = Object.keys(record).filter((k) => k !== 'country' && record[k]);
    return (
      <div className={`grid gap-2 ${isPage ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {keys.map((key) => (
          <FieldRow
            key={`${index}-${key}`}
            label={labelMap[key] || key}
            value={record[key]}
            copied={copiedKey === `${index}-${key}`}
            onCopy={() => handleCopy(`${index}-${key}`, record[key])}
          />
        ))}
      </div>
    );
  };

  if (!isPage) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-4 relative break-inside-avoid mb-4">
        {onClose && (
          <button
            onClick={() => onClose('fake-identity')}
            className="absolute top-2 right-2 p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
            title="Close"
          >
            <MdClose className="w-4 h-4" />
          </button>
        )}

        <div className="space-y-3 pr-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-theme-primary font-semibold">
                <MdPerson className="w-5 h-5 text-red-500" />
                <h3 className="text-sm">Fake Identity</h3>
              </div>
              <p className="text-xs text-theme-muted mt-1">
                Quick library-based profile (no AI / custom fields).
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ tab: 'fake-identity' })}
              className="text-xs text-red-500 hover:underline whitespace-nowrap"
            >
              Open page
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <label className="block text-xs text-theme-muted mb-1">Country</label>
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  persistPrefs({ country: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-md border border-theme bg-theme-secondary text-theme-primary text-sm"
              >
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-medium"
            >
              <MdRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {records[0] && renderRecordFields(records[0], 0)}

          {!records.length && !loading && !error && (
            <div className="text-xs text-theme-muted border border-dashed border-theme rounded-md px-3 py-4 text-center">
              Generate a basic fake identity.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-theme-primary text-theme-primary overflow-hidden">
      {/* Left config panel */}
      <aside className="w-[340px] shrink-0 border-r border-theme bg-theme-secondary overflow-y-auto">
        <div className="p-4 space-y-5">
          <div>
            <div className="flex items-center gap-2 font-semibold text-lg">
              <MdPerson className="w-5 h-5 text-red-500" />
              Fake Identity
            </div>
            <p className="text-xs text-theme-muted mt-1">
              Core fields use Faker + real map addresses. Custom fields use AI only when needed.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1">Country of origin</label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                persistPrefs({ country: e.target.value });
              }}
              className="w-full px-3 py-2 rounded-md border border-theme bg-theme-card text-theme-primary text-sm"
            >
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1">Number of records</label>
            <input
              type="number"
              min={1}
              max={20}
              value={recordCount}
              onChange={(e) => {
                const n = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                setRecordCount(n);
                persistPrefs({ recordCount: n });
              }}
              className="w-full px-3 py-2 rounded-md border border-theme bg-theme-card text-theme-primary text-sm"
            />
            <p className="text-[11px] text-theme-muted mt-1">1–20 records per generate.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Fields</h4>
              <div className="flex gap-2">
                <button type="button" onClick={selectAllFields} className="text-[11px] text-red-500 hover:underline">All</button>
                <button type="button" onClick={clearAllFields} className="text-[11px] text-theme-muted hover:underline">Clear</button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {builtinFields.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-theme-card cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                    className="rounded border-theme"
                  />
                  <span className="text-sm flex-1">{field.label}</span>
                  <span className="text-[10px] uppercase text-theme-muted">
                    {field.source === 'real' ? 'map' : 'faker'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Custom fields</h4>
              <button
                type="button"
                onClick={startAddCustom}
                className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
              >
                <MdAdd className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
            <p className="text-[11px] text-theme-muted mb-2">
              AI fills these only. Edit name + description anytime.
            </p>

            <div className="space-y-2">
              {customFields.map((field) => (
                <div key={field.id} className="rounded-md border border-theme bg-theme-card p-2">
                  {editingCustomId === field.id ? (
                    <div className="space-y-2">
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder="Field name"
                        className="w-full px-2 py-1.5 rounded border border-theme bg-theme-secondary text-sm"
                      />
                      <textarea
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        placeholder="Description for AI"
                        rows={2}
                        className="w-full px-2 py-1.5 rounded border border-theme bg-theme-secondary text-sm resize-y"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={saveCustomField} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500 text-white text-xs">
                          <MdSave className="w-3.5 h-3.5" /> Save
                        </button>
                        <button type="button" onClick={cancelCustomEdit} className="px-2 py-1 rounded border border-theme text-xs">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{field.name}</div>
                        <div className="text-[11px] text-theme-muted line-clamp-2">{field.description || 'No description'}</div>
                      </div>
                      <button type="button" onClick={() => startEditCustom(field)} className="text-theme-muted hover:text-theme-primary" title="Edit">
                        <MdEdit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => removeCustomField(field.id)} className="text-theme-muted hover:text-red-500" title="Delete">
                        <MdDelete className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {editingCustomId === 'new' && (
                <div className="rounded-md border border-theme bg-theme-card p-2 space-y-2">
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Field name"
                    className="w-full px-2 py-1.5 rounded border border-theme bg-theme-secondary text-sm"
                  />
                  <textarea
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    placeholder="Description for AI"
                    rows={2}
                    className="w-full px-2 py-1.5 rounded border border-theme bg-theme-secondary text-sm resize-y"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={saveCustomField} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500 text-white text-xs">
                      <MdSave className="w-3.5 h-3.5" /> Save
                    </button>
                    <button type="button" onClick={cancelCustomEdit} className="px-2 py-1 rounded border border-theme text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!customFields.length && editingCustomId !== 'new' && (
                <div className="text-[11px] text-theme-muted border border-dashed border-theme rounded-md px-2 py-3 text-center">
                  No custom fields yet.
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !selectedFields.length}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-medium"
          >
            <MdRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generating…' : `Generate ${recordCount} record${recordCount > 1 ? 's' : ''}`}
          </button>
        </div>
      </aside>

      {/* Results */}
      <main className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {!records.length && !loading && !error && (
          <div className="h-full min-h-[240px] flex items-center justify-center">
            <div className="text-center text-theme-muted max-w-md">
              <MdPerson className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Configure fields on the left, set how many records you need, then generate.</p>
              <p className="text-xs mt-2">Addresses are resolved from real map locations when possible.</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-sm text-theme-muted py-8 text-center">
            Generating {recordCount} record{recordCount > 1 ? 's' : ''}…
            {selectedFields.some((k) => ['address', 'city', 'state', 'zipCode', 'latitude', 'longitude'].includes(k)) && (
              <span className="block text-xs mt-1">Looking up real addresses (about 1s each)…</span>
            )}
          </div>
        )}

        <div className="space-y-3 max-w-5xl">
          {records.map((record, index) => {
            const id = `record-${index}`;
            const open = openRecordIds.includes(id);
            return (
              <div key={id} className="border border-theme rounded-lg bg-theme-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleAccordion(id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-theme-card-hover"
                >
                  <span className="text-theme-muted">
                    {open ? <MdExpandLess className="w-5 h-5" /> : <MdExpandMore className="w-5 h-5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {record.fullName || record.firstName || `Record ${index + 1}`}
                    </div>
                    <div className="text-xs text-theme-muted truncate">
                      {[record.jobRole, record.city || record.address, record.email].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyRecord(record, index);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-theme-muted hover:text-theme-primary px-2 py-1"
                  >
                    {copiedKey === `record-${index}` ? <MdCheck className="w-3.5 h-3.5 text-green-500" /> : <MdContentCopy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </button>
                {open && (
                  <div className="px-4 pb-4 border-t border-theme pt-3">
                    {renderRecordFields(record, index)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default FakeIdentityTool;
