import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { BentoCard } from '../components/ui/BentoCard';
import { AddFoodManualModal, CreateFoodModal, FoodDetailModal, EditLogModal, distinctBrand, type DailyLogItem } from '../components/food/FoodModals';
import {
  IconAdd,
  IconBrain,
  IconCalendarToday,
  IconLocalFire,
  IconNoteOutline,
  IconPieChartOutline,
} from '../components/ui/Icons';
import { analysisApi, dayNoteApi, logApi, statsApi, ApiError, type DailyAnalysisResult, type Food } from '../services/api';
import { toLocalDateStr, useDateStore } from '../stores/dateStore';
import { useProfileStore } from '../stores/profileStore';
import { UserAvatar } from '../components/ui/AvatarPicker';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { AnalysisResultView } from '../components/food/AnalysisResult';
import { parseAnalysisContent } from '../utils/parseAnalysisContent';
import { Colors } from '../design/tokens';
import { MEAL_META, type MealType } from '../utils/mealMeta';
import { getNearestMealType, mealKcalGoal } from '../utils/mealInsights';
import { groupDiaryLogs } from '../utils/groupDiaryLogs';
import styles from './FoodLibraryPage.module.css';

const VALID_MEALS: MealType[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'];

type DialogState =
  | null
  | { mode: 'alert'; title: string; message: string }
  | { mode: 'confirm'; title: string; message: string; onConfirm: () => void };


export default function FoodLibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedDate } = useDateStore();
  const avatarKey = useProfileStore((s) => s.avatarKey);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [prefillBarcode, setPrefillBarcode] = useState<string | undefined>();
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedLog, setSelectedLog] = useState<DailyLogItem | null>(null);
  const [mealForAdd, setMealForAdd] = useState<MealType>('SNACK');
  const [analysis, setAnalysis] = useState<DailyAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [dayNoteDraft, setDayNoteDraft] = useState('');
  const [dayNoteSaved, setDayNoteSaved] = useState('');
  const [dayNoteSaving, setDayNoteSaving] = useState(false);
  const [dayNoteJustSaved, setDayNoteJustSaved] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notFoundDialog, setNotFoundDialog] = useState<{ barcode?: string } | null>(null);
  const [createFoodOpen, setCreateFoodOpen] = useState(false);
  const [createBarcode, setCreateBarcode] = useState<string | undefined>();
  const [highlightMeal, setHighlightMeal] = useState<MealType | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const notFoundChoiceRef = useRef<'add' | 'back' | null>(null);
  const mealRefs = useRef<Partial<Record<MealType, HTMLDivElement | null>>>({});
  const scrolledMealRef = useRef<string | null>(null);

  const dateStr = toLocalDateStr(selectedDate);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, analysisRes, noteRes] = await Promise.all([
        statsApi.day(dateStr),
        analysisApi.get(dateStr).catch(() => null),
        dayNoteApi.getByDate(dateStr).catch(() => ({ note: null })),
      ]);
      setData(summary);
      setAnalysis(analysisRes);
      const content = noteRes?.note?.content ?? '';
      setDayNoteDraft(content);
      setDayNoteSaved(content);
      setDayNoteJustSaved(false);
    } catch {}
    setLoading(false);
  }, [dateStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (loading && !data) return;
    const params = new URLSearchParams(location.search);
    const mealParam = params.get('meal') as MealType | null;
    const fromQuery = mealParam && VALID_MEALS.includes(mealParam) ? mealParam : null;
    const target = fromQuery ?? getNearestMealType();
    const key = fromQuery ? `${dateStr}:${fromQuery}` : `${dateStr}:auto:${target}`;
    if (scrolledMealRef.current === key) return;
    scrolledMealRef.current = key;

    const el = mealRefs.current[target];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    // Brief pulse without a second outer frame (BentoCard already has a border).
    setHighlightMeal(target);
    const timer = window.setTimeout(() => setHighlightMeal(null), 1600);
    return () => {
      window.clearTimeout(timer);
      setHighlightMeal(null);
    };
  }, [location.search, loading, data, dateStr]);

  useEffect(() => {
    const st = location.state as {
      openAddFood?: boolean;
      prefillBarcode?: string;
      productNotFound?: boolean;
    } | null;
    if (!st) return;

    if (st.productNotFound) {
      setMealForAdd('SNACK');
      setNotFoundDialog({ barcode: st.prefillBarcode });
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    if (!st.openAddFood) return;
    setMealForAdd('SNACK');
    setPrefillBarcode(st.prefillBarcode);
    setManualOpen(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const dateTitle = selectedDate.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const totals = data?.totals ?? { kcal: 0 };
  const dailyKcalGoal = data?.goals?.dailyKcalGoal ?? 2200;
  const meals: MealType[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'];
  const labels: Record<MealType, string> = {
    BREAKFAST: t('food.breakfast'),
    TIZORAI: t('food.tizorai'),
    LUNCH: t('food.lunch'),
    UZSONNA: t('food.uzsonna'),
    DINNER: t('food.dinner'),
    SNACK: t('food.snack'),
  };
  const fmt = (n: number) => Math.round(n * 10) / 10;
  const hasLogs = (data?.logs?.length ?? 0) > 0 || meals.some((m) => (data?.byMealType?.[m]?.length ?? 0) > 0);
  const remaining = analysis?.remaining ?? 5;
  const canGenerate = hasLogs && remaining > 0 && !analysisLoading;
  const dayNoteDirty = dayNoteDraft !== dayNoteSaved;
  const canSaveDayNote = dayNoteDirty && !dayNoteSaving;

  const handleSaveDayNote = async () => {
    if (!canSaveDayNote) return;
    setDayNoteSaving(true);
    try {
      const res = await dayNoteApi.save(dateStr, dayNoteDraft);
      const content = res.note?.content ?? '';
      setDayNoteDraft(content);
      setDayNoteSaved(content);
      setDayNoteJustSaved(true);
      window.setTimeout(() => setDayNoteJustSaved(false), 2000);
    } catch (e: any) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e?.message || t('foodLibraryScreen.dayNoteError', 'A megjegyzés mentése sikertelen.');
      setDialog({
        mode: 'alert',
        title: t('foodLibraryScreen.dayNote', 'Megjegyzés'),
        message: msg,
      });
    } finally {
      setDayNoteSaving(false);
    }
  };

  const runGenerate = async () => {
    setAnalysisLoading(true);
    try {
      const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';
      setAnalysis(await analysisApi.generate(dateStr, locale));
    } catch (e: any) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e?.message || t('foodLibraryScreen.analysisError', 'Az elemzés sikertelen.');
      setDialog({
        mode: 'alert',
        title: t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés'),
        message: msg,
      });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleGenerate = () => {
    if (!hasLogs) {
      setDialog({
        mode: 'alert',
        title: t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés'),
        message: t('foodLibraryScreen.noFoodForAnalysis', 'Nincs rögzített étel erre a napra.'),
      });
      return;
    }
    if (remaining <= 0) {
      setDialog({
        mode: 'alert',
        title: t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés'),
        message: t('foodLibraryScreen.analysisLimit', 'Ma már 5 elemzést kértél.'),
      });
      return;
    }
    if (analysis?.content) {
      setDialog({
        mode: 'confirm',
        title: t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés'),
        message: t(
          'foodLibraryScreen.analysisOverwriteConfirm',
          'Figyelem: az új elemzés felülírja az előzőt. Folytatod?',
        ),
        onConfirm: () => {
          void runGenerate();
        },
      });
      return;
    }
    void runGenerate();
  };

  return (
    <div className={`${styles.screen} page-scroll`}>
      <header className={styles.header}>
        <div className={styles.avatar}>
          <UserAvatar avatarKey={avatarKey} size={40} />
        </div>
        <h1 className={styles.headerTitle}>{t('foodLibrary')}</h1>
        <button type="button" className={styles.calBtn} onClick={() => navigate('/date-picker')}>
          <span className={styles.calShadow} />
          <span className={styles.calInner}>
            <IconCalendarToday size={20} color={Colors.dashboard.stroke} />
          </span>
        </button>
      </header>

      <div className={styles.summary}>
        <div>
          <div className={styles.todayTitle}>{dateTitle}</div>
          <div className={styles.todaySubtitle}>{Math.round(totals.kcal)} kcal</div>
        </div>
        <div className={styles.fireOuter}>
          <span className={styles.fireShadow} />
          <span className={styles.fireInner}>
            <IconLocalFire size={24} color={Colors.dashboard.stroke} />
          </span>
        </div>
      </div>

      <div className={styles.content}>
        {loading && !data ? (
          <div className={styles.center}>
            <div className="spinner" />
          </div>
        ) : (
          <>
          {meals.map((meal) => {
            const logs = data?.byMealType?.[meal] ?? [];
            const mealTotals = logs.reduce(
              (acc: { kcal: number; protein: number; carbs: number; fat: number }, l: any) => ({
                kcal: acc.kcal + (l.kcal ?? 0),
                protein: acc.protein + (l.protein ?? 0),
                carbs: acc.carbs + (l.carbs ?? 0),
                fat: acc.fat + (l.fat ?? 0),
              }),
              { kcal: 0, protein: 0, carbs: 0, fat: 0 },
            );
            const meta = MEAL_META[meal];
            const MealIcon = meta.Icon;
            const goal = mealKcalGoal(dailyKcalGoal, meal);
            const goalPct = goal > 0 ? Math.min(mealTotals.kcal / goal, 1) : 0;
            return (
              <div
                key={meal}
                ref={(el) => {
                  mealRefs.current[meal] = el;
                }}
                className={highlightMeal === meal ? styles.mealHighlight : undefined}
              >
              <BentoCard backgroundColor={Colors.dashboard.card} padding={16}>
                <div className={styles.mealHead}>
                  <div className={styles.mealTitleRow}>
                    <span className={styles.iconCircle} style={{ background: meta.bg }}>
                      <MealIcon size={28} color={Colors.dashboard.stroke} />
                    </span>
                    <div className={styles.mealTitleBlock}>
                      <h2 className={styles.mealTitle}>{labels[meal]}</h2>
                      <div className={styles.mealSummaryMacros}>
                        F {fmt(mealTotals.protein)}g · Sz {fmt(mealTotals.carbs)}g · Zs {fmt(mealTotals.fat)}g
                      </div>
                    </div>
                  </div>
                  <div className={styles.mealGoalBlock}>
                    <span className={`${styles.kcalBadge} ${logs.length === 0 ? styles.kcalEmpty : ''}`}>
                      {goal > 0
                        ? t('foodLibraryScreen.mealGoalOf', {
                            consumed: Math.round(mealTotals.kcal),
                            goal,
                          })
                        : `${Math.round(mealTotals.kcal)} kcal`}
                    </span>
                    {goal > 0 && (
                      <div className={styles.mealGoalTrack} aria-hidden>
                        <div
                          className={styles.mealGoalFill}
                          style={{ width: `${goalPct * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {groupDiaryLogs(logs).map((entry) => {
                  if (entry.kind === 'single') {
                    const log = entry.log;
                    const brand = distinctBrand(log.foodName, log.brand);
                    return (
                      <button
                        key={log.id}
                        type="button"
                        className={styles.mealItem}
                        onClick={() => setSelectedLog(log as DailyLogItem)}
                      >
                        <div className={styles.itemLeft}>
                          <div className={styles.itemName}>{log.foodName}</div>
                          {brand ? <div className={styles.itemBrand}>{brand}</div> : null}
                          <div className={styles.itemMeta}>{Math.round(log.amount ?? 100)}g</div>
                        </div>
                        <div className={styles.itemRight}>
                          <div className={styles.itemKcal}>{Math.round(log.kcal ?? 0)} kcal</div>
                          <div className={styles.itemMacros}>
                            F {fmt(log.protein ?? 0)} · Sz {fmt(log.carbs ?? 0)} · Zs {fmt(log.fat ?? 0)}
                          </div>
                        </div>
                      </button>
                    );
                  }

                  const open = !!expandedGroups[entry.logGroupId];
                  return (
                    <div key={entry.logGroupId} className={styles.logGroup}>
                      <button
                        type="button"
                        className={styles.mealItem}
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [entry.logGroupId]: !prev[entry.logGroupId],
                          }))
                        }
                      >
                        <div className={styles.itemLeft}>
                          <div className={styles.itemName}>{entry.title}</div>
                          <div className={styles.itemMeta}>
                            {t('food.logGroupParts', { count: entry.logs.length })} ·{' '}
                            {Math.round(entry.totals.amount)}g
                          </div>
                        </div>
                        <div className={styles.itemRight}>
                          <div className={styles.itemKcal}>{Math.round(entry.totals.kcal)} kcal</div>
                          <div className={styles.itemMacros}>
                            F {fmt(entry.totals.protein)} · Sz {fmt(entry.totals.carbs)} · Zs{' '}
                            {fmt(entry.totals.fat)}
                          </div>
                        </div>
                      </button>
                      {open && (
                        <div className={styles.logGroupBody}>
                          {entry.logs.map((log) => (
                            <button
                              key={log.id}
                              type="button"
                              className={styles.mealItemNested}
                              onClick={() => setSelectedLog(log as DailyLogItem)}
                            >
                              <div className={styles.itemLeft}>
                                <div className={styles.itemName}>{log.foodName}</div>
                                <div className={styles.itemMeta}>
                                  {Math.round(log.amount ?? 100)}g
                                </div>
                              </div>
                              <div className={styles.itemRight}>
                                <div className={styles.itemKcal}>
                                  {Math.round(log.kcal ?? 0)} kcal
                                </div>
                              </div>
                            </button>
                          ))}
                          <button
                            type="button"
                            className={styles.groupDeleteBtn}
                            onClick={() => {
                              setDialog({
                                mode: 'confirm',
                                title: t('food.deleteLogGroupTitle'),
                                message: t('food.deleteLogGroupMessage'),
                                onConfirm: () => {
                                  void logApi
                                    .deleteGroup(entry.logGroupId)
                                    .then(() => fetchData())
                                    .catch(() => {});
                                },
                              });
                            }}
                          >
                            {t('food.deleteLogGroup')}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => {
                      setMealForAdd(meal);
                      setManualOpen(true);
                    }}
                  >
                    <span className={styles.btnShadow} />
                    <span className={styles.addFace}>
                      <IconAdd size={18} color={Colors.dashboard.stroke} /> {t('common.add')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.aiAddBtn}
                    aria-label={t('aiRecognize.entryTitle')}
                    onClick={() =>
                      navigate(`/ai-recognize?mealType=${meal}`, {
                        state: { returnPath: '/food-library' },
                      })
                    }
                  >
                    <span className={styles.btnShadow} />
                    <span className={styles.aiAddFace}>
                      <IconBrain size={18} color={Colors.dashboard.stroke} />
                      <IconAdd size={12} color={Colors.dashboard.stroke} />
                    </span>
                  </button>
                </div>
              </BentoCard>
              </div>
            );
          })}

          <BentoCard backgroundColor={Colors.dashboard.card} padding={16}>
            <div className={styles.mealHead}>
              <div className={styles.mealTitleRow}>
                <span className={styles.iconCircle} style={{ background: Colors.dashboard.secondaryContainer }}>
                  <IconNoteOutline size={24} color={Colors.dashboard.stroke} />
                </span>
                <div className={styles.mealTitleBlock}>
                  <h2 className={styles.mealTitle}>{t('foodLibraryScreen.dayNote', 'Megjegyzés')}</h2>
                  <div className={styles.mealSummaryMacros}>
                    {t(
                      'foodLibraryScreen.dayNoteHint',
                      'Tünetek, közérzet — később összevetheted az aznapi étkezésekkel',
                    )}
                  </div>
                </div>
              </div>
            </div>

            <textarea
              className={styles.dayNoteTextarea}
              value={dayNoteDraft}
              onChange={(e) => {
                setDayNoteDraft(e.target.value);
                setDayNoteJustSaved(false);
              }}
              placeholder={t(
                'foodLibraryScreen.dayNotePlaceholder',
                'Pl. fáj a hasam, puffadás, fejfájás…',
              )}
              maxLength={2000}
              rows={4}
              aria-label={t('foodLibraryScreen.dayNote', 'Megjegyzés')}
            />

            <button
              type="button"
              className={styles.analysisBtn}
              onClick={handleSaveDayNote}
              disabled={!canSaveDayNote}
            >
              <span className={styles.btnShadow} />
              <span className={styles.analysisBtnFace}>
                {dayNoteSaving
                  ? t('common.loading', 'Betöltés...')
                  : dayNoteJustSaved && !dayNoteDirty
                    ? t('foodLibraryScreen.dayNoteSaved', 'Mentve')
                    : t('foodLibraryScreen.dayNoteSave', 'Mentés')}
              </span>
            </button>
          </BentoCard>

          <BentoCard backgroundColor={Colors.dashboard.card} padding={16}>
            <div className={styles.mealHead}>
              <div className={styles.mealTitleRow}>
                <span className={styles.iconCircle} style={{ background: Colors.dashboard.softBlue }}>
                  <IconPieChartOutline size={24} color={Colors.dashboard.stroke} />
                </span>
                <div className={styles.mealTitleBlock}>
                  <h2 className={styles.mealTitle}>{t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés')}</h2>
                  <div className={styles.mealSummaryMacros}>
                    {t('foodLibraryScreen.analysisRemaining', '{{count}} / 5 generálás maradt', {
                      count: remaining,
                    })}
                  </div>
                </div>
              </div>
            </div>

            {(() => {
              const parsed = parseAnalysisContent(analysis?.content);
              if (!parsed) {
                return (
                  <p className={styles.analysisEmpty}>
                    {t(
                      'foodLibraryScreen.analysisEmpty',
                      'Indíts elemzést, hogy az AI értékelje az aznapi étkezésedet.',
                    )}
                  </p>
                );
              }
              if (parsed.kind === 'structured') {
                return (
                  <div
                    className={styles.analysisBox}
                    role="region"
                    aria-label={t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés')}
                  >
                    <AnalysisResultView data={parsed.data} />
                  </div>
                );
              }
              return (
                <div
                  className={styles.analysisBox}
                  role="region"
                  aria-label={t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés')}
                >
                  <p className={styles.analysisContent}>{parsed.text}</p>
                </div>
              );
            })()}

            <button
              type="button"
              className={styles.analysisBtn}
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              <span className={styles.btnShadow} />
              <span className={styles.analysisBtnFace}>
                {analysisLoading
                  ? t('foodLibraryScreen.analyzing', 'Elemzés folyamatban...')
                  : t('foodLibraryScreen.startAnalysis', 'Elemzés indítása')}
              </span>
            </button>
          </BentoCard>
          </>
        )}
      </div>

      <AddFoodManualModal
        visible={manualOpen}
        prefillBarcode={prefillBarcode}
        onClose={() => {
          setManualOpen(false);
          setPrefillBarcode(undefined);
        }}
        onCreated={(food) => setSelectedFood(food)}
        onOpenScanner={() => navigate('/scanner', { state: { returnPath: '/food-library' } })}
        onOpenAiRecognize={() =>
          navigate(`/ai-recognize?mealType=${mealForAdd}`, {
            state: { returnPath: '/food-library' },
          })
        }
      />
      <CreateFoodModal
        visible={createFoodOpen}
        initialBarcode={createBarcode}
        onClose={() => {
          setCreateFoodOpen(false);
          setCreateBarcode(undefined);
        }}
        onCreated={(food) => {
          setCreateFoodOpen(false);
          setCreateBarcode(undefined);
          setSelectedFood(food);
        }}
      />
      <FoodDetailModal
        food={selectedFood}
        visible={!!selectedFood}
        onClose={() => setSelectedFood(null)}
        onLogAdded={() => {
          setSelectedFood(null);
          setManualOpen(false);
          fetchData();
        }}
        logSource="MANUAL"
        initialMealType={mealForAdd}
      />
      <EditLogModal
        log={selectedLog}
        visible={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        onSaved={fetchData}
      />
      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={
          dialog?.mode === 'confirm'
            ? t('common.continue', 'Folytatás')
            : t('common.ok', 'OK')
        }
        cancelLabel={t('common.cancel', 'Mégse')}
        onConfirm={dialog?.mode === 'confirm' ? dialog.onConfirm : undefined}
        onClose={() => setDialog(null)}
        destructive={dialog?.mode === 'confirm'}
      />
      <ConfirmDialog
        visible={!!notFoundDialog}
        title={t('scannerScreen.notFoundTitle')}
        message={t('scannerScreen.notFoundMessage', {
          barcode: notFoundDialog?.barcode
            ? t('scannerScreen.notFoundBarcodeSuffix', { code: notFoundDialog.barcode })
            : '',
        })}
        confirmLabel={t('scannerScreen.addNewFood')}
        cancelLabel={t('scannerScreen.backToAddFood')}
        onConfirm={() => {
          notFoundChoiceRef.current = 'add';
        }}
        onClose={() => {
          const choice = notFoundChoiceRef.current ?? 'back';
          notFoundChoiceRef.current = null;
          const barcode = notFoundDialog?.barcode;
          setNotFoundDialog(null);
          if (choice === 'add') {
            setCreateBarcode(barcode);
            setCreateFoodOpen(true);
          } else {
            setManualOpen(true);
          }
        }}
      />
    </div>
  );
}
