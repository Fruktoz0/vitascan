import { useCallback, useEffect, useRef, useState } from 'react';
import * as adminApi from '../../api/admin';
import type { FoodDetail, FoodStatus } from '../../api/admin';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';

const PAGE = 20;

type FoodRow = {
  id: string;
  name: string;
  nameHu?: string | null;
  nameEn?: string | null;
  displayName?: string;
  brand?: string | null;
  status: FoodStatus;
  barcode?: string | null;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  score?: number;
  creator?: { username: string } | null;
};

const STATUS_LABELS: Record<FoodStatus, string> = {
  UNVERIFIED: 'Függőben',
  VERIFIED: 'Ellenőrzött',
  BANNED: 'Tiltott',
};

const STATUS_CLS: Record<FoodStatus, string> = {
  UNVERIFIED: 'food-status-unverified',
  VERIFIED: 'food-status-verified',
  BANNED: 'food-status-banned',
};

function NutrRow({ label, value, unit }: { label: string; value?: number | null; unit?: string }) {
  if (value == null) return null;
  return (
    <div className="food-nutr-row">
      <span className="food-nutr-label">{label}</span>
      <span className="food-nutr-value">{value.toFixed(1)}{unit ? ` ${unit}` : ''}</span>
    </div>
  );
}

// ── Food Detail Modal ──────────────────────────────────────────────────────────

function FoodDetailModal({ food, onClose, onEdit }: { food: FoodDetail; onClose: () => void; onEdit: () => void }) {
  const name = food.displayName ?? food.nameHu ?? food.nameEn ?? food.name;
  return (
    <div className="admin-modal-root" role="presentation">
      <button type="button" className="admin-modal-backdrop" aria-label="Bezárás" onClick={onClose} />
      <div className="admin-modal food-modal" role="dialog" aria-modal="true" aria-labelledby="food-detail-title">
        <div className="food-modal-header">
          <div>
            <h2 id="food-detail-title" className="admin-modal-title">{name}</h2>
            {food.brand && <p className="food-modal-brand">{food.brand}</p>}
          </div>
          <span className={`food-status-badge ${STATUS_CLS[food.status]}`}>
            {STATUS_LABELS[food.status]}
          </span>
        </div>

        <div className="food-modal-meta">
          {food.barcode && <span className="food-meta-chip"><strong>Vonalkód:</strong> {food.barcode}</span>}
          {food.nameHu && <span className="food-meta-chip"><strong>HU:</strong> {food.nameHu}</span>}
          {food.nameEn && <span className="food-meta-chip"><strong>EN:</strong> {food.nameEn}</span>}
          <span className="food-meta-chip"><strong>Forrás:</strong> {food.source}</span>
          <span className="food-meta-chip"><strong>Szint:</strong> {food.tier}</span>
          {food.creator && <span className="food-meta-chip"><strong>Beküldő:</strong> {food.creator.username}</span>}
          <span className="food-meta-chip"><strong>Pontszám:</strong> {food.score ?? 0}</span>
          <span className="food-meta-chip"><strong>Létrehozva:</strong> {new Date(food.createdAt).toLocaleDateString('hu-HU')}</span>
        </div>

        <div className="food-nutr-grid">
          <div className="food-nutr-card food-nutr-card-main">
            <div className="food-nutr-card-label">Kalória</div>
            <div className="food-nutr-card-value">{food.kcal.toFixed(0)}</div>
            <div className="food-nutr-card-unit">kcal / 100g</div>
          </div>
          <div className="food-nutr-card">
            <div className="food-nutr-card-label">Fehérje</div>
            <div className="food-nutr-card-value">{food.protein.toFixed(1)}</div>
            <div className="food-nutr-card-unit">g</div>
          </div>
          <div className="food-nutr-card">
            <div className="food-nutr-card-label">Szénhidrát</div>
            <div className="food-nutr-card-value">{food.carbs.toFixed(1)}</div>
            <div className="food-nutr-card-unit">g</div>
          </div>
          <div className="food-nutr-card">
            <div className="food-nutr-card-label">Zsír</div>
            <div className="food-nutr-card-value">{food.fat.toFixed(1)}</div>
            <div className="food-nutr-card-unit">g</div>
          </div>
        </div>

        <div className="food-nutr-details">
          <NutrRow label="Rost" value={food.fiber} unit="g / 100g" />
          <NutrRow label="Cukor" value={food.sugar} unit="g / 100g" />
          {food.servingSize != null && (
            <NutrRow label="Adag méret" value={food.servingSize} unit={food.servingUnit ?? 'g'} />
          )}
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose}>Bezárás</button>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onEdit}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 5, verticalAlign: -2 }}>
              <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            Szerkesztés
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Food Edit Modal ────────────────────────────────────────────────────────────

