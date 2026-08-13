import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import AuthedImage from '../components/ui/AuthedImage';
import { PrimaryButton } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconArrowBack, IconEdit, IconHeart, IconHeartOutline } from '../components/ui/Icons';
import { getErrorMessage, recipesApi, type RecipeDetail, type RecipeSourceType } from '../services/api';
import { MEAL_META, type MealType } from '../utils/mealMeta';
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

export default function RecipeDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [servings, setServings] = useState(1);
  const [mealType, setMealType] = useState<MealType>('LUNCH');
  const [date, setDate] = useState(todayIso);
  const [logging, setLogging] = useState(false);
  const [logMsg, setLogMsg] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setRecipe(await recipesApi.get(id));
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
      await recipesApi.log(recipe.id, { servings, mealType, date });
      navigate('/food-library', { replace: true });
    } catch (err) {
      setLogMsg(getErrorMessage(err, t('recipes.saveError')));
    } finally {
      setLogging(false);
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

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div style={{ position: 'relative' }}>
        {recipe.hasImage ? (
          <AuthedImage recipeId={recipe.id} alt={recipe.title} className={styles.hero} />
        ) : (
          <div className={styles.heroEmpty}>{t('recipes.noImage')}</div>
        )}
        <div className={styles.topBtns}>
          <button type="button" className={styles.round} onClick={() => navigate(-1)}>
            <IconArrowBack size={22} color={Colors.dashboard.stroke} />
          </button>
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
        </div>
      </div>

      <div className={styles.body}>
        <h1 className={styles.title}>{recipe.title}</h1>
        {recipe.status === 'PENDING' && <span className={styles.badge}>{t('recipes.statusPending')}</span>}
        {recipe.status === 'REJECTED' && <span className={`${styles.badge} ${styles.badgeBad}`}>{t('recipes.statusRejected')}</span>}
        <p className={styles.meta}>{t('recipes.servingsCount', { count: recipe.servings })}</p>
        <p className={styles.meta}>{t('recipes.createdBy', { name: recipe.createdBy.username })}</p>
        {recipe.description ? <p className={styles.meta}>{recipe.description}</p> : null}
        {recipe.status === 'REJECTED' && recipe.rejectReason ? (
          <p className={styles.meta}>{t('recipes.rejectReason', { reason: recipe.rejectReason })}</p>
        ) : null}

        {recipe.nutrition && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('recipes.nutritionPerServing', { kcal: recipe.nutrition.kcal })}</h2>
            <p className={styles.meta}>
              {t('recipes.nutritionMacros', {
                p: recipe.nutrition.protein,
                c: recipe.nutrition.carbs,
                f: recipe.nutrition.fat,
              })}
            </p>
            {recipe.nutrition.incomplete && <p className={styles.warn}>{t('recipes.nutritionPartial')}</p>}
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('recipes.ingredients')}</h2>
          {recipe.ingredients.map((ing) => (
            <div key={ing.id ?? ing.name} className={styles.ing}>
              <span>
                {ing.name}
                {ing.matchedFoodName ? <small className={styles.matchHint}> · {ing.matchedFoodName}</small> : null}
              </span>
              <span>
                {ing.amount != null ? `${ing.amount} ${ing.unit ?? ''}`.trim() : '—'}
              </span>
            </div>
          ))}
        </section>

        {recipe.instructions.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('recipes.instructions')}</h2>
            {recipe.instructions.map((step, i) => (
              <div key={i} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('recipes.source')}</h2>
          <p className={styles.meta}>{t(SOURCE_KEY[recipe.sourceType] ?? 'recipes.sourceManual')}</p>
          {recipe.sourceUrl ? (
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              {recipe.sourceUrl}
            </a>
          ) : null}
        </section>

        {recipe.status !== 'REJECTED' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('recipes.addToDiary')}</h2>
            {recipe.nutrition?.incomplete && <p className={styles.warn}>{t('recipes.logWarning')}</p>}
            {!canLog && <p className={styles.warn}>{t('recipes.logNeedMatch')}</p>}
            <div className={styles.stepper}>
              <button type="button" onClick={() => setServings((s) => Math.max(0.25, Math.round((s - 0.5) * 100) / 100))}>-</button>
              <span>{t('recipes.servingsCount', { count: servings })}</span>
              <button type="button" onClick={() => setServings((s) => Math.min(20, Math.round((s + 0.5) * 100) / 100))}>+</button>
            </div>
            <label className={styles.fieldLabel}>{t('recipes.mealType')}</label>
            <div className={styles.meals}>
              {(Object.keys(MEAL_META) as MealType[]).map((meal) => (
                <button
                  key={meal}
                  type="button"
                  className={`${styles.mealChip} ${mealType === meal ? styles.mealChipOn : ''}`}
                  onClick={() => setMealType(meal)}
                >
                  {t(MEAL_I18N[meal])}
                </button>
              ))}
            </div>
            <label className={styles.fieldLabel}>{t('recipes.logDate')}</label>
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

        {recipe.isOwner && (
          <div className={styles.actions}>
            <button type="button" className={styles.textBtn} onClick={() => navigate(`/recipes/${recipe.id}/edit`)}>
              <IconEdit size={16} color="currentColor" /> {t('recipes.edit')}
            </button>
            <button type="button" className={`${styles.textBtn} ${styles.danger}`} onClick={() => setConfirmDelete(true)}>
              {t('recipes.delete')}
            </button>
          </div>
        )}
      </div>

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
