import { useCallback, useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import type { AdminUserRow } from '../../api/admin';
import { ConfirmDialog } from '../components/ConfirmDialog';

const PAGE = 20;

export function UsersPage() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'USER' | 'ADMIN' | ''>('');
  const [offset, setOffset] = useState(0);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const [repUser, setRepUser] = useState<AdminUserRow | null>(null);
  const [repDelta, setRepDelta] = useState('');
  const [repReason, setRepReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminApi.getUsers({
          q: q || undefined,
          role: role || undefined,
          limit: PAGE,
          offset,
        });
        if (cancelled) return;
        setUsers(res.users);
        setTotal(res.total);
        setError(null);
      } catch {
        if (!cancelled) setError('Felhasználók betöltése sikertelen.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, role, offset]);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await adminApi.getUsers({
        q: q || undefined,
        role: role || undefined,
        limit: PAGE,
        offset,
      });
      setUsers(res.users);
      setTotal(res.total);
    } catch {
      setError('Felhasználók betöltése sikertelen.');
    } finally {
      setLoading(false);
    }
  }, [q, role, offset]);

  async function toggleRole(u: AdminUserRow) {
    const next = u.role === 'ADMIN' ? 'USER' : 'ADMIN';
    setBusyId(u.id);
    try {
      await adminApi.setUserRole(u.id, next);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleTier(u: AdminUserRow) {
    const cur = u.profile?.tier === 'PREMIUM' ? 'PREMIUM' : 'FREE';
    const next = cur === 'PREMIUM' ? 'FREE' : 'PREMIUM';
    setBusyId(u.id);
    try {
      await adminApi.setUserTier(u.id, next);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSoftDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    try {
      await adminApi.softDeleteUser(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function submitReputation() {
    if (!repUser) return;
    const delta = parseInt(repDelta, 10);
    if (Number.isNaN(delta) || delta === 0) return;
    setBusyId(repUser.id);
    try {
      await adminApi.adjustReputation(repUser.id, delta, repReason.trim() || undefined);
      setRepUser(null);
      setRepDelta('');
      setRepReason('');
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  const pageMax = Math.max(0, Math.ceil(total / PAGE) - 1);
  const pageIndex = Math.floor(offset / PAGE);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-page-title">Felhasználók</h1>
      </div>

      <div className="admin-toolbar">
        <div className="admin-toolbar-row">
          <input
            type="search"
            className="admin-input admin-input-grow"
            placeholder="Keresés név vagy email…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setQ(qInput.trim());
                setOffset(0);
              }
            }}
          />
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => {
              setQ(qInput.trim());
              setOffset(0);
            }}
          >
            Keresés
          </button>
          <select
            className="admin-select"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as '' | 'USER' | 'ADMIN');
              setOffset(0);
            }}
          >
            <option value="">Minden szerepkör</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <p className="admin-toolbar-meta">{total} felhasználó</p>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      {loading ? (
        <div className="admin-boot">
          <div className="admin-spinner" aria-hidden />
        </div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Felhasználó</th>
                  <th>Email</th>
                  <th>Szerepkör</th>
                  <th>Tier</th>
                  <th>Rep.</th>
                  <th>Aktivitás</th>
                  <th>Műveletek</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const deleted = !!u.deletedAt;
                  const disabled = busyId === u.id;
                  const tierLabel = u.profile?.tier === 'PREMIUM' ? 'Premium' : 'Free';
                  return (
                    <tr key={u.id} className={deleted ? 'admin-row-muted' : undefined}>
                      <td>
                        <div className="admin-cell-stack">
                          <span className="admin-table-strong">{u.username}</span>
                          {deleted && (
                            <span className="admin-badge admin-badge-danger">Törölt</span>
                          )}
                        </div>
                      </td>
                      <td className="admin-muted admin-cell-email">{u.email}</td>
                      <td>
                        <span className="admin-badge admin-badge-muted">{u.role}</span>
                      </td>
                      <td>{tierLabel}</td>
                      <td>{u.reputation}</td>
                      <td className="admin-muted admin-cell-stats">
                        {u._count.createdFoods} étel · {u._count.logs} napló
                      </td>
                      <td>
                        {!deleted && (
                          <div className="admin-actions-cell">
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                              disabled={disabled}
                              onClick={() => toggleRole(u)}
                            >
                              {u.role === 'ADMIN' ? '→ User' : '→ Admin'}
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                              disabled={disabled}
                              onClick={() => toggleTier(u)}
                            >
                              {tierLabel === 'Premium' ? '→ Free' : '→ Premium'}
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                              disabled={disabled}
                              onClick={() => {
                                setRepUser(u);
                                setRepDelta('');
                                setRepReason('');
                              }}
                            >
                              Rep.
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-danger"
                              disabled={disabled}
                              onClick={() => setPendingDelete(u)}
                            >
                              GDPR törlés
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {users.length === 0 && (
              <p className="admin-empty">Nincs megjeleníthető felhasználó.</p>
            )}
          </div>

          <div className="admin-pagination">
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              disabled={offset <= 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              Előző
            </button>
            <span className="admin-pagination-meta">
              Oldal {pageIndex + 1} / {Math.max(1, pageMax + 1)}
            </span>
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              disabled={offset + PAGE >= total}
              onClick={() => setOffset(offset + PAGE)}
            >
              Következő
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Fiók soft törlés (GDPR)"
        message={`${pendingDelete?.username} fiókja soft-törölve lesz (30 nap türelmi idő).`}
        confirmLabel="Törlés"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmSoftDelete}
      />

      {repUser && (
        <div className="admin-modal-root" role="presentation">
          <button
            type="button"
            className="admin-modal-backdrop"
            aria-label="Bezárás"
            onClick={() => !busyId && setRepUser(null)}
          />
          <div className="admin-modal" role="dialog" aria-modal="true">
            <h2 className="admin-modal-title">Reputáció: {repUser.username}</h2>
            <p className="admin-modal-body admin-muted">Jelenlegi: {repUser.reputation} pont</p>
            <label className="admin-label">
              Módosítás (pl. +5 vagy -3)
              <input
                className="admin-input"
                value={repDelta}
                onChange={(e) => setRepDelta(e.target.value)}
                placeholder="+5"
              />
            </label>
            <label className="admin-label">
              Indoklás (opcionális)
              <textarea
                className="admin-textarea"
                rows={3}
                value={repReason}
                onChange={(e) => setRepReason(e.target.value)}
                placeholder="pl. minőségi étel beküldés"
              />
            </label>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                disabled={!!busyId}
                onClick={() => setRepUser(null)}
              >
                Mégse
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={!!busyId}
                onClick={() => void submitReputation()}
              >
                Alkalmaz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
