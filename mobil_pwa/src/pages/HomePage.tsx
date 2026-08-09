import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { GlassCardSimple } from '../components/ui/GlassCard';
import KcalRing from '../components/ui/KcalRing';
import { MacroChip } from '../components/ui/MacroBar';
import WaterProgressBar from '../components/ui/WaterProgressBar';
import {
  AddFoodManualModal,
  CreateFoodModal,
  FoodDetailModal,
} from '../components/food/FoodModals';
import MealInsightsCard from '../components/food/MealInsightsCard';
import MealSuggestStories from '../components/food/MealSuggestStories';
import WeeklyKcalChart, { type WeeklyDay } from '../components/food/WeeklyKcalChart';
import WeeklyCalorieEvalCard from '../components/food/WeeklyCalorieEvalCard';
import WeeklyInsightsSheet from '../components/food/WeeklyInsightsSheet';
import StreakCard from '../components/food/StreakCard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconAddCircle, IconCalendarToday, IconWeight } from '../components/ui/Icons';
import { Colors } from '../design/tokens';
import {
  analysisApi,
  statsApi,
  waterApi,
  weightApi,
  type DailyAnalysisResult,
  type Food,
  type WeeklyStatsResult,
} from '../services/api';
import { toLocalDateStr, useDateStore } from '../stores/dateStore';
import { useProfileStore } from '../stores/profileStore';
import { UserAvatar } from '../components/ui/AvatarPicker';
import type { MealType } from '../utils/mealMeta';
import type { MealAvgEntry } from '../utils/mealInsights';
import { parseAnalysisContent } from '../utils/parseAnalysisContent';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedDate, setDate } = useDateStore();
  const avatarKey = useProfileStore((s) => s.avatarKey);
  const [data, setData] = useState<any>(null);
  const [water, setWater] = useState<any>(null);
  const [weight, setWeight] = useState<any>(null);
  const [weeklyDays, setWeeklyDays] = useState<WeeklyDay[]>([]);
  const [weekAvgKcal, setWeekAvgKcal] = useState<number | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStatsResult | null>(null);
  const [weeklyAnalysis, setWeeklyAnalysis] = useState<DailyAnalysisResult | null>(null);
  const [weeklyAnalysisLoading, setWeeklyAnalysisLoading] = useState(false);
  const [weeklySheetOpen, setWeeklySheetOpen] = useState(false);
  const [mealAvg, setMealAvg] = useState<Record<string, MealAvgEntry> | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [prefillBarcode, setPrefillBarcode] = useState<string | undefined>();
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [mealForAdd, setMealForAdd] = useState<MealType>('SNACK');
  const [notFoundDialog, setNotFoundDialog] = useState<{ barcode?: string } | null>(null);
  const [createFoodOpen, setCreateFoodOpen] = useState(false);
  const [createBarcode, setCreateBarcode] = useState<string | undefined>();
  const notFoundChoiceRef = useRef<'add' | 'back' | null>(null);

  const openAddFood = (meal: MealType) => {
    setMealForAdd(meal);
    setPrefillBarcode(undefined);
    setManualOpen(true);
  };

  const openDiary = (meal?: MealType) => {
    navigate(meal ? `/food-library?meal=${meal}` : '/food-library');
  };

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

  const getHeaderDateText = () => {
    const today = new Date();
    const current = new Date(selectedDate);
    today.setHours(0, 0, 0, 0);
    current.setHours(0, 0, 0, 0);
    const diffDays = Math.round((current.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return t('date.today');
    if (diffDays === 1) return t('date.tomorrow');
    if (diffDays === -1) return t('date.yesterday');
    return current.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = toLocalDateStr(selectedDate);

      const [summary, waterData, weightData, weekly, streakData] = await Promise.all([
        statsApi.day(dateStr),
        waterApi.getByDate(dateStr),
        weightApi.getByDate(dateStr),
        statsApi.weekly().catch(() => null),
        statsApi.streak().catch(() => null),
      ]);
      setData(summary);
      setWater(waterData);
      setWeight(weightData);
      if (weekly?.days) {
        setWeeklyDays(weekly.days);
        setWeekAvgKcal(typeof weekly.avg?.kcal === 'number' ? weekly.avg.kcal : null);
        setMealAvg(weekly.mealAvg ?? null);
        setWeeklyStats(weekly);
        if (weekly.to) {
          setWeeklyAnalysisLoading(true);
          try {
            const wa = await analysisApi.get(weekly.to, 'weeklyNutrition').catch(() => null);
            setWeeklyAnalysis(wa);
          } finally {
            setWeeklyAnalysisLoading(false);
          }
        } else {
          setWeeklyAnalysis(null);
        }
      } else {
        setWeeklyDays([]);
        setWeekAvgKcal(null);
        setMealAvg(null);
        setWeeklyStats(null);
        setWeeklyAnalysis(null);
      }
      setStreak(typeof streakData?.streak === 'number' ? streakData.streak : 0);
    } catch {}
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdjustWater = async (ml: number) => {
    try {
      const dateStr = toLocalDateStr(selectedDate);
      setWater(await waterApi.adjust(ml, dateStr));
    } catch {}
  };

  const handleAdjustWeight = async (delta: number) => {
    try {
      const dateStr = toLocalDateStr(selectedDate);
      const base =
        typeof weight?.weightKg === 'number'
          ? weight.weightKg
          : typeof weight?.suggestedWeightKg === 'number'
            ? weight.suggestedWeightKg
            : null;
      if (base == null) return;
      const nextWeight = Math.max(20, Math.min(500, Math.round((base + delta) * 10) / 10));
      setWeight(await weightApi.setForDate(dateStr, nextWeight));
    } catch {}
  };

  if (loading && !data) {
    return (
      <div className={styles.screen}>
        <div className={styles.loadingCenter}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const totals = data?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = data?.goals ?? {
    dailyKcalGoal: 2200,
    dailyProteinGoal: 140,
    dailyCarbsGoal: 250,
    dailyFatGoal: 65,
  };
  const byMealType = data?.byMealType ?? {};
  const weightValue = typeof weight?.weightKg === 'number' ? weight.weightKg.toFixed(1) : '--';
  const todayStr = toLocalDateStr();
  const selectedDateStr = toLocalDateStr(selectedDate);
  const isToday = selectedDateStr === todayStr;

  const hasDayWeight = typeof weight?.weightKg === 'number';
  const lastMeasuredText = !hasDayWeight
    ? t('homeScreen.weightNoMeasurement')
    : isToday
      ? t('homeScreen.weightLastMeasuredToday')
      : t('homeScreen.weightMeasuredOnDay', {
          date: selectedDate.toLocaleDateString(
            i18n.language === 'hu' ? 'hu-HU' : 'en-US',
            { month: 'short', day: 'numeric' },
          ),
        });

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.topBar}>
        <div className={styles.avatar}>
          <UserAvatar avatarKey={avatarKey} size={40} />
        </div>
        <h1 className={styles.dateTitle}>{getHeaderDateText()}</h1>
        <button type="button" className={styles.calendarBtn} onClick={() => navigate('/date-picker')}>
          <span className={styles.calendarShadow} />
          <span className={styles.calendarInner}>
            <IconCalendarToday size={20} color={Colors.dashboard.stroke} />
          </span>
        </button>
      </header>

      <div className={styles.content}>
        <GlassCardSimple
          backgroundColor={Colors.dashboard.card}
          padding={24}
          customRadius={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 16,
            borderBottomRightRadius: 32,
            borderBottomLeftRadius: 16,
          }}
        >
          <div className={styles.kcalRow}>
            <div>
              <div className={styles.kcalLabel}>CALORIES</div>
              <div className={styles.kcalValue}>{Math.round(totals.kcal).toLocaleString('en-US')}</div>
              <div className={styles.kcalSub}>/ {Math.round(goals.dailyKcalGoal).toLocaleString('en-US')} kcal</div>
            </div>
            <KcalRing consumed={totals.kcal} goal={goals.dailyKcalGoal} size={100} strokeWidth={8} />
          </div>
        </GlassCardSimple>

        <div className={styles.macroRow}>
          <MacroChip
            type="protein"
            value={totals.protein}
            goal={goals.dailyProteinGoal ?? 140}
            onClick={() => navigate('/goals?focus=protein')}
          />
          <MacroChip
            type="carbs"
            value={totals.carbs}
            goal={goals.dailyCarbsGoal ?? 250}
            onClick={() => navigate('/goals?focus=carbs')}
          />
          <MacroChip
            type="fat"
            value={totals.fat}
            goal={goals.dailyFatGoal ?? 65}
            onClick={() => navigate('/goals?focus=fat')}
          />
        </div>

        <MealInsightsCard
          byMealType={byMealType}
          dayKcal={totals.kcal}
          dailyKcalGoal={goals.dailyKcalGoal}
          weekAvgKcal={weekAvgKcal}
          mealAvg={mealAvg}
          isToday={isToday}
          onOpenDiary={openDiary}
          onAddMeal={openAddFood}
        />

        <MealSuggestStories
          dateStr={selectedDateStr}
          isToday={isToday}
          totals={totals}
          goals={goals}
          byMealType={byMealType}
        />

        {weeklyDays.length > 0 && (
          <WeeklyKcalChart
            days={weeklyDays}
            avgKcal={weekAvgKcal ?? undefined}
            selectedDate={selectedDate}
            onSelectDate={setDate}
          />
        )}

        {weeklyStats?.summary && weeklyStats.goals && (
          <WeeklyCalorieEvalCard
            summary={weeklyStats.summary}
            goalKcal={weeklyStats.goals.dailyKcalGoal}
            teaser={(() => {
              const parsed = parseAnalysisContent(weeklyAnalysis?.content);
              if (parsed?.kind === 'structured') {
                return parsed.data.summary.positives[0] ?? parsed.data.suggestions[0] ?? null;
              }
              if (parsed?.kind === 'plain') return parsed.text;
              return null;
            })()}
            onOpen={() => setWeeklySheetOpen(true)}
          />
        )}

        <StreakCard streak={streak} />

        <WaterProgressBar
          totalMl={water?.totalMl ?? 0}
          goalMl={water?.goalMl ?? 2500}
          onAdjust={handleAdjustWater}
          onOpenLog={() => navigate('/water')}
        />

        <div className={styles.weightWrap}>
          <span className={styles.weightShadow} />
          <div className={styles.weightCard}>
            <button
              type="button"
              className={styles.weightTopBtn}
              onClick={() => navigate('/weight')}
            >
              <div className={styles.weightTitleRow}>
                <span className={styles.weightIcon}>
                  <IconWeight size={16} color={Colors.dashboard.stroke} />
                </span>
                <div>
                  <div className={styles.weightTitle}>{t('homeScreen.weight')}</div>
                  <div className={styles.weightSub}>{lastMeasuredText}</div>
                </div>
              </div>
              <div>
                <span className={styles.weightNum}>{weightValue}</span>
                <span className={styles.weightUnit}> kg</span>
              </div>
            </button>
            <div className={styles.weightActions}>
              <button type="button" className={styles.weightBtn} onClick={() => handleAdjustWeight(-0.1)}>
                −
              </button>
              <button type="button" className={styles.weightBtn} onClick={() => handleAdjustWeight(0.1)}>
                +
              </button>
            </div>
          </div>
        </div>

        <button type="button" className={styles.addFoodOuter} onClick={() => openAddFood('SNACK')}>
          <span className={styles.addFoodShadow} />
          <span className={styles.addFoodBtn}>
            <IconAddCircle size={24} color={Colors.dashboard.stroke} />
            <span>{t('homeScreen.addFoodCta')}</span>
          </span>
        </button>
      </div>

      <AddFoodManualModal
        visible={manualOpen}
        prefillBarcode={prefillBarcode}
        onClose={() => {
          setManualOpen(false);
          setPrefillBarcode(undefined);
        }}
        onCreated={(food) => {
          setSelectedFood(food);
        }}
        onOpenScanner={() => navigate('/scanner', { state: { returnPath: '/home' } })}
        onOpenAiRecognize={() =>
          navigate(`/ai-recognize?mealType=${mealForAdd}`, { state: { returnPath: '/home' } })
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
        logSource="SEARCH"
        initialMealType={mealForAdd}
      />
      {weeklyStats?.summary && weeklyStats.goals && (
        <WeeklyInsightsSheet
          open={weeklySheetOpen}
          weekly={weeklyStats}
          analysis={weeklyAnalysis}
          analysisLoading={weeklyAnalysisLoading}
          onClose={() => setWeeklySheetOpen(false)}
          onSelectDate={setDate}
          onAnalysisChange={setWeeklyAnalysis}
        />
      )}
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
