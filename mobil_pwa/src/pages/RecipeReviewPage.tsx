import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import AuthedImage from '../components/ui/AuthedImage';
import { PrimaryButton } from '../components/ui/Button';
import { IconArrowBack, IconDelete } from '../components/ui/Icons';
import {
  foodApi,
  getErrorMessage,
  recipesApi,
  type Food,
  type RecipeCategory,
  type RecipeDraft,
  type RecipeIngredientDraft,
  type RecipeNutrition,
} from '../services/api';
import { clearRecipeDraftSession, readRecipeDraftSession } from '../utils/recipeDraftSession';
import styles from './RecipeReviewPage.module.css';

const CATEGORIES: RecipeCategory[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'OTHER'];

const CAT_KEYS: Record<RecipeCategory, string> = {
  BREAKFAST: 'recipes.categoryBreakfast',
  LUNCH: 'recipes.categoryLunch',
  DINNER: 'recipes.categoryDinner',
  SNACK: 'recipes.categorySnack',
  DESSERT: 'recipes.categoryDessert',
  OTHER: 'recipes.categoryOther',
};

function emptyDraft(): RecipeDraft {
  return {
    title: '',
    description: '',
    servings: 2,
    category: null,
    ingredients: [{ name: '', amount: null, unit: 'g', sortOrder: 0 }],
    instructions: [''],
    sourceType: 'MANUAL',
  };
}

function matchTone(ing: RecipeIngredientDraft): 'ok' | 'maybe' | 'miss' | null {
  if (!ing.name.trim()) return null;
  if (ing.foodId) return 'ok';
  if (ing.suggestedFood) return 'maybe';
  return 'miss';
}

