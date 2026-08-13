import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import AuthedImage from '../components/ui/AuthedImage';
import { PrimaryButton } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  IconArrowBack,
  IconCheck,
  IconEdit,
  IconHeart,
  IconHeartOutline,
  IconLink,
  IconPersonOutline,
  IconPhotoCamera,
  IconRestaurant,
} from '../components/ui/Icons';
import { RecipeNutritionCard } from '../components/recipes/RecipeNutritionCard';
import { getErrorMessage, recipesApi, type RecipeDetail, type RecipeSourceType } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { fileToCompressedJpegFile } from '../utils/imageToJpeg';
import { MEAL_META, type MealType } from '../utils/mealMeta';
import { RECIPE_CATEGORY_META } from '../utils/recipeMeta';
import styles from './RecipeDetailPage.module.css';

const SOURCE_KEY: Record<RecipeSourceType, string> = {
  MANUAL: 'recipes.sourceManual',
  IMAGE: 'recipes.sourceImage',
  VIDEO: 'recipes.sourceVideo',
  FACEBOOK: 'recipes.sourceFacebook',
  INSTAGRAM: 'recipes.sourceInstagram',
  TIKTOK: 'recipes.sourceTiktok',
  YOUTUBE: 'recipes.sourceYoutube',
  WEB: 'recipes.sourceWeb',
};

const MEAL_I18N: Record<MealType, string> = {
  BREAKFAST: 'food.breakfast',
  TIZORAI: 'food.tizorai',
  LUNCH: 'food.lunch',
  UZSONNA: 'food.uzsonna',
  DINNER: 'food.dinner',
  SNACK: 'food.snack',
};

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function gramsPerServingOf(recipe: RecipeDetail): number {
  if (recipe.nutrition?.gramsPerServing && recipe.nutrition.gramsPerServing > 0) {
    return recipe.nutrition.gramsPerServing;
  }
  const total = recipe.ingredients.reduce((sum, ing) => {
    if (!ing.foodId || ing.amountG == null || ing.amountG <= 0) return sum;
    return sum + ing.amountG;
  }, 0);
  return total > 0 ? total / Math.max(1, recipe.servings) : 100;
}

