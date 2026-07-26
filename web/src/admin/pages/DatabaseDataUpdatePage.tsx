import { useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import type { DatabaseStatusResponse } from '../../api/admin';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function DatabaseDataUpdatePage() {
  const [status, setStatus] = useState<DatabaseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [confirmUpload, setConfirmUpload] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await adminApi.getDatabaseStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) {
          setStatus(null);
          setError(e instanceof ApiError ? e.message : 'Betöltés sikertelen.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function doUpload() {
    if (!uploadFile) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await adminApi.dataMergeFromUpload(uploadFile);
      setMessage(result.message || 'Adatfrissítés sikeres.');
      setConfirmUpload(false);
      setUploadFile(null);
      const fileInput = document.querySelector<HTMLInputElement>('.db-update-file-input');
      if (fileInput) fileInput.value = '';
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Frissítés sikertelen.');
      setConfirmUpload(false);
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
        <h1 className="admin-page-title">Adatbázis frissítése</h1>
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
        </section>
      )}

      {showOps && (
        <>
          {/* Explanation panel */}
          <section className="admin-panel db-section">
            <div className="db-section-header">
              <div>
                <h2 className="admin-panel-title">Szelektív adatfrissítés</h2>
                <p className="admin-muted">
                  Új sorokat tölthetsz be a meglévő adatbázisba (ételek, naplók stb.) anélkül, hogy a jelenlegi
                  tartalom törlődne vagy felülíródna.
                </p>
              </div>
            </div>

            <div className="db-info-cards">
              <div className="db-info-card db-info-card-green">
                <div className="db-info-card-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <strong>Ami történik</strong>
                  <p>
                    A cél séma összes releváns táblájára (User, Food, FoodFavorite, FoodEditLog, naplók stb.)
                    csak az új sorok kerülnek be. Meglévő elsődleges / egyedi kulcsok (pl. étel <code>id</code>,{' '}
                    <code>barcode</code>, <code>externalId</code>) <strong>nem frissülnek</strong> — a mentésbeli
                    értékük kimarad. Oszlopeltérésnél csak a közös mezők mennek át; hiányzó creator / FK miatt
                    árva sorok kimaradnak (az import nem áll le). A <code>_prisma_migrations</code> táblát nem
                    módosítjuk.
                  </p>
                </div>
              </div>

              <div className="db-info-card db-info-card-blue">
                <div className="db-info-card-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <strong>Támogatott formátumok</strong>
                  <p>
                    <code>.sql</code> — közvetlenül psql-lel fut (bármit csinálhat a SQL — óvatosan).<br />
                    <code>.dump</code> / <code>.backup</code> — PostgreSQL 15+ és <code>postgres_fdw</code> kiterjesztés
                    szükséges; a régi kliens <code>transaction_timeout</code> sorai szűrve vannak.
                  </p>
                </div>
              </div>

              <div className="db-info-card db-info-card-amber">
                <div className="db-info-card-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 3l7.32 12.66H2.68L10 3z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
                    <path d="M10 8.5v3M10 13.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <strong>Fontos</strong>
                  <p>
                    Ez NEM teljes visszaállítás — a séma nem változik, csak hiányzó adatok kerülnek be.
                    Teljes felülíráshoz használd a <strong>Rendszer visszaállítás</strong> menüt.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Upload section */}
          <section className="admin-panel db-section">
            <h2 className="admin-panel-title">Fájl feltöltése</h2>
            <p className="admin-muted" style={{ marginBottom: '1rem' }}>
              Válaszd ki a frissítési fájlt és indítsd el az importot.
            </p>

            <div className="db-upload-zone">
              <div className="db-upload-icon">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <path d="M20 26V14M14 20l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6 28v4a2 2 0 002 2h24a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="db-upload-text">
                {uploadFile ? (
                  <>
                    <strong>{uploadFile.name}</strong>
                    <br />
                    <span className="admin-muted">
                      {(uploadFile.size / 1024).toFixed(1)} KB
                    </span>
                  </>
                ) : (
                  'Válassz egy .sql, .dump vagy .backup fájlt'
                )}
              </p>
              <input
                type="file"
                className="db-update-file-input"
                accept=".dump,.backup,.sql,application/octet-stream"
                disabled={busy}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={busy || !uploadFile}
                onClick={() => setConfirmUpload(true)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6, verticalAlign: -2 }}>
                  <path d="M8 2v8M5 7l3 3 3-3M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Frissítés indítása
              </button>
              {busy && (
                <span className="admin-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="admin-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} aria-hidden />
                  Importálás folyamatban...
                </span>
              )}
            </div>
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmUpload}
        title="Adatfrissítés indítása"
        message={`A „${uploadFile?.name}" fájl tartalmát importáljuk: csak új sorok (létező étel / barcode / unique kulcsok érintetlenek). A meglévő adatok nem törlődnek és nem frissülnek. Folytatod?`}
        confirmLabel="Frissítés indítása"
        onCancel={() => setConfirmUpload(false)}
        onConfirm={() => void doUpload()}
      />
    </>
  );
}
