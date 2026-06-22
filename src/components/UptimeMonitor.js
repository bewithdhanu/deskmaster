import React, { useEffect, useMemo, useState } from 'react';
import {
  MdAccessTime,
  MdAdd,
  MdCheckCircle,
  MdClose,
  MdContentCopy,
  MdDelete,
  MdEdit,
  MdPause,
  MdPlayArrow,
  MdRefresh,
  MdSearch,
  MdSwapVert
} from 'react-icons/md';
import { getIpcRenderer } from '../utils/electron';
import { openExternalUrl } from '../utils/openExternalUrl';
import { formatFilteredMonitorStatusText, getMonitorStatusVariant, isMonitorAttentionStatus } from '../utils/uptimeKuma';
import UptimeStatsSummary from './UptimeStatsSummary';
import './uptime-monitor.css';

const ipcRenderer = getIpcRenderer();

const statusOptions = ['UP', 'DOWN', 'WARNING', 'PENDING', 'PAUSED'];
const defaultStatusFilters = ['UP', 'WARNING', 'PENDING'];
const domainFilterOptions = [
  { value: 'MAIN', label: 'Main Domains' },
  { value: 'SUBDOMAIN', label: 'Sub' }
];
const defaultDomainFilters = ['SUBDOMAIN'];
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const emptyMonitorForm = {
  name: '',
  url: '',
  method: 'GET',
  active: true,
  interval: 60,
  retryInterval: 60,
  maxretries: 0,
  timeout: 48,
  maxredirects: 10,
  accepted_statuscodes: '200-299',
  expiryNotification: false,
  domainExpiryNotification: true,
  ignoreTls: false,
  description: ''
};

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

function Card({ className, ...props }) {
  return <div className={cx('uptime-card', className)} {...props} />;
}

function CardHeader({ className, ...props }) {
  return <div className={cx('uptime-card-header', className)} {...props} />;
}

function CardTitle({ className, ...props }) {
  return <h3 className={cx('uptime-card-title', className)} {...props} />;
}

function CardDescription({ className, ...props }) {
  return <p className={cx('uptime-card-description', className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div className={cx('uptime-card-content', className)} {...props} />;
}

function Button({ variant = 'default', className, ...props }) {
  return <button className={cx('uptime-button', `uptime-button-${variant}`, className)} {...props} />;
}

function Input({ className, ...props }) {
  return <input className={cx('uptime-input', className)} {...props} />;
}

function Select({ className, ...props }) {
  return <select className={cx('uptime-select', className)} {...props} />;
}

function Badge({ variant = 'default', className, ...props }) {
  return <span className={cx('uptime-badge', `uptime-badge-${variant}`, className)} {...props} />;
}

function formatDate(value) {
  return value || 'Not loaded';
}

function formatSslDays(monitor) {
  if (monitor.sslDaysRemaining === null) return 'Days unavailable';
  const days = `${monitor.sslDaysRemaining} days`;
  return monitor.sslProvider ? `${days} (${monitor.sslProvider})` : days;
}

function statusVariant(status) {
  return getMonitorStatusVariant(status);
}

function matchesStatusFilter(monitorStatus, selectedStatus) {
  return selectedStatus.some((status) => {
    if (status === 'WARNING') return monitorStatus.includes('<=');
    return monitorStatus === status;
  });
}

function normalizeForSort(value) {
  if (value === null || value === undefined || value === '') return Number.NEGATIVE_INFINITY;
  if (typeof value === 'number') return value;
  return String(value).toLowerCase();
}

function getSortValue(monitor, key) {
  if (key === 'domain') return `${monitor.name} ${monitor.baseDomain} ${monitor.domain}`;
  if (key === 'status') return monitor.status;
  if (key === 'ssl') return monitor.sslDaysRemaining;
  if (key === 'domainExpiry') return monitor.domainExpiryDaysRemaining;
  if (key === 'response') return monitor.responseTimeMs;
  return monitor[key];
}

function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    const left = normalizeForSort(getSortValue(a, sort.key));
    const right = normalizeForSort(getSortValue(b, sort.key));
    const direction = sort.direction === 'asc' ? 1 : -1;

    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return a.id - b.id;
  });
}

