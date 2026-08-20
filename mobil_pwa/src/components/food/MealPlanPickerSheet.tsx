import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthedImage from '../ui/AuthedImage';
import { IconClose, IconRestaurant } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import {
  getErrorMessage,
  logApi,
  recipesApi,
  type MealTemplate,
  type RecipeListItem,
} from '../../services/api';
import { PLAN_MEALS } from '../../utils/mealPlan';
import type { MealType } from '../../utils/mealMeta';
import styles from './MealPlanPickerSheet.module.css';

export type PickerPick =
  | { source: 'RECIPE'; recipeId: string; servings: number }
  | { source: 'TEMPLATE'; templateId: string; servings: number }
  | { source: 'SKIPPED' };

type Props = {
  open: boolean;
  mealType: MealType;
  onClose: () => void;
  onPick: (pick: PickerPick) => void;
};

export default function MealPlanPickerSheet({ open, mealType, onClose, onPick }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'recipes' | 'templates'>('recipes');
  const [search, setSearch] = useState('');
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab('recipes');
    setSearch('');
    setError('');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await recipesApi.list({
            page: 1,
            limit: 40,
            search: search.trim() || undefined,
          });
          if (!cancelled) setRecipes(res.recipes);
        } catch (err) {
          if (!cancelled) setError(getErrorMessage(err, t('mealPlan.loadError')));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [open, search, t]);

  useEffect(() => {
    if (!open) return;
    void logApi
      .templates(PLAN_MEALS.includes(mealType) ? mealType : undefined)
      .then((res) => setTemplates(res.templates))
      .catch(() => setTemplates([]));
  }, [open, mealType]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('mealPlan.addSlot')}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.cancel')}>
            <IconClose size={18} color={Colors.dashboard.stroke} />
          </button>
        </header>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'recipes' ? styles.tabOn : ''}`}
            onClick={() => setTab('recipes')}
          >
            {t('mealPlan.recipes')}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'templates' ? styles.tabOn : ''}`}
            onClick={() => setTab('templates')}
          >
            {t('mealPlan.templates')}
          </button>
        </div>
        {tab === 'recipes' ? (
          <input
            className={styles.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('mealPlan.searchRecipes')}
          />
        ) : null}
        <div className={styles.body}>
          {error ? <p className={styles.empty}>{error}</p> : null}
          {loading && tab === 'recipes' ? (
            <p className={styles.empty}>…</p>
          ) : tab === 'recipes' ? (
            recipes.length === 0 ? (
              <p className={styles.empty}>{t('mealPlan.noRecipes')}</p>
            ) : (
              recipes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={styles.row}
                  onClick={() => onPick({ source: 'RECIPE', recipeId: r.id, servings: 1 })}
                >
                  <span className={styles.thumb}>
                    {r.hasImage ? (
                      <AuthedImage recipeId={r.id} alt="" revision={r.imageRevision} />
                    ) : (
                      <IconRestaurant size={18} color={Colors.dashboard.stroke} />
                    )}
                  </span>
                  <span>
                    <span className={styles.name}>{r.title}</span>
                    <span className={styles.meta}>
                      {r.nutrition?.kcal != null
                        ? t('mealPlan.kcal', { kcal: Math.round(r.nutrition.kcal) })
                        : t('mealPlan.notLoggable')}
                    </span>
                  </span>
                </button>
              ))
            )
          ) : templates.length === 0 ? (
            <p className={styles.empty}>{t('mealPlan.noTemplates')}</p>
          ) : (
            templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={styles.row}
                onClick={() => onPick({ source: 'TEMPLATE', templateId: tpl.id, servings: 1 })}
              >
                <span className={styles.thumb}>
                  <IconRestaurant size={18} color={Colors.dashboard.stroke} />
                </span>
                <span>
                  <span className={styles.name}>{tpl.name}</span>
                  <span className={styles.meta}>
                    {t('mealPlan.kcal', { kcal: Math.round(tpl.totals.kcal) })}
                  </span>
                </span>
              </button>
            ))
          )}
          <button type="button" className={styles.row} onClick={() => onPick({ source: 'SKIPPED' })}>
            <span className={styles.name}>{t('mealPlan.skip')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
