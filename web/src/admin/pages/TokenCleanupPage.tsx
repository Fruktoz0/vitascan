import { useCallback, useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import type { RefreshTokenCleanupState } from '../../api/admin';
import { ApiError } from '../../api/client';

export function TokenCleanupPage() {
  const [data, setData] = useState<RefreshTokenCleanupState | null>(null);
  const [intervalHours, setIntervalHours] = useState(24);
  const [retentionDays, setRetentionDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminApi.getRefreshTokenCleanup();
      setData(res);
      setIntervalHours(res.intervalHours);
      setRetentionDays(res.revokedRetentionDays);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Betöltés sikertelen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await adminApi.patchRefreshTokenCleanup({
        intervalHours,
        revokedRetentionDays: retentionDays,
      });
      setData(res);
      setMessage('Beállítások elmentve.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mentés sikertelen.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await adminApi.runRefreshTokenCleanupNow();
      setData(res);
      setIntervalHours(res.intervalHours);
      setRetentionDays(res.revokedRetentionDays);
      setMessage(`${res.deleted} sor törölve.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Takarítás sikertelen.');
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p className="admin-muted">Betöltés…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <h1 className="admin-page-title">Refresh token takarítás</h1>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void load()}>
          Frissítés
        </button>
      </header>

      <p className="admin-muted" style={{ marginTop: '-0.5rem', marginBottom: '1.25rem', maxWidth: '52rem' }}>
        A szerver a futó API folyamatban percenként ellenőrzi, esedékes-e a takarítás — nem kell külön
        adatbázis-kliens vagy külső cron. A lejárt tokenek mindig törlődnek; a visszavontak a megadott megőrzési
        nap után.
      </p>

      {error ? <div className="admin-alert admin-alert-error">{error}</div> : null}
      {message ? <div className="admin-alert admin-alert-success">{message}</div> : null}

      {data ? (
        <div className="admin-stat-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Refresh token sorok</div>
            <div className="admin-stat-value">{data.totalRefreshTokens}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Utolsó futás</div>
            <div className="admin-stat-value" style={{ fontSize: '1.1rem' }}>
              {data.lastRunAt ? new Date(data.lastRunAt).toLocaleString('hu-HU') : '—'}
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Utolsó futáson törölve</div>
            <div className="admin-stat-value">{data.lastDeletedCount != null ? data.lastDeletedCount : '—'}</div>
          </div>
        </div>
      ) : null}

      <section className="admin-panel db-section">
        <div className="db-section-header">
          <div>
            <h2 className="admin-panel-title">Ütemezés és megőrzés</h2>
            <p className="admin-muted">Értékek mentése után az ütemező a következő percben már az új beállítást veszi figyelembe.</p>
          </div>
        </div>

        <form className="db-config-grid" onSubmit={handleSave}>
          <label className="db-config-field">
            <span className="db-schedule-field-label">Takarítás gyakorisága (óra)</span>
            <input
              type="number"
              className="admin-input"
              min={1}
              max={720}
              value={intervalHours}
              onChange={(ev) => setIntervalHours(Number(ev.target.value))}
              required
            />
            <p className="admin-stat-hint">1–720 óra (legfeljebb 30 nap). Ennyi időnként fut automatikusan.</p>
          </label>

          <label className="db-config-field">
            <span className="db-schedule-field-label">Visszavont token megőrzése (nap)</span>
            <input
              type="number"
              className="admin-input"
              min={0}
              max={365}
              value={retentionDays}
              onChange={(ev) => setRetentionDays(Number(ev.target.value))}
              required
            />
            <p className="admin-stat-hint">
              A visszavont sorok a megadott napnál régebbi revoked dátummal törlődnek. 0 = takarításkor minden
              visszavont törlődhet. A lejárt sorok ettől függetlenül mindig törlődnek.
            </p>
          </label>

          <div className="db-config-field" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                {saving ? 'Mentés…' : 'Beállítások mentése'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={running}
                onClick={() => void handleRunNow()}
              >
                {running ? 'Fut…' : 'Takarítás futtatása most'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