export default function RecipeReviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [draft, setDraft] = useState<RecipeDraft>(emptyDraft());
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null);
  const [tempImageKey, setTempImageKey] = useState<string | undefined>();
  const [hasExistingImage, setHasExistingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!id);
  const [picking, setPicking] = useState<number | null>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [pickHits, setPickHits] = useState<Food[]>([]);
  const [pickBusy, setPickBusy] = useState(false);

  useEffect(() => {
    if (id) {
      (async () => {
        try {
          const recipe = await recipesApi.get(id);
          setDraft({
            title: recipe.title,
            description: recipe.description ?? '',
            servings: recipe.servings,
            category: recipe.category ?? null,
            ingredients: recipe.ingredients.length
              ? recipe.ingredients
              : [{ name: '', amount: null, unit: 'g', sortOrder: 0 }],
            instructions: recipe.instructions.length ? recipe.instructions : [''],
            sourceType: recipe.sourceType,
            sourceUrl: recipe.sourceUrl,
            sourceExternalId: recipe.sourceExternalId,
          });
          setNutrition(recipe.nutrition ?? null);
          setHasExistingImage(recipe.hasImage);
          setReady(true);
        } catch (err) {
          setError(getErrorMessage(err, t('recipes.loadDetailError')));
          setReady(true);
        }
      })();
      return;
    }
    const session = readRecipeDraftSession();
    if (session?.draft) {
      setDraft({
        ...emptyDraft(),
        ...session.draft,
        ingredients: session.draft.ingredients?.length
          ? session.draft.ingredients
          : [{ name: '', amount: null, unit: 'g', sortOrder: 0 }],
        instructions: session.draft.instructions?.length ? session.draft.instructions : [''],
      });
      setTempImageKey(session.tempImageKey);
    }
    setReady(true);
  }, [id, t]);

  const rematchKey = useMemo(
    () =>
      draft.ingredients
        .map((ing) => `${ing.name}|${ing.amount ?? ''}|${ing.unit ?? ''}|${ing.foodId ?? ''}`)
        .join('||') + `|s${draft.servings}`,
    [draft.ingredients, draft.servings],
  );

  useEffect(() => {
    if (!ready) return;
    const named = draft.ingredients.filter((ing) => ing.name.trim());
    if (!named.length) {
      setNutrition(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void recipesApi
        .match(named, draft.servings)
        .then((res) => {
          setDraft((d) => {
            const next = [...d.ingredients];
            let ni = 0;
            for (let i = 0; i < next.length; i += 1) {
              if (!next[i].name.trim()) continue;
              const m = res.ingredients[ni];
              ni += 1;
              if (!m) continue;
              next[i] = { ...next[i], ...m, name: next[i].name };
            }
            return { ...d, ingredients: next };
          });
          setNutrition(res.nutrition);
        })
        .catch(() => undefined);
    }, 380);
    return () => window.clearTimeout(handle);
    // rematchKey is the intentional trigger; draft is read inside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rematchKey]);

  const setIng = (index: number, patch: Partial<RecipeIngredientDraft>) => {
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((ing, i) => {
        if (i !== index) return ing;
        const next = { ...ing, ...patch };
        if (patch.name != null && patch.name !== ing.name) {
          next.foodId = patch.foodId ?? null;
          next.matchedFoodName = patch.matchedFoodName ?? null;
          next.suggestedFood = patch.suggestedFood ?? null;
          next.matchConfidence = patch.matchConfidence ?? null;
        }
        return next;
      }),
    }));
  };

  const bindFood = (index: number, food: { id: string; displayName: string }) => {
    setIng(index, {
      foodId: food.id,
      matchedFoodName: food.displayName,
      suggestedFood: null,
      matchConfidence: 1,
    });
    setPicking(null);
    setPickQuery('');
    setPickHits([]);
  };

  useEffect(() => {
    if (picking == null) return;
    const q = pickQuery.trim();
    if (q.length < 2) {
      setPickHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setPickBusy(true);
      void foodApi
        .search(q, { limit: 20 })
        .then((res) => setPickHits(res.foods))
        .catch(() => setPickHits([]))
        .finally(() => setPickBusy(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [picking, pickQuery]);

  const handleSave = async () => {
    if (!draft.title.trim()) {
      setError(t('recipes.titleRequired'));
      return;
    }
    setSaving(true);
    setError('');
    const payload: RecipeDraft & { tempImageKey?: string } = {
      ...draft,
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      ingredients: draft.ingredients
        .filter((ing) => ing.name.trim())
        .map((ing, idx) => ({
          name: ing.name.trim(),
          amount: ing.amount ?? null,
          unit: ing.unit?.trim() || null,
          amountG: ing.amountG ?? null,
          foodId: ing.foodId ?? null,
          matchConfidence: ing.matchConfidence ?? null,
          sortOrder: idx,
        })),
      instructions: draft.instructions.map((s) => s.trim()).filter(Boolean),
      tempImageKey,
    };
    try {
      const saved = id
        ? await recipesApi.update(id, payload)
        : await recipesApi.create(payload);
      clearRecipeDraftSession();
      navigate(`/recipes/${saved.id}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, t('recipes.saveError')));
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <div className={`${styles.screen} page-scroll`}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className={`${styles.screen} page-scroll`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1 className={styles.pageTitle}>{t('recipes.reviewTitle')}</h1>
        <span style={{ width: 40 }} />
      </header>
      <p className={styles.hint}>{t('recipes.reviewHint')}</p>

      {tempImageKey ? (
        <AuthedImage tempKey={tempImageKey} alt="" className={styles.preview} />
      ) : id && hasExistingImage ? (
        <AuthedImage recipeId={id} alt="" className={styles.preview} />
      ) : null}

      <label className={styles.label}>{t('recipes.fieldTitle')}</label>
      <input className={styles.input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />

      <label className={styles.label}>{t('recipes.fieldDescription')}</label>
      <textarea
        className={styles.textarea}
        value={draft.description ?? ''}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />

      <div className={styles.row2}>
        <div>
          <label className={styles.label}>{t('recipes.servings')}</label>
          <input
            className={styles.input}
            type="number"
            min={1}
            max={50}
            value={draft.servings}
            onChange={(e) => setDraft({ ...draft, servings: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
        <div>
          <label className={styles.label}>{t('recipes.all')}</label>
          <select
            className={styles.select}
            value={draft.category ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, category: (e.target.value || null) as RecipeCategory | null })
            }
          >
            <option value="">{t('recipes.categoryOther')}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(CAT_KEYS[c])}
              </option>
            ))}
          </select>
        </div>
      </div>

      {nutrition && (
        <div className={styles.nutrition}>
          <strong>{t('recipes.nutritionPerServing', { kcal: nutrition.kcal })}</strong>
          <span>
            {t('recipes.nutritionMacros', {
              p: nutrition.protein,
              c: nutrition.carbs,
              f: nutrition.fat,
            })}
          </span>
          {nutrition.incomplete && <span className={styles.warn}>{t('recipes.nutritionPartial')}</span>}
        </div>
      )}

      <label className={styles.label}>{t('recipes.ingredients')}</label>
      {draft.ingredients.map((ing, i) => {
        const tone = matchTone(ing);
        return (
          <div key={i}>
            <div className={styles.ingRow}>
              <input
                className={styles.input}
                placeholder={t('recipes.ingredientName')}
                value={ing.name}
                onChange={(e) => setIng(i, { name: e.target.value })}
              />
              <input
                className={styles.input}
                placeholder={t('recipes.amount')}
                type="number"
                value={ing.amount ?? ''}
                onChange={(e) => setIng(i, { amount: e.target.value === '' ? null : Number(e.target.value) })}
              />
              <input
                className={styles.input}
                placeholder={t('recipes.unit')}
                value={ing.unit ?? ''}
                onChange={(e) => setIng(i, { unit: e.target.value })}
              />
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() =>
                  setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, idx) => idx !== i) }))
                }
              >
                <IconDelete size={18} color="#B83B3B" />
              </button>
            </div>
            {ing.name.trim() && (ing.amount == null || Number.isNaN(ing.amount)) && (
              <div className={styles.warn}>{t('recipes.missingAmount')}</div>
            )}
            {tone && (
              <div className={`${styles.matchRow} ${styles[`match_${tone}`]}`}>
                {tone === 'ok' && (
                  <span>{t('recipes.matchOk', { name: ing.matchedFoodName || ing.name })}</span>
                )}
                {tone === 'maybe' && ing.suggestedFood && (
                  <>
                    <span>{t('recipes.matchSuggest', { name: ing.suggestedFood.displayName })}</span>
                    <button type="button" className={styles.matchBtn} onClick={() => bindFood(i, ing.suggestedFood!)}>
                      {t('recipes.matchAccept')}
                    </button>
                    <button type="button" className={styles.matchBtn} onClick={() => setPicking(i)}>
                      {t('recipes.matchReplace')}
                    </button>
                  </>
                )}
                {tone === 'miss' && (
                  <>
                    <span>{t('recipes.matchMiss')}</span>
                    <button type="button" className={styles.matchBtn} onClick={() => setPicking(i)}>
                      {t('recipes.matchPick')}
                    </button>
                  </>
                )}
                {tone === 'ok' && (
                  <button type="button" className={styles.matchBtn} onClick={() => setPicking(i)}>
                    {t('recipes.matchReplace')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className={styles.addBtn}
        onClick={() =>
          setDraft((d) => ({
            ...d,
            ingredients: [...d.ingredients, { name: '', amount: null, unit: 'g', sortOrder: d.ingredients.length }],
          }))
        }
      >
        {t('recipes.addIngredient')}
      </button>

      <label className={styles.label}>{t('recipes.instructions')}</label>
      {draft.instructions.map((step, i) => (
        <div key={i} className={styles.step}>
          <textarea
            className={styles.textarea}
            placeholder={t('recipes.stepN', { n: i + 1 })}
            value={step}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                instructions: d.instructions.map((s, idx) => (idx === i ? e.target.value : s)),
              }))
            }
          />
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() =>
              setDraft((d) => ({ ...d, instructions: d.instructions.filter((_, idx) => idx !== i) }))
            }
          >
            <IconDelete size={18} color="#B83B3B" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => setDraft((d) => ({ ...d, instructions: [...d.instructions, ''] }))}
      >
        {t('recipes.addStep')}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.saveWrap}>
        <PrimaryButton label={saving ? t('recipes.saving') : t('recipes.save')} onClick={() => void handleSave()} loading={saving} disabled={saving} />
      </div>

      {picking != null && (
        <div className={styles.pickerRoot}>
          <button type="button" className={styles.pickerBackdrop} onClick={() => setPicking(null)} aria-label={t('common.close')} />
          <div className={styles.pickerSheet}>
            <h2>{t('recipes.matchPick')}</h2>
            <input
              className={styles.input}
              autoFocus
              value={pickQuery}
              placeholder={t('recipes.matchSearch')}
              onChange={(e) => setPickQuery(e.target.value)}
            />
            {pickBusy && <p className={styles.hint}>{t('common.loading')}</p>}
            <div className={styles.pickList}>
              {pickHits.map((food) => {
                const name = food.displayName || food.nameHu || food.nameEn || food.name;
                return (
                  <button
                    key={food.id}
                    type="button"
                    className={styles.pickItem}
                    onClick={() => bindFood(picking, { id: food.id, displayName: name })}
                  >
                    <span>{name}</span>
                    <span>{Math.round(food.kcal)} kcal</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