function monitorToForm(monitor) {
  const config = monitor.monitor || {};
  return {
    id: monitor.id,
    name: config.name || monitor.name || '',
    url: config.url || monitor.url || '',
    method: config.method || 'GET',
    active: Boolean(config.active ?? monitor.active),
    interval: config.interval ?? 60,
    retryInterval: config.retryInterval ?? 60,
    maxretries: config.maxretries ?? 0,
    timeout: config.timeout ?? 48,
    maxredirects: config.maxredirects ?? 10,
    accepted_statuscodes: (config.accepted_statuscodes || ['200-299']).join(', '),
    expiryNotification: Boolean(config.expiryNotification),
    domainExpiryNotification: Boolean(config.domainExpiryNotification),
    ignoreTls: Boolean(config.ignoreTls),
    description: config.description || ''
  };
}

function formToPayload(form) {
  return {
    ...form,
    interval: Number(form.interval),
    retryInterval: Number(form.retryInterval),
    maxretries: Number(form.maxretries),
    timeout: Number(form.timeout),
    maxredirects: Number(form.maxredirects),
    accepted_statuscodes: form.accepted_statuscodes
  };
}

function SortButton({ label, column, sort, onSort }) {
  const isActive = sort.key === column;
  const direction = isActive ? sort.direction : null;

  return (
    <button className="uptime-sort-button" type="button" onClick={() => onSort(column)}>
      {label}
      <MdSwapVert size={15} />
      {direction ? <span>{direction === 'asc' ? 'ASC' : 'DESC'}</span> : null}
    </button>
  );
}

