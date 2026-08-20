import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import AuthedImage from '../components/ui/AuthedImage';
import { PrimaryButton } from '../components/ui/Button';
import {
  IconArrowBack,
  IconClose,
  IconPhotoCamera,
  IconRestaurant,
  IconSearch,
} from '../components/ui/Icons';
import { RecipeNutritionCard } from '../components/recipes/RecipeNutritionCard';
import { SwipeDeleteRow } from '../components/ui/SwipeDeleteRow';
import {
  foodApi,
  getErrorMessage,
  recipesApi,
  type Food,
  type RecipeDraft,
  type RecipeIngredientDraft,
  type RecipeNutrition,
} from '../services/api';
import { fileToCompressedJpegFile } from '../utils/imageToJpeg';
import { RECIPE_CATEGORIES, RECIPE_CATEGORY_META, RECIPE_DIET_META, RECIPE_DIET_TAGS } from '../utils/recipeMeta';
import { clearRecipeDraftSession, readRecipeDraftSession, saveRecipeDraftSession } from '../utils/recipeDraftSession';
import styles from './RecipeReviewPage.module.css';

function emptyDraft(): RecipeDraft {
  return {
    title: '',
    description: '',
    servings: 2,
    category: null,
    dietTags: [],
    ingredients: [{ name: '', amount: null, unit: 'g', sortOrder: 0 }],
    instructions: [''],
    sourceType: 'MANUAL',
    prepMinutes: null,
    leftoverDays: 0,
    effort: 'NORMAL',
    seasonMonths: [],
  };
}

function matchTone(ing: RecipeIngredientDraft): 'ok' | 'maybe' | 'miss' | null {
  if (!ing.name.trim()) return null;
  if (ing.foodId) return 'ok';
  if (ing.suggestedFood) return 'maybe';
  return 'miss';
}

