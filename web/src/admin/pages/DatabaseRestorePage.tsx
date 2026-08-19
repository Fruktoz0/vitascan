import { useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import type { BackupFileRow, DatabaseStatusResponse } from '../../api/admin';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatBytes } from '../database/formatBytes';

export function DatabaseRestorePage() {
  const [status, setStatus] = useState<DatabaseStatusResponse | null>(null);
  const [files, setFiles] = useState<BackupFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [confirmUpload, setConfirmUpload] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setMessage(null);
      try {
        const s = await adminApi.getDatabaseStatus();
        if (cancelled) return;
        setStatus(s);
        setError(null);
        if (s.configured && s.ok) {
          const list = await adminApi.listDatabaseBackups();
          if (cancelled) return;
          setFiles(list.files);
        } else {
          setFiles([]);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus(null);
          if (e instanceof ApiError && e.status === 404) {
            setError(
              '404 – Az API nem ismeri az /admin/database/* végpontokat. Gyökér docker-compose + legfrissebb backend szükséges.',
            );
          } else {
            setError(e instanceof ApiError ? e.message : 'Betöltés sikertelen.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const s = await adminApi.getDatabaseStatus();
      setStatus(s);
      setError(null);
      if (s.configured && s.ok) {
        const list = await adminApi.listDatabaseBackups();
        setFiles(list.files);
      } else {
        setFiles([]);
      }
    } catch (e) {
      setStatus(null);
      if (e instanceof ApiError && e.status === 404) {
        setError('404 – Frissítsd a backendet és indítsd újra az api konténert.');
      } else {
        setError(e instanceof ApiError ? e.message : 'Betöltés sikertelen.');
      }
    } finally {
      setLoading(false);
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

  async function doRestore() {
    if (!restoreTarget) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.restoreDatabaseFromFile(restoreTarget);
      setMessage(r.message || 'Rendszer-visszaállítás lefutott.');
      setRestoreTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Visszaállítás sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  async function doRestoreUpload() {
    if (!uploadFile) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.restoreDatabaseFromUpload(uploadFile);
      setMessage(r.message || 'Feltöltött mentés alapján a rendszer-visszaállítás lefutott.');
      setConfirmUpload(false);
      setUploadFile(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Visszaállítás sikertelen.');
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

  return (
    <>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Rendszer visszaállítás fájlból</h1>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void refresh()} disabled={busy}>
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
            <code>DB_TOOLS_SECRET</code> értéket kapjon.             Ha <code>pg_restore</code> hibát ír: <code>transaction_timeout</code> → a kliens újabb, mint a szerver –
            csökkentsd <code>PG_MAJOR</code>-t a szerverhez. <code>unsupported version (1.16) in file header</code> → a
            mentés újabb <code>pg_dump</code>-pal készült – növeld <code>PG_MAJOR</code>-t (17-es dump → legalább 17).
            Lásd <code>PG_MAJOR</code> a gyökér <code>.env.example</code>-ben, majd{' '}
            <code>docker compose build db-tools --no-cache</code>.
          </p>
        </section>
      )}

      {showOps && (
        <>
          <section className="admin-panel">
            <h2 className="admin-panel-title">Mentések a szerveren</h2>
            <p className="admin-muted">
              Teljes visszaállítás (felülírás): új <code>.tar.gz</code> csomag az adatbázist <em>és</em> a
              receptképeket is visszaállítja. Régi <code>.dump</code> / <code>.sql</code> csak a DB-t.
              Régi mentés felülírhatja / eltüntetheti az újabb táblákat és oszlopokat (pl. <code>Recipe</code>,{' '}
              <code>MealTemplate</code>, <code>FoodComponent</code>, <code>DataShare</code>,{' '}
              <code>ShoppingList</code>, <code>FastSession</code>, DailyLog <code>logGroupId</code>,
              UserProfile kártya-/böjtmezők, NotificationPref <code>fastingGoalEnabled</code>). Restore után
              indítsd újra a stacket, hogy a compose <code>prisma db push</code> (és a WaterLog napi migráció)
              visszaállítsa a hiányzó sémát — óvatosan, adatvesztés nélkül ellenőrizd.
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fájl</th>
                    <th>Méret</th>
                    <th>Időpont</th>
                    <th>Műveletek</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.name}>
                      <td className="admin-table-strong">
                        {f.name}
                        {f.containsMedia ? (
                          <span className="admin-muted"> · DB + képek</span>
                        ) : (
                          <span className="admin-muted"> · csak DB</span>
                        )}
                      </td>
                      <td>{formatBytes(f.size)}</td>
                      <td className="admin-muted">{new Date(f.mtime).toLocaleString('hu-HU')}</td>
                      <td>
                        <div className="admin-actions-cell">
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => void onDownload(f.name)}
                          >
                            Letöltés
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() => setRestoreTarget(f.name)}
                          >
                            Visszaállítás
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {files.length === 0 && <p className="admin-empty">Még nincs mentés a mappában.</p>}
            </div>
          </section>

          <section className="admin-panel admin-panel-danger-zone">
            <h2 className="admin-panel-title">Helyi fájl feltöltése</h2>
            <p className="admin-muted">
              <strong>Figyelem:</strong> ugyanaz, mint a táblázatos visszaállítás – felülírja az adatbázis tartalmát
              és a receptképeket a csomagból. Régi dump + újabb app séma esetén a hiányzó táblák / oszlopok restore
              után is hiányozhatnak, amíg a stack újraindulása (séma push) le nem fut.
            </p>
            <div className="admin-toolbar-row" style={{ marginTop: '0.75rem' }}>
              <input
                type="file"
                accept=".tar.gz,.tgz,.tar,.dump,.backup,.sql,application/gzip,application/octet-stream"
                disabled={busy}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                disabled={busy || !uploadFile}
                onClick={() => setConfirmUpload(true)}
              >
                Feltöltés és rendszer-visszaállítás
              </button>
            </div>
          </section>
        </>
      )}

      <ConfirmDialog
        open={!!restoreTarget}
        title="Rendszer visszaállítása fájlból"
        message={`A „${restoreTarget}” fájlból történő visszaállítás törli / felülírja a jelenlegi adatokat. .tar.gz csomag esetén a receptképek is felülíródnak. Régi mentés esetén újabb táblák eltűnhetnek a sémából. Biztosan folytatod?`}
        confirmLabel="Visszaállítás"
        danger
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => void doRestore()}
      />

      <ConfirmDialog
        open={confirmUpload}
        title="Rendszer visszaállítása feltöltött fájlból"
        message={`A kiválasztott fájl (${uploadFile?.name}) teljes visszaállítást végez (adatbázis, és .tar.gz esetén receptképek). Ez nem vonható vissza.`}
        confirmLabel="Visszaállítás"
        danger
        onCancel={() => setConfirmUpload(false)}
        onConfirm={() => void doRestoreUpload()}
      />
    </>
  );
}
