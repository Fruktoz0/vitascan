import { useCallback, useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import type { AdminRecipeDetail, AdminRecipeRow, AdminRecipeStatus } from '../../api/admin';
import { ApiError } from '../../api/client';

const STATUS_LABEL: Record<AdminRecipeStatus, string> = {
  PENDING: 'Függőben',
  PUBLISHED: 'Publikált',
  REJECTED: 'Elutasítva',
};

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Kézi',
  IMAGE: 'Kép',
  VIDEO: 'Videó',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  WEB: 'Web',
};

export function RecipesPage() {
  const [status, setStatus] = useState<AdminRecipeStatus | ''>('PENDING');
  const [rows, setRows] = useState<AdminRecipeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRecipeDetail | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getRecipes({
        status: status || undefined,
        page: 1,
        limit: 50,
      });
      setRows(res.recipes);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'A lista betöltése sikertelen.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let revoked: string | null = null;
    if (!detail?.hasImage) {
      setImageUrl(null);
      return;
    }
    void adminApi.fetchRecipeImageObjectUrl(detail.id).then((url) => {
      revoked = url;
      setImageUrl(url);
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [detail?.id, detail?.hasImage]);

  async function openDetail(id: string) {
    try {
      setDetail(await adminApi.getRecipe(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'A recept betöltése sikertelen.');
    }
  }

  async function approve(id: string) {
    setBusy(true);
    try {
      await adminApi.approveRecipe(id);
      setDetail(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'A jóváhagyás sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    setBusy(true);
    try {
      await adminApi.rejectRecipe(id, rejectReason.trim() || undefined);
      setRejectReason('');
      setDetail(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Az elutasítás sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Receptek</h1>
          <p className="admin-muted">{total} recept{status ? ` · ${STATUS_LABEL[status]}` : ''}</p>
        </div>
      </header>

      <div className="admin-toolbar">
        {(['', 'PENDING', 'PUBLISHED', 'REJECTED'] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={`admin-btn ${status === s ? 'admin-btn-secondary' : 'admin-btn-ghost'}`}
            onClick={() => setStatus(s)}
          >
            {s ? STATUS_LABEL[s] : 'Összes'}
          </button>
        ))}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {loading && <p className="admin-muted">Betöltés…</p>}

      {!loading && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cím</th>
                <th>Beküldő</th>
                <th>Forrás</th>
                <th>Státusz</th>
                <th>Dátum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="admin-table-strong">{r.title}</td>
                  <td>{r.createdBy.username}</td>
                  <td>{SOURCE_LABEL[r.sourceType] ?? r.sourceType}</td>
                  <td>
                    <span className={`food-status-badge ${r.status === 'PENDING' ? 'food-status-unverified' : r.status === 'PUBLISHED' ? 'food-status-verified' : 'food-status-banned'}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td>{new Date(r.createdAt).toLocaleDateString('hu-HU')}</td>
                  <td>
                    <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void openDetail(r.id)}>
                      Megtekintés
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="admin-muted">Nincs recept ebben a szűrésben.</p>}
        </div>
      )}

      {detail && (
        <div className="admin-modal-root" role="presentation">
          <button type="button" className="admin-modal-backdrop" aria-label="Bezárás" onClick={() => setDetail(null)} />
          <div className="admin-modal food-modal" role="dialog" aria-modal="true">
            <div className="food-modal-header">
              <h2 className="admin-modal-title">{detail.title}</h2>
              <span className={`food-status-badge ${detail.status === 'PENDING' ? 'food-status-unverified' : detail.status === 'PUBLISHED' ? 'food-status-verified' : 'food-status-banned'}`}>
                {STATUS_LABEL[detail.status]}
              </span>
            </div>
            {imageUrl && <img src={imageUrl} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 12, maxHeight: 220, objectFit: 'cover' }} />}
            <div className="food-modal-meta">
              <span className="food-meta-chip"><strong>Beküldő:</strong> {detail.createdBy.username}</span>
              <span className="food-meta-chip"><strong>Forrás:</strong> {SOURCE_LABEL[detail.sourceType] ?? detail.sourceType}</span>
              <span className="food-meta-chip"><strong>Adag:</strong> {detail.servings}</span>
            </div>
            {detail.description && <p className="admin-muted">{detail.description}</p>}
            {detail.nutrition && (
              <p>
                {detail.nutrition.kcal} kcal / adag
                {detail.nutrition.incomplete ? ' · részleges tápérték' : ''}
              </p>
            )}
            <h3>Hozzávalók</h3>
            <ul>
              {detail.ingredients.map((ing) => (
                <li key={ing.id}>
                  {ing.name}
                  {ing.amount != null ? ` — ${ing.amount} ${ing.unit ?? ''}` : ''}
                  {ing.matchedFoodName ? ` (${ing.matchedFoodName})` : ''}
                </li>
              ))}
            </ul>
            {detail.instructions.length > 0 && (
              <>
                <h3>Elkészítés</h3>
                <ol>
                  {detail.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </>
            )}
            {detail.sourceUrl && (
              <p>
                <a href={detail.sourceUrl} target="_blank" rel="noreferrer">{detail.sourceUrl}</a>
              </p>
            )}
            {detail.rejectReason && <p className="admin-error">Indok: {detail.rejectReason}</p>}
            {detail.status !== 'REJECTED' && (
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Elutasítás indoka (opcionális)"
                rows={2}
                style={{ width: '100%', marginTop: 8 }}
              />
            )}
            <div className="admin-modal-actions">
              <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setDetail(null)}>Bezárás</button>
              {detail.status !== 'REJECTED' && (
                <button type="button" className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => void reject(detail.id)}>
                  Elutasítás
                </button>
              )}
              {detail.status !== 'PUBLISHED' && (
                <button type="button" className="admin-btn admin-btn-secondary" disabled={busy} onClick={() => void approve(detail.id)}>
                  Jóváhagyás
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
