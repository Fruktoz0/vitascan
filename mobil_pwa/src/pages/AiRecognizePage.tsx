import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconArrowBack,
  IconBrain,
  IconClose,
  IconPhotoCamera,
  IconPhotoLibrary,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { foodApi, getErrorMessage, logApi } from '../services/api';
import { toLocalDateStr, useDateStore } from '../stores/dateStore';
import type { MealType } from '../utils/mealMeta';
import { fileToCompressedJpeg } from '../utils/imageToJpeg';
import styles from './AiRecognizePage.module.css';

type Mode = 'choose' | 'photo' | 'text' | 'result';

type IngredientDraft = {
  id: string;
  name: string;
  amountG: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
  brand: string;
  barcode: string;
  servingUnit: string;
  servingSize: string;
};

const SERVING_UNITS = ['g', 'db', 'adag', 'ek', 'szelet'] as const;

const MEALS: MealType[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeUnit(u?: string) {
  const v = String(u || 'g').trim().toLowerCase();
  return (SERVING_UNITS as readonly string[]).includes(v) ? v : 'g';
}

function toDraft(ing: {
  name: string;
  amountG: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  brand?: string;
  barcode?: string;
  servingUnit?: string;
  servingSize?: number;
}): IngredientDraft {
  const servingUnit = normalizeUnit(ing.servingUnit);
  const servingSize =
    ing.servingSize != null && ing.servingSize > 0
      ? ing.servingSize
      : servingUnit === 'g'
        ? ing.amountG
        : ing.amountG;
  return {
    id: uid(),
    name: ing.name,
    amountG: String(Math.round(ing.amountG * 10) / 10),
    kcal: String(Math.round(ing.kcal * 10) / 10),
    protein: String(Math.round(ing.protein * 10) / 10),
    carbs: String(Math.round(ing.carbs * 10) / 10),
    fat: String(Math.round(ing.fat * 10) / 10),
    fiber: ing.fiber != null ? String(Math.round(ing.fiber * 10) / 10) : '',
    sugar: ing.sugar != null ? String(Math.round(ing.sugar * 10) / 10) : '',
    brand: ing.brand?.trim() || '',
    barcode: ing.barcode?.trim() || '',
    servingUnit,
    servingSize: String(Math.round(servingSize * 10) / 10),
  };
}

function parseNum(v: string) {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export default function AiRecognizePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const selectedDate = useDateStore((s) => s.selectedDate);
  const mealParam = params.get('mealType') as MealType | null;
  const mealType: MealType = mealParam && MEALS.includes(mealParam) ? mealParam : 'SNACK';
  const returnPath =
    (location.state as { returnPath?: string } | null)?.returnPath || '/home';

  type PrefillSuggestion = {
    dishName?: string;
    ingredients?: Array<{
      name: string;
      amountG?: number;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      note?: string;
    }>;
  };

  const prefillSuggestion = (location.state as { prefillSuggestion?: PrefillSuggestion } | null)
    ?.prefillSuggestion;

  const goToAddFood = () => {
    navigate(returnPath, { replace: true, state: { openAddFood: true } });
  };

  const [mode, setMode] = useState<Mode>('choose');
  const [text, setText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dishName, setDishName] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [logAsPrepared, setLogAsPrepared] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ title: string; message: string; goBack?: boolean } | null>(
    null,
  );

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const prefillAppliedRef = useRef(false);

  useEffect(() => {
    if (prefillAppliedRef.current || !prefillSuggestion) return;
    prefillAppliedRef.current = true;
    const ings = (prefillSuggestion.ingredients ?? []).filter((i) => i?.name?.trim());
    if (ings.length === 0) return;
    setDishName(
      (prefillSuggestion.dishName || ings[0]?.name || '').trim() || t('aiRecognize.dishName'),
    );
    setIngredients(
      ings.map((ing) => {
        const amountG =
          ing.amountG != null && ing.amountG > 0
            ? ing.amountG
            : Math.max(50, Math.min(400, Math.round((ing.kcal || 100) / 1.5)));
        return toDraft({
          name: ing.name.trim(),
          amountG,
          kcal: ing.kcal,
          protein: ing.protein,
          carbs: ing.carbs,
          fat: ing.fat,
        });
      }),
    );
    // Meal suggest → default as prepared dish (not ingredient breakdown).
    setLogAsPrepared(true);
    setMode('result');
  }, [prefillSuggestion, t]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const totals = useMemo(() => {
    return ingredients.reduce(
      (acc, ing) => ({
        kcal: acc.kcal + (parseNum(ing.kcal) || 0),
        protein: acc.protein + (parseNum(ing.protein) || 0),
        carbs: acc.carbs + (parseNum(ing.carbs) || 0),
        fat: acc.fat + (parseNum(ing.fat) || 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [ingredients]);

  const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';

  const onPickFile = (file: File | null) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMode('photo');
  };

  const runRecognize = async (opts: { mode: 'photo' | 'text' }) => {
    setBusy(true);
    try {
      let payload: Parameters<typeof foodApi.aiRecognize>[0];
      if (opts.mode === 'photo') {
        if (!imageFile) {
          setDialog({ title: t('food.errorTitle'), message: t('aiRecognize.needPhoto') });
          return;
        }
        const { base64, mimeType } = await fileToCompressedJpeg(imageFile);
        payload = { mode: 'photo', imageBase64: base64, mimeType, locale };
      } else {
        if (!text.trim()) {
          setDialog({ title: t('food.errorTitle'), message: t('aiRecognize.needText') });
          return;
        }
        payload = { mode: 'text', text: text.trim(), locale };
      }

      const res = await foodApi.aiRecognize(payload);
      setDishName(res.dishName || '');
      setIngredients(res.ingredients.map(toDraft));
      setRemaining(res.remaining);
      setMode('result');
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('aiRecognize.failed')),
      });
    } finally {
      setBusy(false);
    }
  };

  const updateIng = (id: string, patch: Partial<IngredientDraft>) => {
    setIngredients((prev) => prev.map((ing) => (ing.id === id ? { ...ing, ...patch } : ing)));
  };

  const updateAmountG = (id: string, nextAmountRaw: string) => {
    setIngredients((prev) =>
      prev.map((ing) => {
        if (ing.id !== id) return ing;
        const oldG = parseNum(ing.amountG);
        const cleaned = nextAmountRaw.replace(/[^\d.,]/g, '');
        const newG = parseNum(cleaned);
        if (!Number.isFinite(oldG) || oldG <= 0 || !Number.isFinite(newG) || newG <= 0) {
          return { ...ing, amountG: cleaned };
        }
        const scale = newG / oldG;
        const scaleField = (v: string) => {
          if (!v.trim()) return v;
          const n = parseNum(v);
          if (!Number.isFinite(n)) return v;
          return String(Math.round(n * scale * 10) / 10);
        };
        return {
          ...ing,
          amountG: cleaned,
          kcal: scaleField(ing.kcal),
          protein: scaleField(ing.protein),
          carbs: scaleField(ing.carbs),
          fat: scaleField(ing.fat),
          fiber: scaleField(ing.fiber),
          sugar: scaleField(ing.sugar),
        };
      }),
    );
  };

  const removeIng = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  };

  const scalePreparedTotal = (
    field: 'amountG' | 'kcal' | 'protein' | 'carbs' | 'fat',
    nextRaw: string,
  ) => {
    const cleaned = nextRaw.replace(/[^\d.,]/g, '');
    if (ingredients.length === 1) {
      const only = ingredients[0]!;
      if (field === 'amountG') {
        updateAmountG(only.id, cleaned);
        return;
      }
      updateIng(only.id, { [field]: cleaned });
      return;
    }
    const oldTotal =
      field === 'amountG'
        ? ingredients.reduce((s, i) => s + (parseNum(i.amountG) || 0), 0)
        : totals[field];
    const newTotal = parseNum(cleaned);
    if (!Number.isFinite(oldTotal) || oldTotal <= 0 || !Number.isFinite(newTotal) || newTotal < 0) {
      return;
    }
    const scale = newTotal / oldTotal;
    setIngredients((prev) =>
      prev.map((ing) => {
        if (field === 'amountG') {
          const oldG = parseNum(ing.amountG);
          if (!Number.isFinite(oldG) || oldG <= 0) return ing;
          const newG = Math.round(oldG * scale * 10) / 10;
          const scaleField = (v: string) => {
            if (!v.trim()) return v;
            const n = parseNum(v);
            if (!Number.isFinite(n)) return v;
            return String(Math.round(n * scale * 10) / 10);
          };
          return {
            ...ing,
            amountG: String(newG),
            kcal: scaleField(ing.kcal),
            protein: scaleField(ing.protein),
            carbs: scaleField(ing.carbs),
            fat: scaleField(ing.fat),
            fiber: scaleField(ing.fiber),
            sugar: scaleField(ing.sugar),
          };
        }
        const n = parseNum(ing[field]);
        if (!Number.isFinite(n)) return ing;
        return { ...ing, [field]: String(Math.round(n * scale * 10) / 10) };
      }),
    );
  };

  const handleSave = async () => {
    if (!ingredients.length) {
      setDialog({ title: t('food.errorTitle'), message: t('aiRecognize.noIngredients') });
      return;
    }

    const parsed = ingredients.map((ing) => ({
      name: ing.name.trim(),
      amountG: parseNum(ing.amountG),
      kcal: parseNum(ing.kcal),
      protein: parseNum(ing.protein),
      carbs: parseNum(ing.carbs),
      fat: parseNum(ing.fat),
      fiber: ing.fiber.trim() ? parseNum(ing.fiber) : undefined,
      sugar: ing.sugar.trim() ? parseNum(ing.sugar) : undefined,
      brand: ing.brand.trim() || undefined,
      barcode: ing.barcode.trim() || undefined,
      servingUnit: normalizeUnit(ing.servingUnit),
      servingSize: parseNum(ing.servingSize),
    }));

    if (
      parsed.some(
        (p) =>
          !p.name ||
          ![p.amountG, p.kcal, p.protein, p.carbs, p.fat].every((n) => Number.isFinite(n) && n >= 0) ||
          p.amountG <= 0 ||
          !Number.isFinite(p.servingSize) ||
          p.servingSize <= 0,
      )
    ) {
      setDialog({ title: t('food.errorTitle'), message: t('aiRecognize.invalidValues') });
      return;
    }

    setSaving(true);
    try {
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const totalG = parsed.reduce((s, p) => s + p.amountG, 0);
      const totalMacros = parsed.reduce(
        (acc, p) => ({
          kcal: acc.kcal + p.kcal,
          protein: acc.protein + p.protein,
          carbs: acc.carbs + p.carbs,
          fat: acc.fat + p.fat,
          fiber: acc.fiber + (p.fiber ?? 0),
          sugar: acc.sugar + (p.sugar ?? 0),
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
      );

      let preparedFoodId: string | undefined;
      if (saveToLibrary) {
        const per100 = (n: number) =>
          totalG > 0 ? Math.round((n / totalG) * 100 * 10) / 10 : 0;
        const food = await foodApi.create({
          name: dishName.trim() || parsed[0]!.name,
          kcal: per100(totalMacros.kcal),
          protein: per100(totalMacros.protein),
          carbs: per100(totalMacros.carbs),
          fat: per100(totalMacros.fat),
          fiber: totalMacros.fiber > 0 ? per100(totalMacros.fiber) : undefined,
          sugar: totalMacros.sugar > 0 ? per100(totalMacros.sugar) : undefined,
          servingSize: Math.round(totalG * 10) / 10,
          servingUnit: 'adag',
          source: 'USER_SCAN',
          isPrepared: true,
          components: parsed.map((p, i) => ({
            name: p.name,
            amountG: p.amountG,
            kcal: p.kcal,
            protein: p.protein,
            carbs: p.carbs,
            fat: p.fat,
            fiber: p.fiber,
            sugar: p.sugar,
            sortOrder: i,
          })),
        });
        preparedFoodId = food.id;
      }

      const date = toLocalDateStr(selectedDate);

      if (logAsPrepared) {
        await logApi.create({
          ...(preparedFoodId ? { foodId: preparedFoodId } : {}),
          foodName: dishName.trim() || parsed[0]!.name,
          kcal: round1(totalMacros.kcal),
          protein: round1(totalMacros.protein),
          carbs: round1(totalMacros.carbs),
          fat: round1(totalMacros.fat),
          fiber: totalMacros.fiber > 0 ? round1(totalMacros.fiber) : undefined,
          sugar: totalMacros.sugar > 0 ? round1(totalMacros.sugar) : undefined,
          amount: Math.max(1, Math.round(totalG * 10) / 10),
          mealType,
          source: 'AI',
          date,
          sourcePreparedFoodId: preparedFoodId,
        });
      } else {
        const logGroupId = crypto.randomUUID();
        for (const p of parsed) {
          await logApi.create({
            foodName: p.name,
            kcal: p.kcal,
            protein: p.protein,
            carbs: p.carbs,
            fat: p.fat,
            fiber: p.fiber,
            sugar: p.sugar,
            amount: p.amountG,
            mealType,
            source: 'AI',
            date,
            logGroupId,
            sourcePreparedFoodId: preparedFoodId,
          });
        }
      }

      setDialog({
        title: t('aiRecognize.savedTitle'),
        message: saveToLibrary ? t('aiRecognize.savedLibrary') : t('aiRecognize.savedMeal'),
        goBack: true,
      });
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('aiRecognize.saveFailed')),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={goToAddFood}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('aiRecognize.screenTitle')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.content}>
        {mode === 'choose' && (
          <>
            <p className={styles.lead}>{t('aiRecognize.chooseLead')}</p>
            <button type="button" className={styles.modeCard} onClick={() => setMode('photo')}>
              <span className={styles.modeIcon} style={{ background: '#D8EADF' }}>
                <IconPhotoCamera size={24} color={Colors.dashboard.stroke} />
              </span>
              <span className={styles.modeText}>
                <span className={styles.modeTitle}>{t('aiRecognize.fromPhoto')}</span>
                <span className={styles.modeSub}>{t('aiRecognize.fromPhotoDesc')}</span>
              </span>
            </button>
            <button type="button" className={styles.modeCard} onClick={() => setMode('text')}>
              <span className={styles.modeIcon} style={{ background: '#F4E5C2' }}>
                <IconBrain size={24} color={Colors.dashboard.stroke} />
              </span>
              <span className={styles.modeText}>
                <span className={styles.modeTitle}>{t('aiRecognize.fromText')}</span>
                <span className={styles.modeSub}>{t('aiRecognize.fromTextDesc')}</span>
              </span>
            </button>
            <p className={styles.hint}>{t('aiRecognize.limitHint', { limit: 20 })}</p>
          </>
        )}

        {mode === 'photo' && (
          <>
            <p className={styles.lead}>{t('aiRecognize.photoLead')}</p>
            <div className={styles.photoActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => cameraInputRef.current?.click()}
              >
                <IconPhotoCamera size={18} color={Colors.dashboard.stroke} />
                {t('aiRecognize.takePhoto')}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => galleryInputRef.current?.click()}
              >
                <IconPhotoLibrary size={18} color={Colors.dashboard.stroke} />
                {t('aiRecognize.pickGallery')}
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className={styles.hiddenInput}
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            {previewUrl && (
              <div className={styles.previewWrap}>
                <img src={previewUrl} alt="" className={styles.previewImg} />
                <p className={styles.noStore}>{t('aiRecognize.photoNotStored')}</p>
              </div>
            )}
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={!imageFile || busy}
              onClick={() => runRecognize({ mode: 'photo' })}
            >
              {busy ? <span className="spinner" style={{ width: 22, height: 22 }} /> : t('aiRecognize.run')}
            </button>
            <button type="button" className={styles.linkBtn} onClick={() => setMode('choose')}>
              {t('aiRecognize.backToChoose')}
            </button>
          </>
        )}

        {mode === 'text' && (
          <>
            <p className={styles.lead}>{t('aiRecognize.textLead')}</p>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={t('aiRecognize.textPlaceholder')}
            />
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={!text.trim() || busy}
              onClick={() => runRecognize({ mode: 'text' })}
            >
              {busy ? <span className="spinner" style={{ width: 22, height: 22 }} /> : t('aiRecognize.run')}
            </button>
            <button type="button" className={styles.linkBtn} onClick={() => setMode('choose')}>
              {t('aiRecognize.backToChoose')}
            </button>
          </>
        )}

        {mode === 'result' && (
          <>
            {previewUrl && (
              <div className={styles.previewWrap}>
                <img src={previewUrl} alt="" className={styles.previewImg} />
                <p className={styles.noStore}>{t('aiRecognize.photoNotStored')}</p>
              </div>
            )}

            <div className={styles.fieldCard}>
              <label className={styles.fieldLabel}>{t('aiRecognize.dishName')}</label>
              <input
                className={styles.input}
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
              />
              <label className={styles.preparedCheck}>
                <span className={styles.preparedCheckBox} data-checked={logAsPrepared || undefined}>
                  <input
                    type="checkbox"
                    checked={logAsPrepared}
                    onChange={(e) => setLogAsPrepared(e.target.checked)}
                  />
                  {logAsPrepared ? '✓' : null}
                </span>
                <span className={styles.preparedCheckText}>
                  <strong>{t('aiRecognize.logAsPrepared')}</strong>
                  <small>{t('aiRecognize.logAsPreparedHint')}</small>
                </span>
              </label>
            </div>

            {remaining != null && (
              <p className={styles.hint}>{t('aiRecognize.remaining', { count: remaining })}</p>
            )}

            {logAsPrepared ? (
              <div className={styles.preparedDishCard}>
                <div className={styles.preparedDishHead}>
                  <span className={styles.preparedDishBadge}>{t('aiRecognize.preparedDishBadge')}</span>
                  <p className={styles.preparedDishName}>
                    {dishName.trim() || t('aiRecognize.dishName')}
                  </p>
                  {ingredients.length > 1 ? (
                    <p className={styles.preparedDishMeta}>
                      {t('aiRecognize.preparedPartsHint', { count: ingredients.length })}
                    </p>
                  ) : null}
                </div>
                <div className={styles.grid}>
                  <label>
                    {t('aiRecognize.amountG')}
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={
                        ingredients.length === 1
                          ? ingredients[0]!.amountG
                          : String(
                              Math.round(
                                ingredients.reduce((s, i) => s + (parseNum(i.amountG) || 0), 0) * 10,
                              ) / 10,
                            )
                      }
                      onChange={(e) => scalePreparedTotal('amountG', e.target.value)}
                    />
                  </label>
                  <label>
                    kcal
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={
                        ingredients.length === 1
                          ? ingredients[0]!.kcal
                          : String(Math.round(totals.kcal * 10) / 10)
                      }
                      onChange={(e) => scalePreparedTotal('kcal', e.target.value)}
                    />
                  </label>
                  <label>
                    {t('food.protein')}
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={
                        ingredients.length === 1
                          ? ingredients[0]!.protein
                          : String(Math.round(totals.protein * 10) / 10)
                      }
                      onChange={(e) => scalePreparedTotal('protein', e.target.value)}
                    />
                  </label>
                  <label>
                    {t('food.carbs')}
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={
                        ingredients.length === 1
                          ? ingredients[0]!.carbs
                          : String(Math.round(totals.carbs * 10) / 10)
                      }
                      onChange={(e) => scalePreparedTotal('carbs', e.target.value)}
                    />
                  </label>
                  <label>
                    {t('food.fat')}
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={
                        ingredients.length === 1
                          ? ingredients[0]!.fat
                          : String(Math.round(totals.fat * 10) / 10)
                      }
                      onChange={(e) => scalePreparedTotal('fat', e.target.value)}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <h2 className={styles.sectionTitle}>{t('aiRecognize.ingredients')}</h2>

                {ingredients.map((ing) => (
                  <div key={ing.id} className={styles.ingCard}>
                    <div className={styles.ingHead}>
                      <input
                        className={styles.input}
                        value={ing.name}
                        onChange={(e) => updateIng(ing.id, { name: e.target.value })}
                        placeholder={t('food.foodName')}
                      />
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        aria-label={t('common.delete', 'Delete')}
                        onClick={() => removeIng(ing.id)}
                      >
                        <IconClose size={18} color="#B83B3B" />
                      </button>
                    </div>
                    <div className={styles.metaRow}>
                      <label>
                        {t('food.brandOptional')}
                        <input
                          className={styles.input}
                          value={ing.brand}
                          onChange={(e) => updateIng(ing.id, { brand: e.target.value })}
                          placeholder={t('food.brandOptional')}
                        />
                      </label>
                      <label>
                        {t('food.barcodeOptional')}
                        <input
                          className={styles.input}
                          value={ing.barcode}
                          onChange={(e) => updateIng(ing.id, { barcode: e.target.value })}
                          placeholder={t('food.barcodeOptional')}
                          inputMode="numeric"
                        />
                      </label>
                    </div>
                    <div className={styles.grid}>
                      <label>
                        {t('aiRecognize.amountG')}
                        <input
                          className={styles.input}
                          inputMode="decimal"
                          value={ing.amountG}
                          onChange={(e) => updateAmountG(ing.id, e.target.value)}
                        />
                      </label>
                      <label>
                        {t('aiRecognize.servingUnit')}
                        <select
                          className={styles.input}
                          value={ing.servingUnit}
                          onChange={(e) => updateIng(ing.id, { servingUnit: e.target.value })}
                        >
                          <option value="g">{t('food.unitG')}</option>
                          <option value="db">{t('food.unitDb')}</option>
                          <option value="adag">{t('food.unitAdag')}</option>
                          <option value="ek">{t('food.unitEk')}</option>
                          <option value="szelet">{t('food.unitSzelet')}</option>
                        </select>
                      </label>
                      <label>
                        {t('aiRecognize.servingSizeG')}
                        <input
                          className={styles.input}
                          inputMode="decimal"
                          value={ing.servingSize}
                          onChange={(e) => updateIng(ing.id, { servingSize: e.target.value })}
                        />
                      </label>
                      <label>
                        kcal
                        <input
                          className={styles.input}
                          inputMode="decimal"
                          value={ing.kcal}
                          onChange={(e) => updateIng(ing.id, { kcal: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('food.protein')}
                        <input
                          className={styles.input}
                          inputMode="decimal"
                          value={ing.protein}
                          onChange={(e) => updateIng(ing.id, { protein: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('food.carbs')}
                        <input
                          className={styles.input}
                          inputMode="decimal"
                          value={ing.carbs}
                          onChange={(e) => updateIng(ing.id, { carbs: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('food.fat')}
                        <input
                          className={styles.input}
                          inputMode="decimal"
                          value={ing.fat}
                          onChange={(e) => updateIng(ing.id, { fat: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <div className={styles.summaryCard}>
                  <div className={styles.summaryTitle}>{t('aiRecognize.summary')}</div>
                  <div className={styles.summaryRow}>
                    <span>{Math.round(totals.kcal)} kcal</span>
                    <span>
                      F {Math.round(totals.protein * 10) / 10}g · Sz{' '}
                      {Math.round(totals.carbs * 10) / 10}g · Zs {Math.round(totals.fat * 10) / 10}g
                    </span>
                  </div>
                </div>
              </>
            )}

            <label className={styles.preparedCheck}>
              <span className={styles.preparedCheckBox} data-checked={saveToLibrary || undefined}>
                <input
                  type="checkbox"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                />
                {saveToLibrary ? '✓' : null}
              </span>
              <span className={styles.preparedCheckText}>
                <strong>{t('aiRecognize.saveToLibrary')}</strong>
              </span>
            </label>

            <button
              type="button"
              className={styles.primaryBtn}
              disabled={saving || !ingredients.length}
              onClick={handleSave}
            >
              {saving ? (
                <span className="spinner" style={{ width: 22, height: 22 }} />
              ) : (
                t('aiRecognize.addToMeal')
              )}
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={t('common.ok', 'OK')}
        onClose={() => {
          const go = dialog?.goBack;
          setDialog(null);
          if (go) navigate(-1);
        }}
      />
    </div>
  );
}
