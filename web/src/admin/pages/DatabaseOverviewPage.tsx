import { useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import type { BackupFileRow, DatabaseStatusResponse, ScheduleConfig } from '../../api/admin';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DirPickerModal } from '../components/DirPickerModal';
import { formatBytes } from '../database/formatBytes';

const PAGE_SIZE = 5;
const RETENTION_MIN = 2;
const RETENTION_MAX = 30;

function parseCronToSchedule(cronExpr: string): { hour: number; frequency: 'daily' | 'every2days' } {
  const parts = cronExpr.trim().split(/\s+/);
  const hour = parseInt(parts[1] ?? '4', 10) || 4;
  const dayField = parts[2] ?? '*';
  const frequency: 'daily' | 'every2days' = dayField === '*/2' ? 'every2days' : 'daily';
  return { hour, frequency };
}

function buildCron(hour: number, frequency: 'daily' | 'every2days'): string {
  const dayField = frequency === 'every2days' ? '*/2' : '*';
  return `0 ${hour} ${dayField} * *`;
}

function describeSchedule(cronExpr: string, enabled: boolean, timezone?: string): string {
  if (!enabled) return 'Nincs aktív ütemezés';
  const { hour, frequency } = parseCronToSchedule(cronExpr);
  const freqText = frequency === 'every2days' ? 'minden 2. nap' : 'naponta';
  const tz = timezone || 'Europe/Budapest';
  return `${freqText}, ${hour.toString().padStart(2, '0')}:00 (${tz})`;
}

function sourceLabel(source?: string): { text: string; cls: string } {
  switch (source) {
    case 'manual': return { text: 'Kézi', cls: 'db-source-manual' };
    case 'auto': return { text: 'Időzített', cls: 'db-source-auto' };
    default: return { text: 'Korábbi', cls: 'db-source-legacy' };
  }
}