function FilterToggleGroup({ allowMultiple = false, fallbackValue, label, options, value, onChange }) {
  return (
    <div className="uptime-filter-toggle-group" aria-label={label}>
      {options.map((option) => {
        const optionValue = typeof option === 'string' ? option : option.value;
        const optionLabel = typeof option === 'string' ? option : option.label;
        const isActive = allowMultiple ? value.includes(optionValue) : optionValue === value;

        return (
          <button
            key={optionValue}
            type="button"
            className={isActive ? 'uptime-filter-toggle active' : 'uptime-filter-toggle'}
            onClick={() => {
              if (!allowMultiple) {
                onChange(optionValue);
                return;
              }

              const next = value.includes(optionValue)
                ? value.filter((item) => item !== optionValue)
                : [...value, optionValue];
              const fallback = fallbackValue || options.map((item) => (typeof item === 'string' ? item : item.value));
              onChange(next.length ? next : fallback);
            }}
          >
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}

export default function UptimeMonitor() {
  const [monitors, setMonitors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(defaultStatusFilters);
  const [domainFilter, setDomainFilter] = useState(defaultDomainFilters);
  const [sort, setSort] = useState({ key: 'status', direction: 'asc' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [pausingId, setPausingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingMonitor, setEditingMonitor] = useState(null);
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
  const [form, setForm] = useState(emptyMonitorForm);

  async function loadMonitors(options = {}) {
    setIsLoading(true);
    setError('');

    try {
      const data = await ipcRenderer.invoke('uptime:get-monitors', { refresh: Boolean(options.refresh) });
      setMonitors(data.monitors || []);
      setSummary(data.summary || null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMonitors();
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function handleSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  const filteredMonitors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const rows = monitors.filter((monitor) => {
      const matchesStatus = matchesStatusFilter(monitor.status, status);
      const matchesDomainType =
        (domainFilter.includes('MAIN') && monitor.domain === monitor.baseDomain) ||
        (domainFilter.includes('SUBDOMAIN') && monitor.domain !== monitor.baseDomain);
      const searchable = [monitor.domain, monitor.baseDomain, monitor.name, monitor.url].join(' ').toLowerCase();
      return matchesStatus && matchesDomainType && (!normalizedQuery || searchable.includes(normalizedQuery));
    });

    return sortRows(rows, sort);
  }, [domainFilter, monitors, query, sort, status]);

  function startCreate() {
    setEditingMonitor(null);
    setForm(emptyMonitorForm);
    setNotice('');
    setIsMonitorModalOpen(true);
  }

  function startEdit(monitor) {
    setEditingMonitor(monitor);
    setForm(monitorToForm(monitor));
    setNotice('');
    setIsMonitorModalOpen(true);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveMonitor(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setNotice('');

    try {
      const isEdit = Boolean(editingMonitor);
      if (isEdit) {
        await ipcRenderer.invoke('uptime:update-monitor', {
          id: editingMonitor.id,
          monitor: formToPayload(form)
        });
      } else {
        await ipcRenderer.invoke('uptime:create-monitor', formToPayload(form));
      }

      setNotice(isEdit ? 'Monitor updated' : 'Monitor created');
      setEditingMonitor(null);
      setForm(emptyMonitorForm);
      setIsMonitorModalOpen(false);
      await loadMonitors();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMonitor(monitor) {
    if (!window.confirm(`Delete monitor "${monitor.name}"?`)) return;

    setIsSaving(true);
    setDeletingId(monitor.id);
    setError('');
    setNotice('');

    try {
      await ipcRenderer.invoke('uptime:delete-monitor', { id: monitor.id });
      setNotice('Monitor deleted');
      await loadMonitors();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setIsSaving(false);
      setDeletingId(null);
    }
  }

  async function copyFilteredStatus() {
    const text = formatFilteredMonitorStatusText(filteredMonitors);
    if (!text) {
      setNotice('No warning monitors to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      const lineCount = text.split('\n').length;
      setNotice(`Copied ${lineCount} status line${lineCount === 1 ? '' : 's'}`);
    } catch (copyError) {
      setError(copyError.message || 'Could not copy to clipboard');
    }
  }

  async function toggleMonitorPause(monitor) {
    const shouldPause = monitor.active;

    setIsSaving(true);
    setPausingId(monitor.id);
    setError('');
    setNotice('');

    try {
      await ipcRenderer.invoke('uptime:pause-monitor', { id: monitor.id, paused: shouldPause });
      setNotice(shouldPause ? 'Monitor paused' : 'Monitor resumed');
      await loadMonitors();
    } catch (pauseError) {
      setError(pauseError.message);
    } finally {
      setIsSaving(false);
      setPausingId(null);
    }
  }

  return (
    <main className="uptime-monitor">
      {error ? (
        <Card className="uptime-error-card">
          <CardHeader>
            <CardTitle>Request failed</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {notice ? (
        <div className="uptime-toast" role="status">
          <MdCheckCircle size={16} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>
            <MdClose size={16} />
          </button>
        </div>
      ) : null}

      <UptimeStatsSummary monitors={monitors} summary={summary} isLoading={isLoading} error={error} />

      <MonitorTable
        copyFilteredStatus={copyFilteredStatus}
        deleteMonitor={deleteMonitor}
        domainFilter={domainFilter}
        filteredMonitors={filteredMonitors}
        handleSort={handleSort}
        isLoading={isLoading}
        isSaving={isSaving}
        deletingId={deletingId}
        monitors={monitors}
        pausingId={pausingId}
        query={query}
        setDomainFilter={setDomainFilter}
        setQuery={setQuery}
        setStatus={setStatus}
        sort={sort}
        refreshMonitors={() => loadMonitors({ refresh: true })}
        startCreate={startCreate}
        startEdit={startEdit}
        status={status}
        toggleMonitorPause={toggleMonitorPause}
      />

      {isMonitorModalOpen ? (
        <MonitorModal
          editingMonitor={editingMonitor}
          form={form}
          isSaving={isSaving}
          saveMonitor={saveMonitor}
          setEditingMonitor={setEditingMonitor}
          setForm={setForm}
          setIsMonitorModalOpen={setIsMonitorModalOpen}
          updateForm={updateForm}
        />
      ) : null}
    </main>
  );
}

function MonitorTable({
  copyFilteredStatus,
  deleteMonitor,
  deletingId,
  domainFilter,
  filteredMonitors,
  handleSort,
  isLoading,
  isSaving,
  monitors,
  pausingId,
  query,
  setDomainFilter,
  setQuery,
  setStatus,
  sort,
  refreshMonitors,
  startCreate,
  startEdit,
  status,
  toggleMonitorPause
}) {
  const attentionMonitorCount = filteredMonitors.filter(isMonitorAttentionStatus).length;

  return (
    <Card className="uptime-table-card">
      <CardHeader className="uptime-toolbar">
        <div>
          <CardTitle>Monitors</CardTitle>
          <CardDescription>Showing {filteredMonitors.length} of {monitors.length}.</CardDescription>
        </div>
        <div className="uptime-filters">
          <label className="uptime-search-field">
            <MdSearch size={18} />
            <Input placeholder="Search domain or monitor" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <FilterToggleGroup allowMultiple fallbackValue={defaultStatusFilters} label="Status filter" options={statusOptions} value={status} onChange={setStatus} />
          <FilterToggleGroup allowMultiple fallbackValue={defaultDomainFilters} label="Domain type filter" options={domainFilterOptions} value={domainFilter} onChange={setDomainFilter} />
          <Button
            variant="ghost"
            onClick={copyFilteredStatus}
            disabled={isLoading || attentionMonitorCount === 0}
            title={attentionMonitorCount === 0 ? 'No warning monitors to copy' : 'Copy warning monitors (red/yellow) to clipboard'}
          >
            <MdContentCopy size={18} />
            <span className="uptime-sr-only">Copy warning monitors</span>
          </Button>
          <Button onClick={startCreate}>
            <MdAdd size={18} />
            <span className="uptime-sr-only">New monitor</span>
          </Button>
          <Button onClick={refreshMonitors} disabled={isLoading || isSaving}>
            <MdRefresh size={18} className={isLoading ? 'uptime-spin' : ''} />
            <span className="uptime-sr-only">{isLoading ? 'Refreshing monitors' : 'Refresh monitors'}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="uptime-table-wrap">
          <table>
            <thead>
              <tr>
                <th><SortButton label="Monitor / Domain" column="domain" sort={sort} onSort={handleSort} /></th>
                <th><SortButton label="Status" column="status" sort={sort} onSort={handleSort} /></th>
                <th><SortButton label="SSL Expiry" column="ssl" sort={sort} onSort={handleSort} /></th>
                <th><SortButton label="Domain Expiry" column="domainExpiry" sort={sort} onSort={handleSort} /></th>
                <th><SortButton label="Response" column="response" sort={sort} onSort={handleSort} /></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="uptime-empty-state">Loading Uptime Kuma socket data...</td>
                </tr>
              ) : null}
              {!isLoading && filteredMonitors.length === 0 ? (
                <tr>
                  <td colSpan="6" className="uptime-empty-state">No monitors match the current filters.</td>
                </tr>
              ) : null}
              {!isLoading && filteredMonitors.map((monitor) => (
                <tr key={monitor.id}>
                  <td>
                    <div className="uptime-domain-cell">
                      <span>{monitor.name}</span>
                      {monitor.url ? (
                        <button
                          type="button"
                          onClick={() => openExternalUrl(monitor.url)}
                          className="uptime-domain-link"
                        >
                          {monitor.domain}
                        </button>
                      ) : (
                        <span>{monitor.domain}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Badge variant={statusVariant(monitor.status)}>{monitor.status}</Badge>
                    {monitor.status !== monitor.currentStatus ? <span className="uptime-current-status">Kuma: {monitor.currentStatus}</span> : null}
                  </td>
                  <td>
                    <div className="uptime-ssl-cell">
                      <span>{formatDate(monitor.sslExpiryDate)}</span>
                      <small>{formatSslDays(monitor)}</small>
                    </div>
                  </td>
                  <td>
                    {monitor.domainExpiryDate ? (
                      <div className="uptime-domain-expiry-cell">
                        <span>{monitor.domainExpiryDate}</span>
                        <small>{monitor.domainExpiryDaysRemaining === null ? 'Days unavailable' : `${monitor.domainExpiryDaysRemaining} days`}</small>
                      </div>
                    ) : (
                      <span className="uptime-muted-with-icon">
                        <MdAccessTime size={15} />
                        Not loaded
                      </span>
                    )}
                  </td>
                  <td>{monitor.responseTimeMs === null ? 'Unavailable' : `${monitor.responseTimeMs} ms`}</td>
                  <td>
                    <div className="uptime-row-actions">
                      <Button variant="ghost" onClick={() => startEdit(monitor)} disabled={isSaving}>
                        <MdEdit size={17} />
                        <span className="uptime-sr-only">Edit {monitor.name}</span>
                      </Button>
                      <Button variant="ghost" onClick={() => toggleMonitorPause(monitor)} disabled={isSaving}>
                        {pausingId === monitor.id ? (
                          <MdRefresh size={17} className="uptime-spin" />
                        ) : monitor.active ? (
                          <MdPause size={17} />
                        ) : (
                          <MdPlayArrow size={17} />
                        )}
                        <span className="uptime-sr-only">{monitor.active ? 'Pause' : 'Resume'} {monitor.name}</span>
                      </Button>
                      <Button variant="danger" onClick={() => deleteMonitor(monitor)} disabled={isSaving}>
                        {deletingId === monitor.id ? <MdRefresh size={17} className="uptime-spin" /> : <MdDelete size={17} />}
                        <span className="uptime-sr-only">Delete {monitor.name}</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MonitorModal({
  editingMonitor,
  form,
  isSaving,
  saveMonitor,
  setEditingMonitor,
  setForm,
  setIsMonitorModalOpen,
  updateForm
}) {
  function closeModal() {
    setEditingMonitor(null);
    setForm(emptyMonitorForm);
    setIsMonitorModalOpen(false);
  }

  return (
    <div className="uptime-modal-backdrop" role="presentation">
      <Card className="uptime-monitor-modal" role="dialog" aria-modal="true">
        <CardHeader className="uptime-toolbar">
          <div>
            <CardTitle>{editingMonitor ? 'Edit Monitor' : 'Create Monitor'}</CardTitle>
            <CardDescription>HTTP monitor settings are saved directly to Uptime Kuma.</CardDescription>
          </div>
          <Button type="button" variant="ghost" onClick={closeModal}>
            <MdClose size={18} />
            Close
          </Button>
        </CardHeader>
        <CardContent>
          <form className="uptime-monitor-form" onSubmit={saveMonitor}>
            <label>
              Name
              <Input value={form.name} onChange={(event) => updateForm('name', event.target.value)} required />
            </label>
            <label className="uptime-span-2">
              URL
              <Input value={form.url} onChange={(event) => updateForm('url', event.target.value)} placeholder="https://example.com" required />
            </label>
            <label>
              Method
              <Select value={form.method} onChange={(event) => updateForm('method', event.target.value)}>
                {methods.map((method) => <option key={method} value={method}>{method}</option>)}
              </Select>
            </label>
            <label>
              Interval
              <Input type="number" min="5" value={form.interval} onChange={(event) => updateForm('interval', event.target.value)} />
            </label>
            <label>
              Retry
              <Input type="number" min="5" value={form.retryInterval} onChange={(event) => updateForm('retryInterval', event.target.value)} />
            </label>
            <label>
              Retries
              <Input type="number" min="0" value={form.maxretries} onChange={(event) => updateForm('maxretries', event.target.value)} />
            </label>
            <label>
              Timeout
              <Input type="number" min="1" value={form.timeout} onChange={(event) => updateForm('timeout', event.target.value)} />
            </label>
            <label>
              Redirects
              <Input type="number" min="0" value={form.maxredirects} onChange={(event) => updateForm('maxredirects', event.target.value)} />
            </label>
            <label className="uptime-span-2">
              Accepted status codes
              <Input value={form.accepted_statuscodes} onChange={(event) => updateForm('accepted_statuscodes', event.target.value)} placeholder="200-299" />
            </label>
            <label className="uptime-span-3">
              Description
              <Input value={form.description} onChange={(event) => updateForm('description', event.target.value)} />
            </label>
            <div className="uptime-checkbox-row uptime-span-3">
              <label>
                <input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} />
                Active
              </label>
              <label>
                <input type="checkbox" checked={form.expiryNotification} onChange={(event) => updateForm('expiryNotification', event.target.checked)} />
                SSL notification
              </label>
              <label>
                <input type="checkbox" checked={form.domainExpiryNotification} onChange={(event) => updateForm('domainExpiryNotification', event.target.checked)} />
                Domain notification
              </label>
              <label>
                <input type="checkbox" checked={form.ignoreTls} onChange={(event) => updateForm('ignoreTls', event.target.checked)} />
                Ignore TLS
              </label>
            </div>
            <div className="uptime-form-actions uptime-span-3">
              <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <MdRefresh size={17} className="uptime-spin" /> : null}
                {isSaving ? 'Saving' : editingMonitor ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
