import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../ui/GlassCard';
import { IconAdd, IconBrain, IconDelete, IconKitchen, IconQrCodeScanner, IconSearch } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import { foodApi, getErrorMessage, pantryApi, type Food, type PantryItem } from '../../services/api';
import styles from '../../pages/MealPlanPage.module.css';

type Props = {
  ownerId?: string;
};

export default function MealPlanPantry({ ownerId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState<'g' | 'ml' | 'db'>('db');
  const [hits, setHits] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [searching, setSearching] = useState(false);

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

  const remove = async (id: string) => {
    try {
      await pantryApi.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.pantrySaveError')));
    }
  };

  const returnPath = ownerId
    ? `/meal-plan?tab=pantry&ownerId=${encodeURIComponent(ownerId)}`
    : '/meal-plan?tab=pantry';

  return (
    <div className={styles.content}>
      <GlassCardSimple
        backgroundColor="#eadecc"
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
          onClick={() =>
            navigate('/scanner', { state: { returnPath, pantry: true } })
          }
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
          onClick={() =>
            navigate('/ai-recognize', { state: { returnPath, pantry: true } })
          }
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
          <div className={styles.hitList} style={{ marginTop: 8 }}>
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
        <div className={styles.pantryQtyRow} style={{ marginTop: 10 }}>
          <input
            className={styles.pantryQty}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-label={t('mealPlan.pantryQty')}
          />
          {(['g', 'ml', 'db'] as const).map((u) => (
            <button
              key={u}
              type="button"
              className={`${styles.unitChip} ${unit === u ? styles.chipOn : ''}`}
              onClick={() => setUnit(u)}
            >
              {u}
            </button>
          ))}
          <button type="button" className={`${styles.hardBtn} ${styles.hardBtnMint}`} style={{ flex: '0 0 auto', width: 120 }} onClick={() => void add()}>
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
      ) : items.length === 0 ? (
        <div className={styles.shelf}>
          <div className={styles.shelfBay}>
            <div className={styles.shelfItem}>
              <p className={styles.empty} style={{ margin: 0 }}>
                {t('mealPlan.pantryEmpty')}
              </p>
            </div>
            <div className={styles.shelfPlank} />
          </div>
        </div>
      ) : (
        <div className={styles.shelf}>
          {items.map((item, i) => {
            const jarFill = ['#f3e0c2', '#e8f5e9', '#ffdad6', '#efe8ff', '#eadecc'][i % 5];
            return (
              <div key={item.id} className={styles.shelfBay}>
                <div className={styles.shelfItem}>
                  <div className={styles.jar}>
                    <span className={styles.jarMark} style={{ background: `linear-gradient(180deg, #fff8ef 0%, ${jarFill} 100%)` }}>
                      <span className={styles.jarLid} />
                      <span className={styles.jarQty}>{item.qtyLabel}</span>
                    </span>
                    <span className={styles.jarBody}>
                      <strong className={styles.jarName}>{item.name}</strong>
                      <span className={styles.jarMacros}>
                        {item.macros
                          ? `${item.macros.kcal} kcal · F ${item.macros.protein}g · Sz ${item.macros.carbs}g · Zs ${item.macros.fat}g`
                          : item.expiresOn
                            ? item.expiresOn
                            : t('mealPlan.pantryNoMacros')}
                        {item.expiresOn && item.macros ? ` · ${item.expiresOn}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={styles.back}
                      aria-label={t('mealPlan.delete')}
                      onClick={() => void remove(item.id)}
                    >
                      <span className={styles.backShadow} />
                      <span className={styles.backInner}>
                        <IconDelete size={18} color={Colors.dashboard.stroke} />
                      </span>
                    </button>
                  </div>
                </div>
                <div className={styles.shelfPlank} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