export function DatabaseOverviewPage() {
  const [status, setStatus] = useState<DatabaseStatusResponse | null>(null);
  const [files, setFiles] = useState<BackupFileRow[]>([]);
  const [config, setConfig] = useState<ScheduleConfig>({
    cron: '0 4 * * *',
    enabled: false,
    timezone: 'Europe/Budapest',
    manualBackupDir: '/backups',
    scheduledBackupDir: '/backups',
    retentionDays: 7,
  });

  // Schedule inputs
  const [hourInput, setHourInput] = useState(4);
  const [frequencyInput, setFrequencyInput] = useState<'daily' | 'every2days'>('daily');
  const [enabledInput, setEnabledInput] = useState(false);

  // Config inputs
  const [manualDirInput, setManualDirInput] = useState('/backups');
  const [scheduledDirInput, setScheduledDirInput] = useState('/backups');
  const [retentionInput, setRetentionInput] = useState(7);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [dirPicker, setDirPicker] = useState<null | { field: 'manual' | 'scheduled'; current: string }>(null);

  function applyConfig(sch: ScheduleConfig) {
    setConfig(sch);
    const parsed = parseCronToSchedule(sch.cron);
    setHourInput(parsed.hour);
    setFrequencyInput(parsed.frequency);
    setEnabledInput(sch.enabled);
    setManualDirInput(sch.manualBackupDir || '/backups');
    setScheduledDirInput(sch.scheduledBackupDir || '/backups');
    setRetentionInput(sch.retentionDays ?? 7);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setMessage(null);
      try {
        const s = await adminApi.getDatabaseStatus();
        if (cancelled) return;
        setStatus(s);
        if (s.configured && s.ok) {
          const [list, sch] = await Promise.all([
            adminApi.listDatabaseBackups(),
            adminApi.getDatabaseSchedule(),
          ]);
          if (cancelled) return;
          setFiles(list.files);
          applyConfig(sch);
        } else {
          setFiles([]);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus(null);
          if (e instanceof ApiError && e.status === 404) {
            setError('404 – Az API nem ismeri az /admin/database/* végpontokat. Gyökér docker-compose + legfrissebb backend szükséges.');
          } else {
            setError(e instanceof ApiError ? e.message : 'Betöltés sikertelen.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const s = await adminApi.getDatabaseStatus();
      setStatus(s);
      if (s.configured && s.ok) {
        const [list, sch] = await Promise.all([
          adminApi.listDatabaseBackups(),
          adminApi.getDatabaseSchedule(),
        ]);
        setFiles(list.files);
        applyConfig(sch);
      } else {
        setFiles([]);
      }
    } catch (e) {
      setStatus(null);
      setError(e instanceof ApiError ? e.message : 'Betöltés sikertelen.');
    } finally {
      setLoading(false);
    }
  }

  function buildFullConfig(): ScheduleConfig {
    return {
      cron: buildCron(hourInput, frequencyInput),
      enabled: enabledInput,
      timezone: config.timezone || 'Europe/Budapest',
      manualBackupDir: manualDirInput.trim() || '/backups',
      scheduledBackupDir: scheduledDirInput.trim() || '/backups',
      retentionDays: Math.min(RETENTION_MAX, Math.max(RETENTION_MIN, retentionInput)),
    };
  }

  async function onBackupNow() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await adminApi.runDatabaseBackup();
      let msg = `Mentés kész: ${r.filename} (${formatBytes(r.size)})`;
      if (r.driveUpload === 'ok') {
        msg += ' — Google Drive feltöltés OK.';
      } else if (r.driveUpload === 'failed') {
        msg += ` — Drive feltöltés sikertelen${r.driveUploadError ? `: ${r.driveUploadError}` : '.'}`;
      }
      setMessage(msg);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mentés sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveSchedule() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await adminApi.putDatabaseSchedule(buildFullConfig());
      setMessage('Ütemezés mentve.');
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mentés sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveConfig() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await adminApi.putDatabaseSchedule(buildFullConfig());
      setMessage('Beállítások mentve.');
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mentés sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(name: string) {
    setError(null);
    try {
      await adminApi.downloadDatabaseBackup(name);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Letöltés sikertelen.');
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await adminApi.deleteDatabaseBackup(deleteTarget);
      setMessage(`${deleteTarget} törölve.`);
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Törlés sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-boot">
        <div className="admin-spinner" aria-hidden />
      </div>
    );
  }

  const showOps = status?.configured === true && status?.ok === true;
  const showProblemPanel = status && (!status.configured || !status.ok);
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedFiles = files.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Mentések és ütemezés</h1>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void refresh()} disabled={busy}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M13.65 2.35A7.96 7.96 0 008 0a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L10 6h6V0l-2.35 2.35z" fill="currentColor"/>
          </svg>
          Frissítés
        </button>
      </div>

      {message && <div className="admin-alert admin-alert-success">{message}</div>}
      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      {showProblemPanel && (
        <section className="admin-panel admin-panel-warn">
          <h2 className="admin-panel-title">
            {!status.configured ? 'Mentő szolgáltatás nincs konfigurálva' : 'db-tools nem válaszol rendben'}
          </h2>
          <p className="admin-alert admin-alert-error" style={{ marginTop: '0.75rem' }}>
            {status.error ?? 'Nincs részletes üzenet.'}
          </p>
          <p className="admin-muted" style={{ marginTop: '1rem' }}>
            A gyökér <code>docker-compose.yml</code> tartalmazza a <code>db-tools</code> szolgáltatást. Belső URL:{' '}
            <code>DB_TOOLS_URL=http://db-tools:3010</code>. Az <code>api</code> és <code>db-tools</code> azonos{' '}
            <code>DB_TOOLS_SECRET</code> értéket kapjon.
          </p>
        </section>
      )}

      {showOps && (
        <>
          {/* Status overview cards */}
          <div className="db-status-grid">
            <div className="db-status-card">
              <div className="db-status-icon db-status-icon-backup">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="db-status-info">
                <span className="db-status-label">Mentések száma</span>
                <span className="db-status-value">{files.length}</span>
              </div>
            </div>

            <div className="db-status-card">
              <div className="db-status-icon db-status-icon-size">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="db-status-info">
                <span className="db-status-label">Összméret</span>
                <span className="db-status-value">{formatBytes(totalSize)}</span>
              </div>
            </div>

            <div className="db-status-card">
              <div className={`db-status-icon ${config.enabled ? 'db-status-icon-active' : 'db-status-icon-inactive'}`}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2a8 8 0 100 16 8 8 0 000-16z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="db-status-info">
                <span className="db-status-label">Ütemezés</span>
                <span className="db-status-value db-status-value-sm">
                  {describeSchedule(config.cron, config.enabled, config.timezone)}
                </span>
              </div>
            </div>

            <div className="db-status-card">
              <div className="db-status-icon db-status-icon-retention">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 4h14M5 4V3a1 1 0 011-1h8a1 1 0 011 1v1M7 8v6M10 8v6M13 8v6M4 4l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
              <div className="db-status-info">
                <span className="db-status-label">Megőrzés</span>
                <span className="db-status-value db-status-value-sm">
                  {config.retentionDays ?? 7} nap
                </span>
              </div>
            </div>

            <div className="db-status-card">
              <div
                className={`db-status-icon ${
                  status?.rcloneUploadEnabled ? 'db-status-icon-active' : 'db-status-icon-inactive'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 14a4 4 0 014-4h.5A3.5 3.5 0 0112 6.5 3.5 3.5 0 0115.5 10H16a3 3 0 010 6H8a4 4 0 01-4-2z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
              </div>
              <div className="db-status-info">
                <span className="db-status-label">Google Drive</span>
                <span className="db-status-value db-status-value-sm">
                  {status?.rcloneUploadEnabled
                    ? status.rcloneRemote || 'bekapcsolva'
                    : 'ki'}
                </span>
              </div>
            </div>
          </div>

          {/* Instant backup */}
          <section className="admin-panel db-section">
            <div className="db-section-header">
              <div>
                <h2 className="admin-panel-title">Pillanatnyi mentés</h2>
                <p className="admin-muted">
                  PostgreSQL custom formátum (<code>.dump</code>) — azonnali kézi mentés
                  {status?.rcloneUploadEnabled
                    ? '; sikeres mentés után feltöltés Google Drive-ra is.'
                    : '.'}
                </p>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={busy}
                onClick={() => void onBackupNow()}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6, verticalAlign: -2 }}>
                  <path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mentés most
              </button>
            </div>
          </section>

          {/* Schedule settings */}
          <section className="admin-panel db-section">
            <div className="db-section-header">
              <div>
                <h2 className="admin-panel-title">Időzített mentés</h2>
                <p className="admin-muted">
                  Állítsd be, mikor és milyen gyakran készüljön automatikus mentés.
                </p>
              </div>
            </div>

            <div className={`db-schedule-status ${config.enabled ? 'db-schedule-status-on' : 'db-schedule-status-off'}`}>
              <div className="db-schedule-status-dot" />
              <div className="db-schedule-status-text">
                <strong>Jelenlegi beállítás:</strong>{' '}
                {describeSchedule(config.cron, config.enabled, config.timezone)}
              </div>
            </div>

            <div className="db-schedule-form">
              <div className="db-schedule-row">
                <label className="db-schedule-field">
                  <span className="db-schedule-field-label">Gyakoriság</span>
                  <select
                    className="admin-select"
                    value={frequencyInput}
                    onChange={(e) => setFrequencyInput(e.target.value as 'daily' | 'every2days')}
                    disabled={busy}
                  >
                    <option value="daily">Naponta</option>
                    <option value="every2days">Minden 2. nap</option>
                  </select>
                </label>

                <label className="db-schedule-field">
                  <span className="db-schedule-field-label">Időpont (óra)</span>
                  <select
                    className="admin-select"
                    value={hourInput}
                    onChange={(e) => setHourInput(parseInt(e.target.value, 10))}
                    disabled={busy}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i.toString().padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </label>

                <label className="db-schedule-toggle">
                  <div className={`db-toggle ${enabledInput ? 'db-toggle-on' : ''}`} onClick={() => !busy && setEnabledInput(!enabledInput)}>
                    <div className="db-toggle-thumb" />
                  </div>
                  <span className="db-schedule-field-label">
                    {enabledInput ? 'Aktív' : 'Inaktív'}
                  </span>
                </label>
              </div>

              <div className="db-schedule-preview">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 6, opacity: 0.6, verticalAlign: -2 }}>
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Előnézet: {describeSchedule(buildCron(hourInput, frequencyInput), enabledInput, config.timezone)}
              </div>

              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={busy}
                onClick={() => void onSaveSchedule()}
                style={{ alignSelf: 'flex-start' }}
              >
                Ütemezés mentése
              </button>
            </div>
          </section>

          {/* Backup locations & retention */}
          <section className="admin-panel db-section">
            <div className="db-section-header">
              <div>
                <h2 className="admin-panel-title">Mentés beállítások</h2>
                <p className="admin-muted">
                  Mentési helyek és automatikus törlés beállítása.
                </p>
              </div>
            </div>

            <div className="db-config-grid">
              <div className="db-config-field">
                <span className="db-schedule-field-label">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, verticalAlign: -2, opacity: 0.5 }}>
                    <path d="M1.5 3.5a1.5 1.5 0 011.5-1.5h3l1.5 1.5h4A1.5 1.5 0 0113.5 5v5.5a1.5 1.5 0 01-1.5 1.5H3a1.5 1.5 0 01-1.5-1.5v-7z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                  </svg>
                  Kézi mentés helye
                </span>
                <div className="db-dir-picker-row">
                  <input
                    className="admin-input db-dir-input"
                    value={manualDirInput}
                    onChange={(e) => setManualDirInput(e.target.value)}
                    disabled={busy}
                    spellCheck={false}
                    placeholder="/backups"
                  />
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary db-dir-browse-btn"
                    disabled={busy}
                    onClick={() => setDirPicker({ field: 'manual', current: manualDirInput })}
                    title="Tallózás"
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <path d="M1.5 3a1.5 1.5 0 011.5-1.5H6l1.5 1.5h5.5A1.5 1.5 0 0114.5 4.5v8A1.5 1.5 0 0113 14H2a1.5 1.5 0 01-1.5-1.5V3z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                    </svg>
                    Tallózás
                  </button>
                </div>
              </div>

              <div className="db-config-field">
                <span className="db-schedule-field-label">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, verticalAlign: -2, opacity: 0.5 }}>
                    <path d="M1.5 3.5a1.5 1.5 0 011.5-1.5h3l1.5 1.5h4A1.5 1.5 0 0113.5 5v5.5a1.5 1.5 0 01-1.5 1.5H3a1.5 1.5 0 01-1.5-1.5v-7z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                  </svg>
                  Időzített mentés helye
                </span>
                <div className="db-dir-picker-row">
                  <input
                    className="admin-input db-dir-input"
                    value={scheduledDirInput}
                    onChange={(e) => setScheduledDirInput(e.target.value)}
                    disabled={busy}
                    spellCheck={false}
                    placeholder="/backups"
                  />
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary db-dir-browse-btn"
                    disabled={busy}
                    onClick={() => setDirPicker({ field: 'scheduled', current: scheduledDirInput })}
                    title="Tallózás"
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <path d="M1.5 3a1.5 1.5 0 011.5-1.5H6l1.5 1.5h5.5A1.5 1.5 0 0114.5 4.5v8A1.5 1.5 0 0113 14H2a1.5 1.5 0 01-1.5-1.5V3z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                    </svg>
                    Tallózás
                  </button>
                </div>
              </div>

              <label className="db-config-field">
                <span className="db-schedule-field-label">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, verticalAlign: -2, opacity: 0.5 }}>
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                    <path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  </svg>
                  Mentések megőrzése (nap)
                </span>
                <div className="db-retention-row">
                  <input
                    type="range"
                    className="db-retention-slider"
                    min={RETENTION_MIN}
                    max={RETENTION_MAX}
                    value={retentionInput}
                    onChange={(e) => setRetentionInput(parseInt(e.target.value, 10))}
                    disabled={busy}
                  />
                  <span className="db-retention-value">{retentionInput} nap</span>
                </div>
              </label>
            </div>

            <div className="db-config-hint">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 6, opacity: 0.5, verticalAlign: -2, flexShrink: 0 }}>
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                <path d="M7 6v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              A megőrzési időn ({retentionInput} nap) túli mentések automatikusan törlődnek az időzített mentés lefutásakor.
              Minimum {RETENTION_MIN} nap, maximum {RETENTION_MAX} nap ({RETENTION_MAX} nap = ~1 hónap).
            </div>

            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={busy}
              onClick={() => void onSaveConfig()}
              style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
            >
              Beállítások mentése
            </button>
          </section>

          {/* Backup list with pagination */}
          <section className="admin-panel db-section">
            <div className="db-section-header">
              <div>
                <h2 className="admin-panel-title">Mentések ({files.length})</h2>
                <p className="admin-muted">
                  Letöltés, törlés; teljes visszaállítás a <strong>Rendszer visszaállítás</strong> menüpontban.
                </p>
              </div>
            </div>

            {files.length === 0 ? (
              <div className="db-empty-state">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.3 }}>
                  <rect x="8" y="6" width="32" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M16 18h16M16 24h16M16 30h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p>Még nincs mentés.</p>
              </div>
            ) : (
              <>
                <div className="db-backup-list">
                  {paginatedFiles.map((f) => {
                    const src = sourceLabel(f.source);
                    return (
                      <div key={f.name} className="db-backup-row">
                        <div className="db-backup-icon">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M4 2a1.5 1.5 0 00-1.5 1.5v11A1.5 1.5 0 004 16h10a1.5 1.5 0 001.5-1.5v-8.38a1.5 1.5 0 00-.44-1.06l-3.12-3.12A1.5 1.5 0 0010.88 2H4z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                            <path d="M6 10h6M6 13h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className="db-backup-info">
                          <div className="db-backup-name-row">
                            <span className="db-backup-name">{f.name}</span>
                            <span className={`db-source-badge ${src.cls}`}>{src.text}</span>
                          </div>
                          <span className="db-backup-meta">
                            {formatBytes(f.size)} &middot; {new Date(f.mtime).toLocaleString('hu-HU')}
                          </span>
                        </div>
                        <div className="db-backup-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => void onDownload(f.name)}
                            title="Letöltés"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: -2 }}>
                              <path d="M2 10v2h10v-2M7 2v7M4 7l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span className="db-btn-label"> Letöltés</span>
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm db-btn-delete"
                            onClick={() => setDeleteTarget(f.name)}
                            title="Törlés"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: -2 }}>
                              <path d="M3 4h8l-.75 8.25a1 1 0 01-1 .75H4.75a1 1 0 01-1-.75L3 4zM5.5 6.5v4M8.5 6.5v4M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span className="db-btn-label"> Törlés</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="db-pagination">
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: -2 }}>
                        <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                      Előző
                    </button>
                    <span className="db-pagination-info">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(safePage + 1)}
                    >
                      Következő
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: -2, marginLeft: 4 }}>
                        <path d="M5.5 3L9.5 7l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}

      <DirPickerModal
        open={!!dirPicker}
        title={dirPicker?.field === 'manual' ? 'Kézi mentés könyvtára' : 'Időzített mentés könyvtára'}
        initialPath={dirPicker?.current}
        onSelect={(path) => {
          if (dirPicker?.field === 'manual') setManualDirInput(path);
          else setScheduledDirInput(path);
        }}
        onClose={() => setDirPicker(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Mentés törlése"
        message={`Biztosan törölni akarod a „${deleteTarget}" mentést? Ez a művelet nem vonható vissza.`}
        confirmLabel="Törlés"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void doDelete()}
      />
    </>
  );
}
