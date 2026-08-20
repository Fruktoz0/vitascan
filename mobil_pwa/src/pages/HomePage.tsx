import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import KcalGoalSuggestionCard from '../components/food/KcalGoalSuggestionCard';
import WeeklyInsightsSheet from '../components/food/WeeklyInsightsSheet';
import StreakCard from '../components/food/StreakCard';
import FastingCard from '../components/food/FastingCard';
import MealPlanCard from '../components/food/MealPlanCard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import DoodleMascot from '../components/ui/DoodleMascot';
import { IconAddCircle, IconCalendarToday, IconShoppingBasket, IconWeight } from '../components/ui/Icons';
import { useCartStore } from '../stores/cartStore';
import { Colors } from '../design/tokens';
import {
  analysisApi,
  statsApi,
  waterApi,
  weightApi,
  fastingApi,
  profileApi,
  mealPlanApi,
  type DailyAnalysisResult,
  type FastingCurrent,
  type Food,
  type KcalGoalSuggestion,
  type MealPlanSlot,
  type WeeklyStatsResult,
} from '../services/api';
import { toLocalDateStr, useDateStore } from '../stores/dateStore';
import { useProfileStore } from '../stores/profileStore';
import { useFastingLogGuard } from '../hooks/useFastingLogGuard';
import { PLAN_MEALS } from '../utils/mealPlan';
import { doodleMoodForDay } from '../utils/doodleMood';
import { parseMealType, type MealType } from '../utils/mealMeta';
import type { MealAvgEntry } from '../utils/mealInsights';
import { parseAnalysisContent } from '../utils/parseAnalysisContent';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedDate, setDate } = useDateStore();
  const cartCount = useCartStore((s) =>
    s.lists.reduce((sum, list) => sum + list.items.filter((item) => !item.checked).length, 0),
  );
  const openCart = useCartStore((s) => s.openSheet);
  const showHomeWaterCard = useProfileStore((s) => s.showHomeWaterCard);
  const showHomeStreakCard = useProfileStore((s) => s.showHomeStreakCard);
  const showHomeFastingCard = useProfileStore((s) => s.showHomeFastingCard);
  const showHomeMealPlanCard = useProfileStore((s) => s.showHomeMealPlanCard);
  const kcalGoalFollowsWeight = useProfileStore((s) => s.kcalGoalFollowsWeight);
  const [data, setData] = useState<any>(null);
  const [water, setWater] = useState<any>(null);
  const [weight, setWeight] = useState<any>(null);
  const [fasting, setFasting] = useState<FastingCurrent | null>(null);
  const [fastingBusy, setFastingBusy] = useState(false);
  const [mealPlanSlot, setMealPlanSlot] = useState<MealPlanSlot | null>(null);
  const [mealPlanBusy, setMealPlanBusy] = useState(false);
  const [occupiedByPlan, setOccupiedByPlan] = useState<MealType[]>([]);
  const { confirmIfActive, dialog: fastingLogDialog } = useFastingLogGuard();
  const [weeklyDays, setWeeklyDays] = useState<WeeklyDay[]>([]);
  const [weekAvgKcal, setWeekAvgKcal] = useState<number | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStatsResult | null>(null);
  const [weeklyAnalysis, setWeeklyAnalysis] = useState<DailyAnalysisResult | null>(null);
  const [weeklyAnalysisLoading, setWeeklyAnalysisLoading] = useState(false);
  const [weeklySheetOpen, setWeeklySheetOpen] = useState(false);
  const [kcalGoalSuggestion, setKcalGoalSuggestion] = useState<KcalGoalSuggestion | null>(null);
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
    if (searchParams.get('cart') !== '1') return;
    openCart();
    const next = new URLSearchParams(searchParams);
    next.delete('cart');
    setSearchParams(next, { replace: true });
  }, [openCart, searchParams, setSearchParams]);

  useEffect(() => {
    const st = location.state as {
      openAddFood?: boolean;
      prefillBarcode?: string;
      productNotFound?: boolean;
      mealType?: MealType;
    } | null;
    if (!st) return;

    if (st.productNotFound) {
      setMealForAdd(parseMealType(st.mealType));
      setNotFoundDialog({ barcode: st.prefillBarcode });
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    if (!st.openAddFood) return;
    setMealForAdd(parseMealType(st.mealType));
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
      const todayStr = toLocalDateStr(new Date());
      const loadSuggestion = kcalGoalFollowsWeight && dateStr === todayStr;

      const [summary, waterData, weightData, weekly, streakData, fastingData, suggestion, planWeek] = await Promise.all([
        statsApi.day(dateStr),
        showHomeWaterCard ? waterApi.getByDate(dateStr) : Promise.resolve(null),
        weightApi.getByDate(dateStr),
        statsApi.weekly().catch(() => null),
        showHomeStreakCard ? statsApi.streak().catch(() => null) : Promise.resolve(null),
        showHomeFastingCard ? fastingApi.current().catch(() => null) : Promise.resolve(null),
        loadSuggestion ? profileApi.getKcalGoalSuggestion().catch(() => null) : Promise.resolve(null),
        showHomeMealPlanCard ? mealPlanApi.get().catch(() => null) : Promise.resolve(null),
      ]);
      setData(summary);
      setWater(waterData);
      setWeight(weightData);
      setFasting(fastingData);
      setKcalGoalSuggestion(suggestion?.show ? suggestion : null);
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
      const todaySlots = (planWeek?.slots ?? []).filter(
        (s) => s.slotDate === dateStr && s.source !== 'SKIPPED' && PLAN_MEALS.includes(s.mealType as MealType),
      );
      setOccupiedByPlan(todaySlots.map((s) => s.mealType as MealType));
      setMealPlanSlot(todaySlots.find((s) => !s.logged) ?? todaySlots[0] ?? null);
    } catch {}
    setLoading(false);
  }, [selectedDate, showHomeWaterCard, showHomeStreakCard, showHomeFastingCard, showHomeMealPlanCard, kcalGoalFollowsWeight]);

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

  const handleStartFast = async () => {
    setFastingBusy(true);
    try {
      await fastingApi.start({
        protocol: (fasting?.protocol as '16:8' | '18:6' | '20:4' | 'OMAD' | 'CUSTOM') || '16:8',
        goalMinutes: fasting?.goalMinutes,
      });
      setFasting(await fastingApi.current());
    } catch {}
    setFastingBusy(false);
  };

  const handleStopFast = async () => {
    setFastingBusy(true);
    try {
      await fastingApi.stop();
      setFasting(await fastingApi.current());
    } catch {}
    setFastingBusy(false);
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

  const doodle = doodleMoodForDay({
    isToday,
    kcal: totals.kcal ?? 0,
    goal: goals.dailyKcalGoal,
    sugar: totals.sugar,
    byMealType,
  });

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.topBar}>
        <DoodleMascot doodle={doodle} />
        <h1 className={styles.dateTitle}>{getHeaderDateText()}</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.calendarBtn}
            onClick={openCart}
            aria-label={t('cart.open')}
          >
            <span className={styles.calendarShadow} />
            <span className={styles.calendarInner}>
              <IconShoppingBasket size={20} color={Colors.dashboard.stroke} />
            </span>
            {cartCount > 0 ? (
              <span className={styles.cartBadge}>{cartCount > 99 ? '99+' : cartCount}</span>
            ) : null}
          </button>
          <button type="button" className={styles.calendarBtn} onClick={() => navigate('/date-picker')}>
            <span className={styles.calendarShadow} />
            <span className={styles.calendarInner}>
              <IconCalendarToday size={20} color={Colors.dashboard.stroke} />
            </span>
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <button
          type="button"
          className={styles.kcalCardBtn}
          onClick={() => navigate('/home/breakdown/kcal')}
          aria-label={t('homeScreen.breakdownTitleKcal')}
        >
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
        </button>

        <div className={styles.macroRow}>
          <MacroChip
            type="protein"
            value={totals.protein}
            goal={goals.dailyProteinGoal ?? 140}
            onClick={() => navigate('/home/breakdown/protein')}
          />
          <MacroChip
            type="carbs"
            value={totals.carbs}
            goal={goals.dailyCarbsGoal ?? 250}
            onClick={() => navigate('/home/breakdown/carbs')}
          />
          <MacroChip
            type="fat"
            value={totals.fat}
            goal={goals.dailyFatGoal ?? 65}
            onClick={() => navigate('/home/breakdown/fat')}
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

        {showHomeMealPlanCard ? (
          <MealPlanCard
            slot={mealPlanSlot}
            busy={mealPlanBusy}
            onOpen={() => navigate('/meal-plan')}
            onPush={(slot) => {
              void (async () => {
                setMealPlanBusy(true);
                try {
                  await confirmIfActive();
                  await mealPlanApi.logSlot(slot.id, { date: slot.slotDate, servings: slot.servings });
                  await fetchData();
                } catch {
                  /* keep card */
                } finally {
                  setMealPlanBusy(false);
                }
              })();
            }}
          />
        ) : null}

        <MealSuggestStories
          dateStr={selectedDateStr}
          isToday={isToday}
          totals={totals}
          goals={goals}
          byMealType={byMealType}
          occupiedMealTypes={showHomeMealPlanCard ? occupiedByPlan : []}
        />

        {weeklyDays.length > 0 && (
          <WeeklyKcalChart
            days={weeklyDays}
            avgKcal={weekAvgKcal ?? undefined}
            selectedDate={selectedDate}
            onSelectDate={setDate}
          />
        )}

        {isToday && kcalGoalSuggestion?.show && kcalGoalSuggestion.suggested ? (
          <KcalGoalSuggestionCard
            suggestion={kcalGoalSuggestion}
            onApplied={() => void fetchData()}
            onDismissed={() => setKcalGoalSuggestion(null)}
          />
        ) : null}

        {weeklyStats?.summary && weeklyStats.goals && (
          <WeeklyCalorieEvalCard
            summary={weeklyStats.summary}
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

        {showHomeWaterCard ? (
          <WaterProgressBar
            totalMl={water?.totalMl ?? 0}
            goalMl={water?.goalMl ?? 2500}
            onAdjust={handleAdjustWater}
            onOpenLog={() => navigate('/water')}
          />
        ) : null}

        {showHomeFastingCard ? (
          <FastingCard
            active={fasting?.active ?? null}
            protocol={fasting?.protocol ?? '16:8'}
            goalMinutes={fasting?.goalMinutes ?? 960}
            onOpen={() => navigate('/fasting')}
            onStart={() => void handleStartFast()}
            onStop={() => void handleStopFast()}
            busy={fastingBusy}
          />
        ) : null}

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

        {showHomeStreakCard ? <StreakCard streak={streak} /> : null}

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
        onOpenScanner={() =>
          navigate('/scanner', { state: { returnPath: '/home', mealType: mealForAdd } })
        }
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
        onFoodDeleted={() => {
          setSelectedFood(null);
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
      {fastingLogDialog}
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