export default function RecipeDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const fileRef = useRef<HTMLInputElement>(null);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logMode, setLogMode] = useState<'servings' | 'grams'>('servings');
  const [servings, setServings] = useState(1);
  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>('LUNCH');
  const [date, setDate] = useState(todayIso);
  const [logging, setLogging] = useState(false);
  const [logMsg, setLogMsg] = useState('');
  const [imageRev, setImageRev] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const next = await recipesApi.get(id);
      setRecipe(next);
      const gps = gramsPerServingOf(next);
      setGrams(Math.round(gps * 10) / 10);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, t('recipes.loadDetailError')));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const canLog = useMemo(
    () => Boolean(recipe?.nutrition && recipe.nutrition.matchedCount > 0 && recipe.status !== 'REJECTED'),
    [recipe],
  );
  const canChangeImage = Boolean(recipe && (recipe.isOwner || isAdmin));
  const servingG = recipe ? gramsPerServingOf(recipe) : 100;

  const switchLogMode = (mode: 'servings' | 'grams') => {
    if (mode === logMode) return;
    if (mode === 'grams') {
      setGrams(Math.max(1, Math.round(servings * servingG * 10) / 10));
    } else {
      const next = servingG > 0 ? Math.round((grams / servingG) * 100) / 100 : 1;
      setServings(Math.min(20, Math.max(0.25, next)));
    }
    setLogMode(mode);
  };

  const toggleFavorite = async () => {
    if (!recipe) return;
    try {
      const res = recipe.isFavorite
        ? await recipesApi.unfavorite(recipe.id)
        : await recipesApi.favorite(recipe.id);
      setRecipe({ ...recipe, isFavorite: res.isFavorite });
    } catch {}
  };

  const handleDelete = async () => {
    if (!recipe) return;
    try {
      await recipesApi.remove(recipe.id);
      navigate('/recipes', { replace: true });
    } catch (err) {
      window.alert(getErrorMessage(err, t('recipes.deleteError')));
    }
  };

  const handleLog = async () => {
    if (!recipe || !canLog) return;
    setLogging(true);
    setLogMsg('');
    try {
      await recipesApi.log(
        recipe.id,
        logMode === 'grams'
          ? { amountG: grams, mealType, date }
          : { servings, mealType, date },
      );
      navigate('/food-library', { replace: true });
    } catch (err) {
      setLogMsg(getErrorMessage(err, t('recipes.saveError')));
    } finally {
      setLogging(false);
    }
  };

  const onPickImage = async (file: File) => {
    if (!recipe) return;
    try {
      const jpeg = await fileToCompressedJpegFile(file, 'recipe.jpg');
      await recipesApi.uploadImage(recipe.id, jpeg);
      setRecipe({ ...recipe, hasImage: true });
      setImageRev(Date.now());
    } catch (err) {
      window.alert(getErrorMessage(err, t('recipes.changeImageError')));
    }
  };

  if (loading) {
    return (
      <div className={`${styles.screen} page-scroll`}>
        <div className={styles.center}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className={`${styles.screen} page-scroll`}>
        <div className={styles.center}>{error || t('recipes.notFound')}</div>
      </div>
    );
  }

  const cat = recipe.category && recipe.category in RECIPE_CATEGORY_META ? recipe.category : 'OTHER';
  const catMeta = RECIPE_CATEGORY_META[cat];
  const CatIcon = catMeta.Icon;

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.topBar}>
        <button type="button" className={styles.round} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1 className={styles.pageTitle}>{t('recipes.title')}</h1>
        <button
          type="button"
          className={styles.round}
          onClick={() => void toggleFavorite()}
          aria-label={recipe.isFavorite ? t('recipes.unfavorite') : t('recipes.favorite')}
        >
          {recipe.isFavorite ? (
            <IconHeart size={20} color="#B83B3B" />
          ) : (
            <IconHeartOutline size={20} color={Colors.dashboard.stroke} />
          )}
        </button>
      </header>

      <section className={styles.card}>
        <div className={styles.imageWrap}>
          {recipe.hasImage ? (
            <AuthedImage
              recipeId={recipe.id}
              alt={recipe.title}
              className={styles.hero}
              revision={imageRev}
            />
          ) : (
            <div className={styles.heroEmpty}>
              <IconRestaurant size={32} color="rgba(0,0,0,0.28)" />
              <span>{t('recipes.noImage')}</span>
            </div>
          )}
          <span
            className={styles.mealBadge}
            style={{ background: catMeta.bg }}
            title={t(catMeta.labelKey)}
            aria-label={t(catMeta.labelKey)}
          >
            <CatIcon size={18} color={Colors.dashboard.stroke} />
          </span>
          {canChangeImage && (
            <button
              type="button"
              className={styles.imageBtn}
              onClick={() => fileRef.current?.click()}
              aria-label={t('recipes.changeImage')}
            >
              <IconPhotoCamera size={18} color={Colors.dashboard.stroke} />
            </button>
          )}
        </div>

        <h2 className={styles.title}>{recipe.title}</h2>

        {recipe.status === 'PENDING' && !(isAdmin && recipe.isOwner) && (
          <span className={styles.badge}>{t('recipes.statusPending')}</span>
        )}
        {recipe.status === 'REJECTED' && (
          <span className={`${styles.badge} ${styles.badgeBad}`}>{t('recipes.statusRejected')}</span>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaChip}>
            <span className={styles.metaIcon} style={{ background: Colors.dashboard.tertiaryFixed }}>
              <IconPersonOutline size={18} color={Colors.dashboard.stroke} />
            </span>
            <span className={styles.metaText}>
              <small>{t('recipes.authorLabel')}</small>
              {recipe.createdBy.username}
            </span>
          </span>
          <span className={styles.metaChip}>
            <span className={styles.metaIcon} style={{ background: Colors.dashboard.blobMint }}>
              <IconRestaurant size={18} color={Colors.dashboard.stroke} />
            </span>
            <span className={styles.metaText}>
              <small>{t('recipes.servings')}</small>
              {t('recipes.servingsCount', { count: recipe.servings })}
            </span>
          </span>
        </div>
        {recipe.description ? <p className={styles.desc}>{recipe.description}</p> : null}
        {recipe.status === 'REJECTED' && recipe.rejectReason ? (
          <p className={styles.warn}>{t('recipes.rejectReason', { reason: recipe.rejectReason })}</p>
        ) : null}
      </section>

      {recipe.nutrition && <RecipeNutritionCard nutrition={recipe.nutrition} />}

      <section className={styles.card}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionIcon} style={{ background: Colors.dashboard.blobMint }}>
            <IconRestaurant size={20} color={Colors.dashboard.stroke} />
          </span>
          <h3 className={styles.sectionTitle}>{t('recipes.ingredients')}</h3>
        </div>
        <div className={styles.ingList}>
          {recipe.ingredients.map((ing) => {
            const matched = Boolean(ing.foodId || ing.matchedFoodName);
            const amount =
              ing.amount != null ? `${ing.amount} ${ing.unit ?? ''}`.trim() : null;
            return (
              <div key={ing.id ?? ing.name} className={styles.ing}>
                <span
                  className={styles.ingIcon}
                  style={{
                    background: matched ? Colors.dashboard.blobMint : Colors.dashboard.blobPeach,
                  }}
                >
                  {matched ? (
                    <IconCheck size={16} color={Colors.dashboard.stroke} />
                  ) : (
                    <IconRestaurant size={16} color={Colors.dashboard.stroke} />
                  )}
                </span>
                <span className={styles.ingBody}>
                  <span className={styles.ingName}>{ing.name}</span>
                  {ing.matchedFoodName && ing.matchedFoodName !== ing.name ? (
                    <span className={styles.ingMatch}>{ing.matchedFoodName}</span>
                  ) : null}
                </span>
                <span className={styles.ingAmt}>{amount || '—'}</span>
              </div>
            );
          })}
        </div>
      </section>

      {recipe.instructions.length > 0 && (
        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>{t('recipes.instructions')}</h3>
          <ol className={styles.steps}>
            {recipe.instructions.map((step, i) => (
              <li key={i} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span className={styles.stepText}>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className={styles.card}>
        <h3 className={styles.sectionTitle}>{t('recipes.source')}</h3>
        <p className={styles.meta}>{t(SOURCE_KEY[recipe.sourceType] ?? 'recipes.sourceManual')}</p>
        {recipe.sourceUrl ? (
          <a
            className={styles.sourceBtn}
            href={recipe.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className={styles.sourceShadow} />
            <span className={styles.sourceInner}>
              <IconLink size={18} color="currentColor" />
              {t('recipes.openSource')}
            </span>
          </a>
        ) : null}
      </section>

      {recipe.status !== 'REJECTED' && (
        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>{t('recipes.addToDiary')}</h3>
          {recipe.nutrition?.incomplete && <p className={styles.warn}>{t('recipes.logWarning')}</p>}
          {!canLog && <p className={styles.warn}>{t('recipes.logNeedMatch')}</p>}

          <div className={styles.unitSegment} role="group">
            <button
              type="button"
              className={`${styles.unitBtn} ${logMode === 'servings' ? styles.unitBtnOn : ''}`}
              onClick={() => switchLogMode('servings')}
            >
              {t('recipes.logModeServings')}
            </button>
            <button
              type="button"
              className={`${styles.unitBtn} ${logMode === 'grams' ? styles.unitBtnOn : ''}`}
              onClick={() => switchLogMode('grams')}
            >
              {t('recipes.logModeGrams')}
            </button>
          </div>

          {logMode === 'servings' ? (
            <div className={styles.stepper}>
              <button
                type="button"
                onClick={() => setServings((s) => Math.max(0.25, Math.round((s - 0.5) * 100) / 100))}
              >
                −
              </button>
              <span>
                {servings} {t('recipes.logModeServings').toLowerCase()}
              </span>
              <button
                type="button"
                onClick={() => setServings((s) => Math.min(20, Math.round((s + 0.5) * 100) / 100))}
              >
                +
              </button>
            </div>
          ) : (
            <div className={styles.stepper}>
              <button type="button" onClick={() => setGrams((g) => Math.max(1, Math.round((g - 10) * 10) / 10))}>
                −
              </button>
              <span>
                {grams} {t('recipes.gramsUnit')}
              </span>
              <button type="button" onClick={() => setGrams((g) => Math.min(5000, Math.round((g + 10) * 10) / 10))}>
                +
              </button>
            </div>
          )}

          <span className={styles.fieldLabel}>{t('recipes.mealType')}</span>
          <div className={styles.meals}>
            {(Object.keys(MEAL_META) as MealType[]).map((meal) => {
              const meta = MEAL_META[meal];
              const Icon = meta.Icon;
              const on = mealType === meal;
              return (
                <button
                  key={meal}
                  type="button"
                  className={`${styles.mealChip} ${on ? styles.mealChipOn : ''}`}
                  onClick={() => setMealType(meal)}
                >
                  <span className={styles.mealIcon} style={{ background: meta.bg }}>
                    <Icon size={16} color={Colors.dashboard.stroke} />
                  </span>
                  {t(MEAL_I18N[meal])}
                </button>
              );
            })}
          </div>
          <span className={styles.fieldLabel}>{t('recipes.logDate')}</span>
          <input className={styles.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {logMsg && <p className={styles.warn}>{logMsg}</p>}
          <div className={styles.logCta}>
            <PrimaryButton
              label={logging ? t('recipes.logging') : t('recipes.addToDiary')}
              onClick={() => void handleLog()}
              loading={logging}
              disabled={logging || !canLog}
            />
          </div>
        </section>
      )}

      {(recipe.isOwner || isAdmin) && (
        <div className={styles.actions}>
          <button type="button" className={styles.editBtn} onClick={() => navigate(`/recipes/${recipe.id}/edit`)}>
            <span className={styles.editShadow} />
            <span className={styles.editInner}>
              <IconEdit size={16} color="currentColor" /> {t('recipes.edit')}
            </span>
          </button>
          <button type="button" className={styles.dangerBtn} onClick={() => setConfirmDelete(true)}>
            {t('recipes.delete')}
          </button>
        </div>
      )}

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
        visible={confirmDelete}
        title={t('recipes.delete')}
        message={t('recipes.confirmDelete')}
        confirmLabel={t('recipes.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void handleDelete()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