function FoodEditModal({ food, onClose, onSaved }: { food: FoodDetail; onClose: () => void; onSaved: (updated: FoodDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(food.name);
  const [nameHu, setNameHu] = useState(food.nameHu ?? '');
  const [nameEn, setNameEn] = useState(food.nameEn ?? '');
  const [brand, setBrand] = useState(food.brand ?? '');
  const [barcode, setBarcode] = useState(food.barcode ?? '');
  const [status, setStatus] = useState<FoodStatus>(food.status);
  const [kcal, setKcal] = useState(String(food.kcal));
  const [protein, setProtein] = useState(String(food.protein));
  const [carbs, setCarbs] = useState(String(food.carbs));
  const [fat, setFat] = useState(String(food.fat));
  const [fiber, setFiber] = useState(food.fiber != null ? String(food.fiber) : '');
  const [sugar, setSugar] = useState(food.sugar != null ? String(food.sugar) : '');
  const [servingSize, setServingSize] = useState(food.servingSize != null ? String(food.servingSize) : '');
  const [servingUnit, setServingUnit] = useState(food.servingUnit ?? '');

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.updateFood(food.id, {
        name: name.trim() || food.name,
        nameHu: nameHu.trim() || null,
        nameEn: nameEn.trim() || null,
        brand: brand.trim() || null,
        barcode: barcode.trim() || null,
        status,
        kcal: parseFloat(kcal) || 0,
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
        fiber: fiber.trim() ? parseFloat(fiber) : null,
        sugar: sugar.trim() ? parseFloat(sugar) : null,
        servingSize: servingSize.trim() ? parseFloat(servingSize) : null,
        servingUnit: servingUnit.trim() || null,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mentés sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal-root" role="presentation">
      <button type="button" className="admin-modal-backdrop" aria-label="Bezárás" onClick={onClose} />
      <div className="admin-modal food-modal food-edit-modal" role="dialog" aria-modal="true" aria-labelledby="food-edit-title">
        <h2 id="food-edit-title" className="admin-modal-title">Étel szerkesztése</h2>

        {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <div className="food-edit-form">
          <div className="food-edit-section">
            <p className="food-edit-section-title">Azonosítók</p>
            <div className="food-edit-grid">
              <label className="food-edit-field food-edit-field-wide">
                <span>Belső név</span>
                <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </label>
              <label className="food-edit-field">
                <span>Magyar név</span>
                <input className="admin-input" value={nameHu} onChange={(e) => setNameHu(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
              <label className="food-edit-field">
                <span>Angol név</span>
                <input className="admin-input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
              <label className="food-edit-field">
                <span>Márka</span>
                <input className="admin-input" value={brand} onChange={(e) => setBrand(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
              <label className="food-edit-field">
                <span>Vonalkód</span>
                <input className="admin-input" value={barcode} onChange={(e) => setBarcode(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
              <label className="food-edit-field">
                <span>Státusz</span>
                <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value as FoodStatus)} disabled={busy}>
                  <option value="UNVERIFIED">Függőben</option>
                  <option value="VERIFIED">Ellenőrzött</option>
                  <option value="BANNED">Tiltott</option>
                </select>
              </label>
            </div>
          </div>

          <div className="food-edit-section">
            <p className="food-edit-section-title">Tápanyagok (100g-ra)</p>
            <div className="food-edit-grid">
              <label className="food-edit-field">
                <span>Kalória (kcal)</span>
                <input className="admin-input" type="number" min="0" step="0.1" value={kcal} onChange={(e) => setKcal(e.target.value)} disabled={busy} />
              </label>
              <label className="food-edit-field">
                <span>Fehérje (g)</span>
                <input className="admin-input" type="number" min="0" step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} disabled={busy} />
              </label>
              <label className="food-edit-field">
                <span>Szénhidrát (g)</span>
                <input className="admin-input" type="number" min="0" step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} disabled={busy} />
              </label>
              <label className="food-edit-field">
                <span>Zsír (g)</span>
                <input className="admin-input" type="number" min="0" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} disabled={busy} />
              </label>
              <label className="food-edit-field">
                <span>Rost (g) — opcionális</span>
                <input className="admin-input" type="number" min="0" step="0.1" value={fiber} onChange={(e) => setFiber(e.target.value)} disabled={busy} placeholder="—" />
              </label>
              <label className="food-edit-field">
                <span>Cukor (g) — opcionális</span>
                <input className="admin-input" type="number" min="0" step="0.1" value={sugar} onChange={(e) => setSugar(e.target.value)} disabled={busy} placeholder="—" />
              </label>
            </div>
          </div>

          <div className="food-edit-section">
            <p className="food-edit-section-title">Adag</p>
            <div className="food-edit-grid">
              <label className="food-edit-field">
                <span>Adag méret</span>
                <input className="admin-input" type="number" min="0" step="0.5" value={servingSize} onChange={(e) => setServingSize(e.target.value)} disabled={busy} placeholder="pl. 30" />
              </label>
              <label className="food-edit-field">
                <span>Adag egység</span>
                <input className="admin-input" value={servingUnit} onChange={(e) => setServingUnit(e.target.value)} disabled={busy} placeholder="pl. adag, db, ek" />
              </label>
            </div>
          </div>
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose} disabled={busy}>Mégse</button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => void handleSave()} disabled={busy}>
            {busy ? 'Mentés...' : 'Mentés'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Food Create Modal ──────────────────────────────────────────────────────────

function FoodCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (food: FoodDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [nameHu, setNameHu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [status, setStatus] = useState<FoodStatus>('VERIFIED');
  const [tier, setTier] = useState<'FREE' | 'PREMIUM'>('FREE');
  const [source, setSource] = useState<'INTERNAL' | 'USER_SCAN' | 'EXTERNAL_API'>('INTERNAL');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [servingUnit, setServingUnit] = useState('');

  const missingRequired = !name.trim() || !kcal.trim() || !protein.trim() || !carbs.trim() || !fat.trim();

  async function handleCreate() {
    if (missingRequired) return;
    setBusy(true);
    setError(null);
    try {
      const created = await adminApi.createFood({
        name: name.trim(),
        nameHu: nameHu.trim() || null,
        nameEn: nameEn.trim() || null,
        brand: brand.trim() || null,
        barcode: barcode.trim() || null,
        kcal: parseFloat(kcal) || 0,
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
        fiber: fiber.trim() ? parseFloat(fiber) : null,
        sugar: sugar.trim() ? parseFloat(sugar) : null,
        servingSize: servingSize.trim() ? parseFloat(servingSize) : null,
        servingUnit: servingUnit.trim() || null,
        status,
        tier,
        source,
      });
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Létrehozás sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal-root" role="presentation">
      <button type="button" className="admin-modal-backdrop" aria-label="Bezárás" onClick={onClose} />
      <div className="admin-modal food-modal food-edit-modal" role="dialog" aria-modal="true" aria-labelledby="food-create-title">
        <h2 id="food-create-title" className="admin-modal-title">Új étel hozzáadása</h2>

        {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <div className="food-edit-form">
          {/* Azonosítók */}
          <div className="food-edit-section">
            <p className="food-edit-section-title">Azonosítók</p>
            <div className="food-edit-grid">
              <label className="food-edit-field food-edit-field-wide">
                <span>
                  Belső név <span className="food-required-star">*</span>
                </span>
                <input
                  className="admin-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  placeholder="pl. Görög joghurt"
                  autoFocus
                />
              </label>
              <label className="food-edit-field">
                <span>Magyar név</span>
                <input className="admin-input" value={nameHu} onChange={(e) => setNameHu(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
              <label className="food-edit-field">
                <span>Angol név</span>
                <input className="admin-input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
              <label className="food-edit-field">
                <span>Márka</span>
                <input className="admin-input" value={brand} onChange={(e) => setBrand(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
              <label className="food-edit-field">
                <span>Vonalkód</span>
                <input className="admin-input" value={barcode} onChange={(e) => setBarcode(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
            </div>
          </div>

          {/* Tápanyagok */}
          <div className="food-edit-section">
            <p className="food-edit-section-title">Tápanyagok (100g-ra)</p>
            <div className="food-edit-grid">
              <label className="food-edit-field">
                <span>Kalória (kcal) <span className="food-required-star">*</span></span>
                <input className="admin-input" type="number" min="0" step="0.1" value={kcal} onChange={(e) => setKcal(e.target.value)} disabled={busy} placeholder="pl. 59" />
              </label>
              <label className="food-edit-field">
                <span>Fehérje (g) <span className="food-required-star">*</span></span>
                <input className="admin-input" type="number" min="0" step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} disabled={busy} placeholder="pl. 10.0" />
              </label>
              <label className="food-edit-field">
                <span>Szénhidrát (g) <span className="food-required-star">*</span></span>
                <input className="admin-input" type="number" min="0" step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} disabled={busy} placeholder="pl. 3.6" />
              </label>
              <label className="food-edit-field">
                <span>Zsír (g) <span className="food-required-star">*</span></span>
                <input className="admin-input" type="number" min="0" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} disabled={busy} placeholder="pl. 0.4" />
              </label>
              <label className="food-edit-field">
                <span>Rost (g)</span>
                <input className="admin-input" type="number" min="0" step="0.1" value={fiber} onChange={(e) => setFiber(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
              <label className="food-edit-field">
                <span>Cukor (g)</span>
                <input className="admin-input" type="number" min="0" step="0.1" value={sugar} onChange={(e) => setSugar(e.target.value)} disabled={busy} placeholder="opcionális" />
              </label>
            </div>
          </div>

          {/* Adag */}
          <div className="food-edit-section">
            <p className="food-edit-section-title">Adag</p>
            <div className="food-edit-grid">
              <label className="food-edit-field">
                <span>Adag méret</span>
                <input className="admin-input" type="number" min="0" step="0.5" value={servingSize} onChange={(e) => setServingSize(e.target.value)} disabled={busy} placeholder="pl. 150" />
              </label>
              <label className="food-edit-field">
                <span>Adag egység</span>
                <input className="admin-input" value={servingUnit} onChange={(e) => setServingUnit(e.target.value)} disabled={busy} placeholder="pl. adag, db, ek" />
              </label>
            </div>
          </div>

          {/* Kategorizálás */}
          <div className="food-edit-section">
            <p className="food-edit-section-title">Kategorizálás</p>
            <div className="food-edit-grid">
              <label className="food-edit-field">
                <span>Státusz</span>
                <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value as FoodStatus)} disabled={busy}>
                  <option value="VERIFIED">Ellenőrzött</option>
                  <option value="UNVERIFIED">Függőben</option>
                  <option value="BANNED">Tiltott</option>
                </select>
              </label>
              <label className="food-edit-field">
                <span>Szint</span>
                <select className="admin-select" value={tier} onChange={(e) => setTier(e.target.value as 'FREE' | 'PREMIUM')} disabled={busy}>
                  <option value="FREE">Ingyenes</option>
                  <option value="PREMIUM">Prémium</option>
                </select>
              </label>
              <label className="food-edit-field">
                <span>Forrás</span>
                <select className="admin-select" value={source} onChange={(e) => setSource(e.target.value as 'INTERNAL' | 'USER_SCAN' | 'EXTERNAL_API')} disabled={busy}>
                  <option value="INTERNAL">Belső (admin)</option>
                  <option value="USER_SCAN">Felhasználói scan</option>
                  <option value="EXTERNAL_API">Külső API</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {missingRequired && (
          <p className="food-required-note">
            <span className="food-required-star">*</span> Jelölt mezők kitöltése kötelező.
          </p>
        )}

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose} disabled={busy}>Mégse</button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => void handleCreate()}
            disabled={busy || missingRequired}
          >
            {busy ? 'Létrehozás...' : 'Étel létrehozása'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main FoodsPage ─────────────────────────────────────────────────────────────

export function FoodsPage() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<FoodStatus | ''>('');
  const [offset, setOffset] = useState(0);
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FoodRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<FoodStatus>('VERIFIED');

  // Create
  const [showCreate, setShowCreate] = useState(false);

  // Detail / edit
  const [detailFood, setDetailFood] = useState<FoodDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const loadingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadingRef.current = true;
    setLoading(true);
    (async () => {
      try {
        const res = await adminApi.getFoods({
          q: q || undefined,
          status: statusFilter || undefined,
          limit: PAGE,
          offset,
        });
        if (cancelled) return;
        setFoods(res.foods as FoodRow[]);
        setTotal(res.total);
        setError(null);
        setSelected(new Set());
      } catch {
        if (!cancelled) setError('Ételek betöltése sikertelen.');
      } finally {
        if (!cancelled) { setLoading(false); loadingRef.current = false; }
      }
    })();
    return () => { cancelled = true; };
  }, [q, statusFilter, offset]);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await adminApi.getFoods({
        q: q || undefined,
        status: statusFilter || undefined,
        limit: PAGE,
        offset,
      });
      setFoods(res.foods as FoodRow[]);
      setTotal(res.total);
      setSelected(new Set());
    } catch {
      setError('Ételek betöltése sikertelen.');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, offset]);

  // Load detail
  async function openDetail(id: string) {
    setDetailLoading(true);
    setShowEdit(false);
    try {
      const food = await adminApi.getFoodDetail(id);
      setDetailFood(food);
    } catch {
      setDetailFood(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailFood(null);
    setShowEdit(false);
  }

  function handleFoodCreated(created: FoodDetail) {
    setShowCreate(false);
    setMessage(`„${created.displayName ?? created.name}" sikeresen létrehozva.`);
    void reload();
  }

  function handleDetailSaved(updated: FoodDetail) {
    setDetailFood(updated);
    setShowEdit(false);
    setMessage(`„${updated.displayName ?? updated.name}" frissítve.`);
    void reload();
  }

  async function handleStatusChange(row: FoodRow, next: FoodStatus) {
    if (next === row.status) return;
    setBusyId(row.id);
    try {
      await adminApi.setFoodStatus(row.id, next);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    try {
      await adminApi.deleteFood(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleBulkStatus() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await adminApi.bulkSetFoodStatus([...selected], bulkStatus);
      setMessage(`${res.updated} étel státusza módosítva: ${STATUS_LABELS[bulkStatus]}.`);
      setSelected(new Set());
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Tömeges módosítás sikertelen.');
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === foods.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(foods.map((f) => f.id)));
    }
  }

  const allSelected = foods.length > 0 && selected.size === foods.length;
  const someSelected = selected.size > 0 && !allSelected;
  const pageMax = Math.max(0, Math.ceil(total / PAGE) - 1);
  const pageIndex = Math.floor(offset / PAGE);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-page-title">Ételek</h1>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={() => setShowCreate(true)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Új étel
        </button>
      </div>

      {message && <div className="admin-alert admin-alert-success" style={{ marginBottom: '1rem' }}>{message}</div>}
      {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="admin-toolbar">
        <div className="admin-toolbar-row">
          <input
            type="search"
            className="admin-input admin-input-grow"
            placeholder="Keresés névre…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setQ(qInput.trim()); setOffset(0); }
            }}
          />
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => { setQ(qInput.trim()); setOffset(0); }}
          >
            Keresés
          </button>
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as FoodStatus | ''); setOffset(0); }}
          >
            <option value="">Minden státusz</option>
            <option value="UNVERIFIED">Függőben</option>
            <option value="VERIFIED">Ellenőrzött</option>
            <option value="BANNED">Tiltott</option>
          </select>
        </div>
        <p className="admin-toolbar-meta">{total} találat</p>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="food-bulk-bar">
          <span className="food-bulk-count">{selected.size} kijelölve</span>
          <select
            className="admin-select"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as FoodStatus)}
            disabled={bulkBusy}
          >
            <option value="VERIFIED">Ellenőrzött</option>
            <option value="UNVERIFIED">Függőben</option>
            <option value="BANNED">Tiltott</option>
          </select>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={bulkBusy}
            onClick={() => void handleBulkStatus()}
          >
            {bulkBusy ? 'Feldolgozás...' : 'Státusz alkalmazása'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            disabled={bulkBusy}
            onClick={() => setSelected(new Set())}
          >
            Kijelölés törlése
          </button>
        </div>
      )}

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
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      className="food-checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      title="Összes kijelölése"
                    />
                  </th>
                  <th>Név</th>
                  <th>Vonalkód</th>
                  <th>kcal</th>
                  <th>Fehérje</th>
                  <th>Beküldő</th>
                  <th>Státusz</th>
                  <th>Műveletek</th>
                </tr>
              </thead>
              <tbody>
                {foods.map((row) => {
                  const name = row.displayName ?? row.nameHu ?? row.nameEn ?? row.name ?? '—';
                  const disabled = busyId === row.id || bulkBusy;
                  const isSelected = selected.has(row.id);
                  return (
                    <tr key={row.id} className={isSelected ? 'food-row-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          className="food-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(row.id)}
                        />
                      </td>
                      <td>
                        <div className="food-name-cell">
                          <span className="admin-table-strong">{name}</span>
                          {row.brand && <span className="food-brand-tag">{row.brand}</span>}
                        </div>
                      </td>
                      <td className="admin-muted">{row.barcode ?? '—'}</td>
                      <td>{row.kcal != null ? row.kcal.toFixed(0) : '—'}</td>
                      <td>{row.protein != null ? `${row.protein.toFixed(1)}g` : '—'}</td>
                      <td>{row.creator?.username ?? '—'}</td>
                      <td>
                        <span className={`food-status-badge ${STATUS_CLS[row.status]}`}>
                          {STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td>
                        <div className="admin-actions-cell">
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            disabled={disabled}
                            onClick={() => void openDetail(row.id)}
                            title="Részletek megtekintése"
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ verticalAlign: -1 }}>
                              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                              <path d="M6.5 5.5v4M6.5 4v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                            </svg>
                            Részletek
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            disabled={disabled}
                            onClick={async () => { await openDetail(row.id); setShowEdit(true); }}
                            title="Szerkesztés"
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ verticalAlign: -1 }}>
                              <path d="M9 2l2 2-6.5 6.5H2.5v-2L9 2z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                            </svg>
                            Szerkesztés
                          </button>
                          <select
                            className="admin-select admin-select-inline"
                            value={row.status}
                            disabled={disabled}
                            onChange={(e) => void handleStatusChange(row, e.target.value as FoodStatus)}
                            title="Státusz módosítása"
                          >
                            <option value="UNVERIFIED">Függőben</option>
                            <option value="VERIFIED">Ellenőrzött</option>
                            <option value="BANNED">Tiltott</option>
                          </select>
                          <button
                            type="button"
                            className="admin-btn admin-btn-danger admin-btn-sm"
                            disabled={disabled}
                            onClick={() => setPendingDelete(row)}
                          >
                            Törlés
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {foods.length === 0 && <p className="admin-empty">Nincs megjeleníthető étel.</p>}
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

      {showCreate && (
        <FoodCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={handleFoodCreated}
        />
      )}

      {/* Detail loading indicator */}
      {detailLoading && (
        <div className="admin-modal-root" role="presentation">
          <button type="button" className="admin-modal-backdrop" aria-label="Bezárás" onClick={closeDetail} />
          <div className="admin-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
            <div className="admin-spinner" aria-hidden />
          </div>
        </div>
      )}

      {detailFood && !detailLoading && !showEdit && (
        <FoodDetailModal
          food={detailFood}
          onClose={closeDetail}
          onEdit={() => setShowEdit(true)}
        />
      )}

      {detailFood && !detailLoading && showEdit && (
        <FoodEditModal
          food={detailFood}
          onClose={closeDetail}
          onSaved={handleDetailSaved}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Étel végleges törlése"
        message={`Biztosan törlöd „${pendingDelete?.displayName ?? pendingDelete?.name ?? ''}"? Ez nem vonható vissza.`}
        confirmLabel="Törlés"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