export default function RecipeReviewPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<RecipeDraft>(emptyDraft());
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null);
  const [tempImageKey, setTempImageKey] = useState<string | undefined>();
  const [hasExistingImage, setHasExistingImage] = useState(false);
  const [imageRev, setImageRev] = useState<number | string>(0);
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
            dietTags: recipe.dietTags ?? [],
            ingredients: recipe.ingredients.length
              ? recipe.ingredients
              : [{ name: '', amount: null, unit: 'g', sortOrder: 0 }],
            instructions: recipe.instructions.length ? recipe.instructions : [''],
            sourceType: recipe.sourceType,
            sourceUrl: recipe.sourceUrl,
            sourceExternalId: recipe.sourceExternalId,
            prepMinutes: recipe.prepMinutes ?? null,
            leftoverDays: recipe.leftoverDays ?? 0,
            effort: recipe.effort ?? 'NORMAL',
            seasonMonths: recipe.seasonMonths ?? [],
          });
          setNutrition(recipe.nutrition ?? null);
          setHasExistingImage(recipe.hasImage);
          if (recipe.imageRevision) setImageRev(recipe.imageRevision);
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
    if (!ready || picking != null) return;
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
  }, [ready, rematchKey, picking]);

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

  const openPicker = (index: number) => {
    const name = draft.ingredients[index]?.name.trim() ?? '';
    setPickHits([]);
    setPickQuery(name);
    setPicking(index);
  };

  const closePicker = () => {
    setPicking(null);
    setPickQuery('');
    setPickHits([]);
  };

  useEffect(() => {
    if (picking == null) return;
    const q = pickQuery.trim();
    if (q.length < 1) {
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
    }, 180);
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
      const saved = id ? await recipesApi.update(id, payload) : await recipesApi.create(payload);
      clearRecipeDraftSession();
      navigate(`/recipes/${saved.id}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, t('recipes.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const onPickImage = async (file: File) => {
    try {
      const jpeg = await fileToCompressedJpegFile(file, 'recipe.jpg');
      if (id) {
        const uploaded = await recipesApi.uploadImage(id, jpeg);
        setHasExistingImage(true);
        setImageRev(uploaded.imageRevision ?? Date.now());
        return;
      }
      const res = await recipesApi.uploadTempImage(jpeg, tempImageKey);
      setTempImageKey(res.tempImageKey);
      const session = readRecipeDraftSession();
      saveRecipeDraftSession({
        draft: session?.draft ?? draft,
        tempImageKey: res.tempImageKey,
      });
    } catch (err) {
      setError(getErrorMessage(err, t('recipes.changeImageError')));
    }
  };

  if (!ready) {
    return (
      <div className={`${styles.screen} page-scroll`}>
        <div className={styles.center}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const picker =
    picking != null
      ? createPortal(
          <div className={styles.pickerRoot}>
            <button type="button" className={styles.pickerBackdrop} onClick={closePicker} aria-label={t('common.close')} />
            <div className={styles.pickerSheet} role="dialog" aria-modal="true">
              <div className={styles.pickerHead}>
                <h2>{t('recipes.matchPick')}</h2>
                <button type="button" className={styles.pickerClose} onClick={closePicker} aria-label={t('common.close')}>
                  <IconClose size={20} color={Colors.dashboard.stroke} />
                </button>
              </div>
              <div className={styles.pickerSearch}>
                <IconSearch size={18} color="rgba(0,0,0,0.4)" />
                <input
                  className={styles.pickerInput}
                  autoFocus
                  value={pickQuery}
                  placeholder={t('recipes.matchSearch')}
                  onChange={(e) => setPickQuery(e.target.value)}
                />
              </div>
              {pickBusy && <p className={styles.pickerHint}>{t('common.loading')}</p>}
              {!pickBusy && pickQuery.trim() && pickHits.length === 0 && (
                <p className={styles.pickerHint}>{t('food.noResults')}</p>
              )}
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1 className={styles.pageTitle}>{t('recipes.reviewTitle')}</h1>
        <span className={styles.headerSpacer} />
      </header>
      <p className={styles.hint}>{t('recipes.reviewHint')}</p>

      <section className={styles.card}>
        <div className={styles.imageWrap}>
          {tempImageKey ? (
            <AuthedImage tempKey={tempImageKey} alt="" className={styles.preview} />
          ) : id && hasExistingImage ? (
            <AuthedImage recipeId={id} alt="" className={styles.preview} revision={imageRev} key={`${id}-${imageRev}`} />
          ) : (
            <div className={styles.previewEmpty}>
              <IconRestaurant size={28} color="rgba(0,0,0,0.28)" />
              <span>{t('recipes.noImage')}</span>
            </div>
          )}
          <button
            type="button"
            className={styles.imageBtn}
            onClick={() => fileRef.current?.click()}
            aria-label={t('recipes.changeImage')}
          >
            <IconPhotoCamera size={18} color={Colors.dashboard.stroke} />
          </button>
        </div>
        {tempImageKey ? <p className={styles.imageHint}>{t('recipes.changeImageHint')}</p> : null}
        <label className={styles.label}>{t('recipes.fieldTitle')}</label>
        <input
          className={styles.input}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </section>

      <section className={styles.card}>
        <label className={styles.label}>{t('recipes.fieldDescription')}</label>
        <textarea
          className={styles.textarea}
          value={draft.description ?? ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />

        <span className={styles.label}>{t('recipes.servings')}</span>
        <div className={styles.stepper}>
          <button type="button" onClick={() => setDraft({ ...draft, servings: Math.max(1, draft.servings - 1) })}>
            −
          </button>
          <span>{draft.servings}</span>
          <button type="button" onClick={() => setDraft({ ...draft, servings: Math.min(50, draft.servings + 1) })}>
            +
          </button>
        </div>

        <span className={styles.label}>{t('recipes.mealType')}</span>
        <div className={styles.catChips}>
          {RECIPE_CATEGORIES.map((c) => {
            const meta = RECIPE_CATEGORY_META[c];
            const Icon = meta.Icon;
            const on = draft.category === c;
            return (
              <button
                key={c}
                type="button"
                className={`${styles.catChip} ${on ? styles.catChipOn : ''}`}
                onClick={() => setDraft({ ...draft, category: on ? null : c })}
              >
                <span className={styles.catIcon} style={{ background: meta.bg }}>
                  <Icon size={16} color={Colors.dashboard.stroke} />
                </span>
                {t(meta.labelKey)}
              </button>
            );
          })}
        </div>

        <span className={styles.label}>{t('recipes.dietLabel')}</span>
        <div className={styles.catChips}>
          {RECIPE_DIET_TAGS.map((tag) => {
            const meta = RECIPE_DIET_META[tag];
            const Icon = meta.Icon;
            const selected = (draft.dietTags ?? []).includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`${styles.catChip} ${selected ? styles.catChipOn : ''}`}
                onClick={() => {
                  const current = draft.dietTags ?? [];
                  setDraft({
                    ...draft,
                    dietTags: selected ? current.filter((x) => x !== tag) : [...current, tag],
                  });
                }}
              >
                <span className={styles.catIcon} style={{ background: meta.bg }}>
                  <Icon size={16} color={Colors.dashboard.stroke} />
                </span>
                {t(meta.labelKey)}
              </button>
            );
          })}
        </div>

        <span className={styles.label}>{t('recipes.prepMinutes')}</span>
        <div className={styles.stepper}>
          <button
            type="button"
            onClick={() =>
              setDraft({ ...draft, prepMinutes: Math.max(0, (draft.prepMinutes ?? 0) - 5) })
            }
          >
            −
          </button>
          <span>{draft.prepMinutes ?? 0}</span>
          <button
            type="button"
            onClick={() =>
              setDraft({ ...draft, prepMinutes: Math.min(600, (draft.prepMinutes ?? 0) + 5) })
            }
          >
            +
          </button>
        </div>

        <span className={styles.label}>{t('recipes.effort')}</span>
        <div className={styles.catChips}>
          {(['QUICK', 'NORMAL', 'PROJECT'] as const).map((effort) => (
            <button
              key={effort}
              type="button"
              className={`${styles.catChip} ${draft.effort === effort ? styles.catChipOn : ''}`}
              onClick={() => setDraft({ ...draft, effort })}
            >
              {t(
                effort === 'QUICK'
                  ? 'recipes.effortQuick'
                  : effort === 'PROJECT'
                    ? 'recipes.effortProject'
                    : 'recipes.effortNormal',
              )}
            </button>
          ))}
        </div>

        <span className={styles.label}>{t('recipes.leftoverDays')}</span>
        <div className={styles.stepper}>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, leftoverDays: Math.max(0, (draft.leftoverDays ?? 0) - 1) })}
          >
            −
          </button>
          <span>{draft.leftoverDays ?? 0}</span>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, leftoverDays: Math.min(7, (draft.leftoverDays ?? 0) + 1) })}
          >
            +
          </button>
        </div>

        <span className={styles.label}>{t('recipes.seasonMonths')}</span>
        <div className={styles.catChips}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const selected = (draft.seasonMonths ?? []).includes(month);
            return (
              <button
                key={month}
                type="button"
                className={`${styles.catChip} ${selected ? styles.catChipOn : ''}`}
                onClick={() => {
                  const current = draft.seasonMonths ?? [];
                  setDraft({
                    ...draft,
                    seasonMonths: selected
                      ? current.filter((x) => x !== month)
                      : [...current, month].sort((a, b) => a - b),
                  });
                }}
              >
                {new Date(2026, month - 1, 1).toLocaleDateString(
                  i18n.language?.startsWith('en') ? 'en-US' : 'hu-HU',
                  { month: 'short' },
                )}
              </button>
            );
          })}
        </div>
      </section>

      {nutrition && <RecipeNutritionCard nutrition={nutrition} dietTags={draft.dietTags} />}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('recipes.ingredients')}</h2>
        <div className={styles.ingList}>
          {draft.ingredients.map((ing, i) => {
            const tone = matchTone(ing);
            return (
              <SwipeDeleteRow
                key={i}
                enabled
                deleteLabel={t('common.delete')}
                onDelete={() =>
                  setDraft((d) => ({
                    ...d,
                    ingredients: d.ingredients.filter((_, idx) => idx !== i),
                  }))
                }
              >
                <div className={styles.ingBlock}>
                  <input
                    className={styles.ingName}
                    placeholder={t('recipes.ingredientName')}
                    value={ing.name}
                    onChange={(e) => setIng(i, { name: e.target.value })}
                  />
                  <div className={styles.qtyRow}>
                    <input
                      className={styles.ingAmt}
                      placeholder={t('recipes.amount')}
                      type="number"
                      value={ing.amount ?? ''}
                      onChange={(e) =>
                        setIng(i, { amount: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    />
                    <input
                      className={styles.ingUnit}
                      placeholder={t('recipes.unit')}
                      value={ing.unit ?? ''}
                      onChange={(e) => setIng(i, { unit: e.target.value })}
                    />
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
                        <span>{t('recipes.matchSuggest', { name: ing.suggestedFood.displayName })}</span>
                      )}
                      {tone === 'miss' && <span>{t('recipes.matchMiss')}</span>}
                      <div className={styles.matchActions}>
                        {tone === 'maybe' && ing.suggestedFood && (
                          <button
                            type="button"
                            className={styles.matchBtn}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              bindFood(i, ing.suggestedFood!);
                            }}
                          >
                            {t('recipes.matchAccept')}
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.pickCta}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openPicker(i);
                          }}
                        >
                          {tone === 'ok' || tone === 'maybe' ? t('recipes.matchReplace') : t('recipes.matchPick')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </SwipeDeleteRow>
            );
          })}
        </div>
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
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('recipes.instructions')}</h2>
        {draft.instructions.map((step, i) => (
          <SwipeDeleteRow
            key={i}
            enabled
            deleteLabel={t('common.delete')}
            onDelete={() =>
              setDraft((d) => ({
                ...d,
                instructions: d.instructions.filter((_, idx) => idx !== i),
              }))
            }
          >
            <div className={styles.step}>
              <span className={styles.stepNum}>{i + 1}</span>
              <textarea
                className={styles.stepText}
                placeholder={t('recipes.stepN', { n: i + 1 })}
                value={step}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    instructions: d.instructions.map((s, idx) => (idx === i ? e.target.value : s)),
                  }))
                }
              />
            </div>
          </SwipeDeleteRow>
        ))}
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setDraft((d) => ({ ...d, instructions: [...d.instructions, ''] }))}
        >
          {t('recipes.addStep')}
        </button>
      </section>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.saveWrap}>
        <PrimaryButton
          label={saving ? t('recipes.saving') : t('recipes.save')}
          onClick={() => void handleSave()}
          loading={saving}
          disabled={saving}
        />
      </div>

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

      {picker}
    </div>
  );
}
