import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { BentoCard } from '../components/ui/BentoCard';
import { AddFoodManualModal, FoodDetailModal, EditLogModal, distinctBrand, type DailyLogItem } from '../components/food/FoodModals';
import {
  IconAdd,
  IconCalendarToday,
  IconEdit,
  IconLocalFire,
  IconPieChartOutline,
} from '../components/ui/Icons';
import { analysisApi, statsApi, ApiError, type DailyAnalysisResult, type Food } from '../services/api';
import { useDateStore } from '../stores/dateStore';
import { useProfileStore } from '../stores/profileStore';
import { UserAvatar } from '../components/ui/AvatarPicker';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { AnalysisResultView } from '../components/food/AnalysisResult';
import { parseAnalysisContent } from '../utils/parseAnalysisContent';
import { Colors } from '../design/tokens';
import { MEAL_META, type MealType } from '../utils/mealMeta';
import styles from './FoodLibraryPage.module.css';

type DialogState =
  | null
  | { mode: 'alert'; title: string; message: string }
  | { mode: 'confirm'; title: string; message: string; onConfirm: () => void };


export default function FoodLibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedDate } = useDateStore();
  const avatarKey = useProfileStore((s) => s.avatarKey);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedLog, setSelectedLog] = useState<DailyLogItem | null>(null);
  const [mealForAdd, setMealForAdd] = useState<MealType>('SNACK');
  const [analysis, setAnalysis] = useState<DailyAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const dateStr = selectedDate.toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, analysisRes] = await Promise.all([
        statsApi.day(dateStr),
        analysisApi.get(dateStr).catch(() => null),
      ]);
      setData(summary);
      setAnalysis(analysisRes);
    } catch {}
    setLoading(false);
  }, [dateStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dateTitle = selectedDate.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const totals = data?.totals ?? { kcal: 0 };
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
            return (
              <BentoCard key={meal} backgroundColor={Colors.dashboard.card} padding={16}>
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
                  <span className={`${styles.kcalBadge} ${logs.length === 0 ? styles.kcalEmpty : ''}`}>
                    {Math.round(mealTotals.kcal)} kcal
                  </span>
                </div>

                {logs.map((log: any) => {
                  const brand = distinctBrand(log.foodName, log.brand);
                  return (
                  <button
                    key={log.id}
                    type="button"
                    className={styles.mealItem}
                    onClick={() => setSelectedLog(log)}
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
                  <button type="button" className={styles.editBtn} onClick={() => navigate('/scanner')}>
                    <span className={styles.btnShadow} />
                    <span className={styles.editFace}>
                      <IconEdit size={18} color={Colors.dashboard.stroke} />
                    </span>
                  </button>
                </div>
              </BentoCard>
            );
          })}

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
        onClose={() => setManualOpen(false)}
        onCreated={(food) => setSelectedFood(food)}
        onOpenScanner={() => navigate('/scanner')}
        onOpenAiRecognize={() =>
          navigate(`/ai-recognize?mealType=${mealForAdd}`)
        }
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
    </div>
  );
}
