import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthedImage from '../components/ui/AuthedImage';
import { IconAdd, IconArrowBack, IconSearch } from '../components/ui/Icons';
import { Colors } from '../design/tokens';
import { getErrorMessage, recipesApi, type RecipeCategory, type RecipeListItem } from '../services/api';
import styles from './RecipesPage.module.css';

const CATEGORIES: Array<{ id: RecipeCategory | 'ALL'; labelKey: string }> = [
  { id: 'ALL', labelKey: 'recipes.all' },
  { id: 'BREAKFAST', labelKey: 'recipes.categoryBreakfast' },
  { id: 'LUNCH', labelKey: 'recipes.categoryLunch' },
  { id: 'DINNER', labelKey: 'recipes.categoryDinner' },
  { id: 'SNACK', labelKey: 'recipes.categorySnack' },
  { id: 'DESSERT', labelKey: 'recipes.categoryDessert' },
  { id: 'OTHER', labelKey: 'recipes.categoryOther' },
];

export default function RecipesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<RecipeCategory | 'ALL'>('ALL');
  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 280);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await recipesApi.list({
        page: 1,
        limit: 40,
        search: debounced || undefined,
        category: category === 'ALL' ? undefined : category,
      });
      setItems(res.recipes);
    } catch (err) {
      setError(getErrorMessage(err, t('recipes.loadError')));
    } finally {
      setLoading(false);
    }
  }, [category, debounced, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.topBar}>
        <button type="button" className={styles.back} onClick={() => navigate('/menu')}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1 className={styles.pageTitle}>{t('recipes.title')}</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>
          <IconSearch size={18} color="rgba(0,0,0,0.4)" />
        </span>
        <input
          className={styles.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('recipes.search')}
          type="search"
        />
      </div>

      <div className={styles.chips}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${styles.chip} ${category === c.id ? styles.chipActive : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {t(c.labelKey)}
          </button>
        ))}
      </div>

      {loading && (
        <div className={styles.center}>
          <div className="spinner" />
        </div>
      )}
      {!loading && error && <p className={styles.empty}>{error}</p>}
      {!loading && !error && items.length === 0 && <p className={styles.empty}>{t('recipes.empty')}</p>}

      {!loading && items.length > 0 && (
        <div className={styles.grid}>
          {items.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className={styles.card}
              onClick={() => navigate(`/recipes/${recipe.id}`)}
            >
              <span className={styles.cardShadow} />
              <span className={styles.cardInner}>
                {recipe.hasImage ? (
                  <AuthedImage recipeId={recipe.id} alt={recipe.title} className={styles.thumb} />
                ) : (
                  <span className={styles.thumbEmpty}>{t('recipes.noImage')}</span>
                )}
                <span className={styles.cardBody}>
                  <span className={styles.cardTitle}>{recipe.title}</span>
                  <span className={styles.cardMeta}>
                    {t('recipes.servingsCount', { count: recipe.servings })}
                    {recipe.nutrition ? ` · ${recipe.nutrition.kcal} kcal` : ''}
                    {recipe.nutrition?.incomplete ? ` · ${t('recipes.nutritionPartial')}` : ''}
                  </span>
                  {recipe.status === 'PENDING' && (
                    <span className={styles.cardBadge}>{t('recipes.statusPending')}</span>
                  )}
                  {recipe.status === 'REJECTED' && (
                    <span className={`${styles.cardBadge} ${styles.cardBadgeBad}`}>{t('recipes.statusRejected')}</span>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={() => navigate('/recipes/new')}
        aria-label={t('recipes.add')}
      >
        <span className={styles.fabShadow} />
        <span className={styles.fabInner}>
          <IconAdd size={28} color="currentColor" />
        </span>
      </button>
    </div>
  );
}
