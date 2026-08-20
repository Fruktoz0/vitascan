import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../ui/GlassCard';
import {
  IconAdd,
  IconBrain,
  IconClose,
  IconDelete,
  IconKitchen,
  IconQrCodeScanner,
  IconRemove,
  IconSearch,
} from '../ui/Icons';
import { Colors } from '../../design/tokens';
import { foodApi, getErrorMessage, pantryApi, type Food, type PantryItem } from '../../services/api';
import styles from '../../pages/MealPlanPage.module.css';

type Props = {
  ownerId?: string;
};

type Unit = 'g' | 'ml' | 'db';

export default function MealPlanPantry({ ownerId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState<Unit>('db');
  const [hits, setHits] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [searching, setSearching] = useState(false);
  const [edit, setEdit] = useState<PantryItem | null>(null);
  const [editQty, setEditQty] = useState('1');
  const [editUnit, setEditUnit] = useState<Unit>('db');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await pantryApi.list(ownerId);
      setItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.pantryLoadError')));
    } finally {
      setLoading(false);
    }
  }, [ownerId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const q = name.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void foodApi
        .search(q, { limit: 8 })
        .then((res) => setHits(res.foods))
        .catch(() => setHits([]));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [name]);

  useEffect(() => {
    if (!edit) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEdit(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [edit]);

  const openEdit = (item: PantryItem) => {
    setEdit(item);
    setEditQty(String(item.quantity));
    setEditUnit((item.unit as Unit) || 'g');
  };

  const bumpEditQty = (delta: number) => {
    const n = Number(String(editQty).replace(',', '.'));
    const base = Number.isFinite(n) && n > 0 ? n : 0;
    const step = editUnit === 'db' ? 1 : base >= 100 ? 50 : 10;
    const next = Math.max(0, Math.round((base + delta * step) * 10) / 10);
    setEditQty(String(next));
  };

  const add = async () => {
    const quantity = Number(qty.replace(',', '.'));
    if (!name.trim() || !Number.isFinite(quantity) || quantity <= 0) return;
    try {
      await pantryApi.add({
        ownerId,
        foodId: picked?.id,
        name: picked
          ? picked.nameHu ?? picked.nameEn ?? picked.displayName ?? picked.name
          : name.trim(),
        quantity,
        unit,
        source: 'MANUAL',
      });
      setName('');
      setQty('1');
      setPicked(null);
      setHits([]);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.pantrySaveError')));
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const quantity = Number(String(editQty).replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity < 0) return;
    setSaving(true);
    setError('');
    try {
      const res = await pantryApi.patch(edit.id, { quantity, unit: editUnit });
      if (res.deleted || quantity === 0) {
        setItems((prev) => prev.filter((i) => i.id !== edit.id));
      } else if (res.item) {
        setItems((prev) => prev.map((i) => (i.id === edit.id ? res.item! : i)));
      }
      setEdit(null);
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.pantrySaveError')));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await pantryApi.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (edit?.id === id) setEdit(null);
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.pantrySaveError')));
    }
  };

  const returnPath = ownerId
    ? `/meal-plan?tab=pantry&ownerId=${encodeURIComponent(ownerId)}`
    : '/meal-plan?tab=pantry';

  const unitButtons = (value: Unit, onChange: (u: Unit) => void) => (
    <div className={styles.unitSeg} role="group" aria-label={t('mealPlan.pantryQty')}>
      {(['g', 'ml', 'db'] as const).map((u) => (
        <button
          key={u}
          type="button"
          className={`${styles.unitSegBtn} ${value === u ? styles.unitSegOn : ''}`}
          onClick={() => onChange(u)}
        >
          {u}
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.content}>
      <GlassCardSimple
        backgroundColor="#e8f5e9"
        padding={16}
        customRadius={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 32,
          borderBottomRightRadius: 20,
          borderBottomLeftRadius: 28,
        }}
      >
        <div className={styles.pantryHero}>
          <span className={styles.pantryShelfIcon}>
            <IconKitchen size={26} color={Colors.dashboard.stroke} />
          </span>
          <div>
            <strong className={styles.jarName}>{t('mealPlan.tabPantry')}</strong>
            <p className={styles.pantryLead}>{t('mealPlan.pantryLead')}</p>
          </div>
        </div>
      </GlassCardSimple>

      <div className={styles.pantryActions}>
        <button
          type="button"
          className={styles.hardBtn}
          onClick={() => navigate('/scanner', { state: { returnPath, pantry: true } })}
        >
          <span className={styles.btnShadow} />
          <span className={styles.hardFace}>
            <IconQrCodeScanner size={18} color={Colors.dashboard.stroke} />
            {t('mealPlan.scanToPantry')}
          </span>
        </button>
        <button
          type="button"
          className={styles.aiAddBtn}
          aria-label={t('aiRecognize.entryTitle')}
          onClick={() => navigate('/ai-recognize', { state: { returnPath, pantry: true } })}
        >
          <span className={styles.btnShadow} />
          <span className={styles.aiAddFace}>
            <IconBrain size={18} color={Colors.dashboard.stroke} />
            <IconAdd size={12} color={Colors.dashboard.stroke} />
          </span>
        </button>
      </div>

      <GlassCardSimple
        padding={14}
        customRadius={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 16,
          borderBottomRightRadius: 24,
          borderBottomLeftRadius: 18,
        }}
      >
        <div className={styles.pantrySearch}>
          <IconSearch size={16} color={Colors.dashboard.stroke} />
          <input
            className={styles.pantryInput}
            value={name}
            placeholder={t('mealPlan.pantryName')}
            onFocus={() => setSearching(true)}
            onBlur={() => window.setTimeout(() => setSearching(false), 150)}
            onChange={(e) => {
              setName(e.target.value);
              setPicked(null);
              setSearching(true);
            }}
          />
        </div>
        {searching && hits.length > 0 && !picked ? (
          <div className={styles.hitList}>
            {hits.map((food) => {
              const label = food.nameHu ?? food.nameEn ?? food.displayName ?? food.name;
              return (
                <button
                  key={food.id}
                  type="button"
                  className={styles.hit}
                  onClick={() => {
                    setPicked(food);
                    setName(label);
                    setHits([]);
                    setUnit(food.servingUnit === 'db' ? 'db' : 'g');
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className={styles.pantryQtyRow}>
          <input
            className={styles.pantryQty}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-label={t('mealPlan.pantryQty')}
          />
          {unitButtons(unit, setUnit)}
          <button
            type="button"
            className={`${styles.pantryAddBtn} ${styles.hardBtnMint}`}
            onClick={() => void add()}
          >
            <span className={styles.btnShadow} />
            <span className={styles.hardFace}>
              <IconAdd size={16} color={Colors.dashboard.stroke} />
              {t('mealPlan.pantryAdd')}
            </span>
          </button>
        </div>
      </GlassCardSimple>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading && items.length === 0 ? (
        <div className={styles.center}>
          <div className="spinner" />
        </div>
      ) : (
        <div className={styles.pantryBoard}>
          <div className={styles.pantryBoardHead}>
            <span className={styles.pantryBoardTitle}>{t('mealPlan.pantryShelf')}</span>
            <span className={styles.pantryBoardCount}>
              {t('mealPlan.pantryCount', { count: items.length })}
            </span>
          </div>

          {items.length === 0 ? (
            <p className={styles.pantryBoardEmpty}>{t('mealPlan.pantryEmpty')}</p>
          ) : (
            <div className={styles.pantryGrid}>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.pantryTile}
                  onClick={() => openEdit(item)}
                >
                  <span className={styles.pantryTileQty}>{item.qtyLabel}</span>
                  <span className={styles.pantryTileName}>{item.name}</span>
                  {item.macros ? (
                    <span className={styles.pantryTileMeta}>{item.macros.kcal} kcal</span>
                  ) : item.expiresOn ? (
                    <span className={styles.pantryTileMeta}>{item.expiresOn}</span>
                  ) : (
                    <span className={styles.pantryTileMeta}>{t('mealPlan.pantryTapEdit')}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {edit ? (
        <div className={styles.editOverlay} onClick={() => setEdit(null)}>
          <div
            className={styles.editSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pantry-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.editTop}>
              <div>
                <h2 id="pantry-edit-title" className={styles.editTitle}>
                  {edit.name}
                </h2>
                <p className={styles.editHint}>{t('mealPlan.pantryOnShelf')}</p>
              </div>
              <button
                type="button"
                className={styles.editClose}
                aria-label={t('common.close')}
                onClick={() => setEdit(null)}
              >
                <IconClose size={18} color={Colors.dashboard.stroke} />
              </button>
            </div>

            <div className={styles.editStepper}>
              <button
                type="button"
                className={styles.stepBtn}
                aria-label="-"
                onClick={() => bumpEditQty(-1)}
              >
                <IconRemove size={20} color={Colors.dashboard.stroke} />
              </button>
              <input
                className={styles.editQtyInput}
                inputMode="decimal"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                aria-label={t('mealPlan.pantryQty')}
              />
              <button
                type="button"
                className={styles.stepBtn}
                aria-label="+"
                onClick={() => bumpEditQty(1)}
              >
                <IconAdd size={20} color={Colors.dashboard.stroke} />
              </button>
            </div>

            {unitButtons(editUnit, setEditUnit)}

            {edit.macros ? (
              <p className={styles.editMacros}>
                {edit.macros.kcal} kcal · F {edit.macros.protein}g · Sz {edit.macros.carbs}g · Zs{' '}
                {edit.macros.fat}g
              </p>
            ) : null}

            <div className={styles.editActions}>
              <button
                type="button"
                className={styles.editDelete}
                onClick={() => void remove(edit.id)}
              >
                <IconDelete size={16} color={Colors.dashboard.stroke} />
                {t('mealPlan.delete')}
              </button>
              <button
                type="button"
                className={`${styles.hardBtn} ${styles.hardBtnMint} ${styles.editSave}`}
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                <span className={styles.btnShadow} />
                <span className={styles.hardFace}>
                  {saving ? t('mealPlan.pantrySaving') : t('mealPlan.pantrySaveQty')}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
