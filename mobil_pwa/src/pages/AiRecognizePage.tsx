import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
};

const MEALS: MealType[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
}): IngredientDraft {
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
  };
}

function parseNum(v: string) {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        reject(new Error('Invalid image data'));
        return;
      }
      resolve({ mimeType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

export default function AiRecognizePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selectedDate = useDateStore((s) => s.selectedDate);
  const mealParam = params.get('mealType') as MealType | null;
  const mealType: MealType = mealParam && MEALS.includes(mealParam) ? mealParam : 'SNACK';

  const [mode, setMode] = useState<Mode>('choose');
  const [text, setText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dishName, setDishName] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ title: string; message: string; goBack?: boolean } | null>(
    null,
  );

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

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
        const { base64, mimeType } = await fileToBase64(imageFile);
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

  const removeIng = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
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
    }));

    if (
      parsed.some(
        (p) =>
          !p.name ||
          ![p.amountG, p.kcal, p.protein, p.carbs, p.fat].every((n) => Number.isFinite(n) && n >= 0) ||
          p.amountG <= 0,
      )
    ) {
      setDialog({ title: t('food.errorTitle'), message: t('aiRecognize.invalidValues') });
      return;
    }

    setSaving(true);
    try {
      for (const p of parsed) {
        let foodId: string | undefined;
        if (saveToLibrary) {
          const per100 = (n: number) => Math.round((n / p.amountG) * 100 * 10) / 10;
          const food = await foodApi.create({
            name: p.name,
            brand: p.brand,
            barcode: p.barcode,
            kcal: per100(p.kcal),
            protein: per100(p.protein),
            carbs: per100(p.carbs),
            fat: per100(p.fat),
            fiber: p.fiber != null ? per100(p.fiber) : undefined,
            sugar: p.sugar != null ? per100(p.sugar) : undefined,
            servingSize: p.amountG,
            servingUnit: 'g',
            source: 'USER_SCAN',
          });
          foodId = food.id;
        }

        await logApi.create({
          ...(foodId ? { foodId } : {}),
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
          date: toLocalDateStr(selectedDate),
        });
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
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
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
            <p className={styles.hint}>{t('aiRecognize.limitHint', { limit: 10 })}</p>
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
            </div>

            {remaining != null && (
              <p className={styles.hint}>{t('aiRecognize.remaining', { count: remaining })}</p>
            )}

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
                      onChange={(e) => updateIng(ing.id, { amountG: e.target.value })}
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
                  F {Math.round(totals.protein * 10) / 10}g · Sz {Math.round(totals.carbs * 10) / 10}g ·
                  Zs {Math.round(totals.fat * 10) / 10}g
                </span>
              </div>
            </div>

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={saveToLibrary}
                onChange={(e) => setSaveToLibrary(e.target.checked)}
              />
              <span>{t('aiRecognize.saveToLibrary')}</span>
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
