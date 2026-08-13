import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthedImage from '../components/ui/AuthedImage';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconAdd, IconArrowBack, IconHeart, IconPhotoCamera, IconRestaurant, IconSearch } from '../components/ui/Icons';
import { SwipeDeleteRow } from '../components/ui/SwipeDeleteRow';
import { Colors } from '../design/tokens';
import {
  getErrorMessage,
  recipesApi,
  type RecipeCategory,
  type RecipeListItem,
} from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { fileToCompressedJpegFile } from '../utils/imageToJpeg';
import { RECIPE_CATEGORIES, RECIPE_CATEGORY_META } from '../utils/recipeMeta';
import styles from './RecipesPage.module.css';

type Filter = RecipeCategory | 'ALL' | 'FAVORITES';

export default function RecipesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RecipeListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imageTarget, setImageTarget] = useState<RecipeListItem | null>(null);
  const [imageRev, setImageRev] = useState<Record<string, number>>({});

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
        category: filter === 'ALL' || filter === 'FAVORITES' ? undefined : filter,
        favorite: filter === 'FAVORITES' ? true : undefined,
      });
      setItems(res.recipes);
    } catch (err) {
      setError(getErrorMessage(err, t('recipes.loadError')));
    } finally {
      setLoading(false);
    }
  }, [filter, debounced, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPickImage = async (file: File) => {
    const target = imageTarget;
    if (!target) return;
    try {
      const jpeg = await fileToCompressedJpegFile(file, 'recipe.jpg');
      await recipesApi.uploadImage(target.id, jpeg);
      setItems((prev) => prev.map((r) => (r.id === target.id ? { ...r, hasImage: true } : r)));
      setImageRev((prev) => ({ ...prev, [target.id]: Date.now() }));
    } catch (err) {
      window.alert(getErrorMessage(err, t('recipes.changeImageError')));
    } finally {
      setImageTarget(null);
    }
  };

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
        <button
          type="button"
          className={`${styles.chip} ${filter === 'ALL' ? styles.chipActive : ''}`}
          onClick={() => setFilter('ALL')}
        >
          {t('recipes.all')}
        </button>
        <button
          type="button"
          className={`${styles.chip} ${styles.chipFav} ${filter === 'FAVORITES' ? styles.chipActive : ''}`}
          onClick={() => setFilter('FAVORITES')}
        >
          <IconHeart size={14} color={filter === 'FAVORITES' ? '#B83B3B' : Colors.dashboard.stroke} />
          {t('recipes.favorites')}
        </button>
        {RECIPE_CATEGORIES.map((id) => (
          <button
            key={id}
            type="button"
            className={`${styles.chip} ${filter === id ? styles.chipActive : ''}`}
            onClick={() => setFilter(id)}
          >
            {t(RECIPE_CATEGORY_META[id].labelKey)}
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
        <div className={styles.listWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.listInner}>
            {items.map((recipe) => {
              const cat = recipe.category && recipe.category in RECIPE_CATEGORY_META ? recipe.category : 'OTHER';
              const meta = RECIPE_CATEGORY_META[cat];
              const MealIcon = meta.Icon;
              return (
                <SwipeDeleteRow
                  key={recipe.id}
                  enabled={isAdmin}
                  deleteLabel={t('recipes.delete')}
                  onDelete={() => setDeleteTarget(recipe)}
                  extraAction={{
                    label: t('recipes.changeImage'),
                    icon: <IconPhotoCamera size={20} color={Colors.dashboard.stroke} />,
                    onClick: () => {
                      setImageTarget(recipe);
                      fileRef.current?.click();
                    },
                  }}
                >
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => navigate(`/recipes/${recipe.id}`)}
                  >
                    <span className={styles.thumbBtn}>
                      {recipe.hasImage ? (
                        <AuthedImage
                          recipeId={recipe.id}
                          alt=""
                          className={styles.thumb}
                          revision={imageRev[recipe.id]}
                        />
                      ) : (
                        <span className={styles.thumbEmpty}>
                          <IconRestaurant size={18} color="rgba(0,0,0,0.35)" />
                        </span>
                      )}
                    </span>
                    <span className={styles.rowTitle}>{recipe.title}</span>
                    <span
                      className={styles.mealBadge}
                      style={{ background: meta.bg }}
                      title={t(meta.labelKey)}
                      aria-label={t(meta.labelKey)}
                    >
                      <MealIcon size={18} color={Colors.dashboard.stroke} />
                    </span>
                  </button>
                </SwipeDeleteRow>
              );
            })}
          </div>
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

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onPickImage(file);
        }}
      />

      <ConfirmDialog
        visible={!!deleteTarget}
        title={t('recipes.delete')}
        message={t('recipes.confirmDelete')}
        confirmLabel={t('recipes.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          const target = deleteTarget;
          if (!target || deleting) return;
          setDeleting(true);
          void recipesApi
            .remove(target.id)
            .then(() => setItems((prev) => prev.filter((r) => r.id !== target.id)))
            .catch((err) => window.alert(getErrorMessage(err, t('recipes.deleteError'))))
            .finally(() => {
              setDeleting(false);
              setDeleteTarget(null);
            });
        }}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
