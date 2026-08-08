import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconArrowBack,
  IconBolt,
  IconBrain,
  IconCheck,
  IconEggAlt,
  IconFire,
  IconFitnessCenter,
  IconGrain,
  IconOpacity,
  IconRemove,
  IconScaleOutline,
  IconTarget,
  IconWaterDrop,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { getErrorMessage, profileApi } from '../services/api';
import styles from './GoalsPage.module.css';

type GoalType = 'LOSE' | 'MAINTAIN' | 'GAIN';

const WEEK_OPTIONS = [2, 3, 4, 6, 8, 12] as const;

export default function GoalsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get('focus'); // protein | carbs | fat | kcal | water
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [goal, setGoal] = useState<GoalType>('MAINTAIN');
  const [targetWeight, setTargetWeight] = useState('');
  const [timelineEnabled, setTimelineEnabled] = useState(false);
  const [goalWeeks, setGoalWeeks] = useState<number>(4);
  const [kcal, setKcal] = useState('2000');
  const [protein, setProtein] = useState('140');
  const [carbs, setCarbs] = useState('250');
  const [fat, setFat] = useState('65');
  const [water, setWater] = useState('2000');
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);
  const focusRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    profileApi
      .getMe()
      .then((p: any) => {
        const prof = p?.profile;
        if (prof?.goal === 'LOSE' || prof?.goal === 'GAIN' || prof?.goal === 'MAINTAIN') {
          setGoal(prof.goal);
        }
        if (prof?.targetWeightKg != null) setTargetWeight(String(prof.targetWeightKg));
        if (prof?.goalWeeks != null && Number.isFinite(prof.goalWeeks)) {
          setTimelineEnabled(true);
          setGoalWeeks(prof.goalWeeks);
        }
        if (prof?.dailyKcalGoal != null) setKcal(String(Math.round(prof.dailyKcalGoal)));
        if (prof?.dailyProteinGoal != null) setProtein(String(Math.round(prof.dailyProteinGoal)));
        if (prof?.dailyCarbsGoal != null) setCarbs(String(Math.round(prof.dailyCarbsGoal)));
        if (prof?.dailyFatGoal != null) setFat(String(Math.round(prof.dailyFatGoal)));
        if (prof?.dailyWaterGoalMl != null) setWater(String(Math.round(prof.dailyWaterGoalMl)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || !focus) return;
    const tmr = setTimeout(() => focusRef.current?.focus(), 80);
    return () => clearTimeout(tmr);
  }, [loading, focus]);

  const goalOptions = useMemo(
    () => [
      {
        key: 'LOSE' as const,
        label: t('goals.lose'),
        Icon: IconRemove,
        iconColor: '#c62828',
      },
      {
        key: 'MAINTAIN' as const,
        label: t('goals.maintain'),
        Icon: IconTarget,
        iconColor: Colors.dashboard.nutritionIcon,
      },
      {
        key: 'GAIN' as const,
        label: t('goals.gain'),
        Icon: IconFitnessCenter,
        iconColor: '#2e7d32',
      },
    ],
    [t],
  );

  const parsePositive = (v: string) => {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };

  const parseTargetWeight = (): number | null | undefined => {
    const trimmed = targetWeight.trim();
    if (!trimmed) return null;
    const n = Number(String(trimmed).replace(',', '.'));
    if (!Number.isFinite(n) || n < 20 || n > 500) return undefined;
    return Math.round(n * 10) / 10;
  };

  const handleSave = async () => {
    const k = parsePositive(kcal);
    const p = parsePositive(protein);
    const c = parsePositive(carbs);
    const f = parsePositive(fat);
    const w = parsePositive(water);
    const tw = parseTargetWeight();
    if (tw === undefined) {
      setDialog({ title: t('food.missingDataTitle'), message: t('goals.invalidTargetWeight') });
      return;
    }
    if (![k, p, c, f, w].every((n) => Number.isFinite(n))) {
      setDialog({ title: t('food.missingDataTitle'), message: t('goals.invalidValues') });
      return;
    }
    setSaving(true);
    try {
      await profileApi.update({
        goal,
        targetWeightKg: tw,
        goalWeeks: timelineEnabled ? goalWeeks : null,
        dailyKcalGoal: k,
        dailyProteinGoal: p,
        dailyCarbsGoal: c,
        dailyFatGoal: f,
        dailyWaterGoalMl: Math.round(w),
      });
      setDialog({ title: t('goals.savedTitle'), message: t('goals.saved') });
    } catch (e: any) {
      setDialog({ title: t('food.errorTitle'), message: getErrorMessage(e, t('goals.saveFailed')) });
    } finally {
      setSaving(false);
    }
  };

  const handleAiCalculate = async () => {
    const tw = parseTargetWeight();
    if (tw === undefined) {
      setDialog({ title: t('food.missingDataTitle'), message: t('goals.invalidTargetWeight') });
      return;
    }
    setAiBusy(true);
    try {
      const res = await profileApi.aiCalculateGoals({
        goal,
        targetWeightKg: tw,
        goalWeeks: timelineEnabled ? goalWeeks : null,
        locale: i18n.language?.startsWith('en') ? 'en' : 'hu',
      });
      const g = res.goals ?? res.profile;
      if (g?.dailyKcalGoal != null) setKcal(String(Math.round(g.dailyKcalGoal)));
      if (g?.dailyProteinGoal != null) setProtein(String(Math.round(g.dailyProteinGoal)));
      if (g?.dailyCarbsGoal != null) setCarbs(String(Math.round(g.dailyCarbsGoal)));
      if (g?.dailyFatGoal != null) setFat(String(Math.round(g.dailyFatGoal)));
      if (g?.dailyWaterGoalMl != null) setWater(String(Math.round(g.dailyWaterGoalMl)));
      if (res.profile?.goal) setGoal(res.profile.goal);
      if (res.profile?.targetWeightKg != null) {
        setTargetWeight(String(res.profile.targetWeightKg));
      }
      if (res.profile?.goalWeeks != null) {
        setTimelineEnabled(true);
        setGoalWeeks(res.profile.goalWeeks);
      } else if (res.profile && 'goalWeeks' in res.profile && res.profile.goalWeeks == null) {
        setTimelineEnabled(false);
      }
      setDialog({ title: t('goals.aiDoneTitle'), message: t('goals.aiDone') });
    } catch (e: any) {
      setDialog({ title: t('food.errorTitle'), message: getErrorMessage(e, t('goals.aiFailed')) });
    } finally {
      setAiBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.screen}>
        <div className={styles.center}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('goals.screenTitle')}</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardHeadIcon}>
              <IconTarget size={18} color={Colors.dashboard.stroke} />
            </span>
            <div>
              <h2 className={styles.cardTitle}>{t('goals.bodyGoal')}</h2>
              <p className={styles.cardSub}>{t('goals.bodyGoalHint')}</p>
            </div>
          </div>

          <div className={styles.goalGrid}>
            {goalOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`${styles.goalOption} ${goal === o.key ? styles.goalOptionActive : ''}`}
                onClick={() => setGoal(o.key)}
              >
                <span className={styles.goalIcon}>
                  <o.Icon size={18} color={o.iconColor} />
                </span>
                <span className={styles.goalLabel}>{o.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.fieldBlock}>
            <div className={styles.fieldLabel}>
              <IconScaleOutline size={16} color={Colors.dashboard.stroke} /> {t('goals.targetWeight')}
            </div>
            <div className={styles.valueRow}>
              <input
                className={styles.valueInput}
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                inputMode="decimal"
                placeholder={t('goals.targetWeightPlaceholder')}
              />
              <span className={styles.valueUnit}>kg</span>
            </div>
            <p className={styles.fieldHint}>{t('goals.targetWeightHint')}</p>
          </div>

          <button
            type="button"
            className={styles.inlineToggle}
            onClick={() => setTimelineEnabled((v) => !v)}
          >
            <span>{t('goals.timelineToggle')}</span>
            <span className={`${styles.toggle} ${timelineEnabled ? styles.toggleOn : ''}`}>
              <span className={styles.knob} />
            </span>
          </button>

          {timelineEnabled && (
            <div className={styles.fieldBlock}>
              <div className={styles.fieldLabel}>{t('goals.timelineLabel')}</div>
              <div className={styles.weekChips}>
                {WEEK_OPTIONS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`${styles.chip} ${goalWeeks === w ? styles.chipActive : ''}`}
                    onClick={() => setGoalWeeks(w)}
                  >
                    {t('goals.weeksOption', { count: w })}
                  </button>
                ))}
              </div>
              <p className={styles.fieldHint}>{t('goals.timelineHint')}</p>
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardHeadIcon}>
              <IconFire size={18} color={Colors.dashboard.stroke} />
            </span>
            <div>
              <h2 className={styles.cardTitle}>{t('goals.dailySection')}</h2>
              <p className={styles.cardSub}>{t('goals.dailySectionHint')}</p>
            </div>
          </div>

          <div className={styles.kcalHero}>
            <div className={styles.kcalHeroLabel}>
              <IconFire size={16} color={Colors.macro.kcal} />
              {t('goals.dailyKcal')}
            </div>
            <div className={styles.kcalHeroRow}>
              <input
                ref={focus === 'kcal' ? focusRef : undefined}
                className={styles.kcalInput}
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                inputMode="numeric"
              />
              <span className={styles.valueUnit}>kcal</span>
            </div>
          </div>

          <div className={styles.macroGrid}>
            <div className={`${styles.macroCell} ${styles.macroProtein}`}>
              <div className={styles.macroHead}>
                <IconEggAlt size={14} color={Colors.dashboard.proteinFill} />
                <span className={styles.macroLabel}>{t('goals.dailyProtein')}</span>
              </div>
              <input
                ref={focus === 'protein' ? focusRef : undefined}
                className={styles.macroInput}
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                inputMode="decimal"
              />
              <span className={styles.macroUnit}>g</span>
            </div>

            <div className={`${styles.macroCell} ${styles.macroCarbs}`}>
              <div className={styles.macroHead}>
                <IconGrain size={14} color={Colors.dashboard.carbsFill} />
                <span className={styles.macroLabel}>{t('goals.dailyCarbs')}</span>
              </div>
              <input
                ref={focus === 'carbs' ? focusRef : undefined}
                className={styles.macroInput}
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                inputMode="decimal"
              />
              <span className={styles.macroUnit}>g</span>
            </div>

            <div className={`${styles.macroCell} ${styles.macroFat}`}>
              <div className={styles.macroHead}>
                <IconOpacity size={14} color={Colors.dashboard.fatFill} />
                <span className={styles.macroLabel}>{t('goals.dailyFat')}</span>
              </div>
              <input
                ref={focus === 'fat' ? focusRef : undefined}
                className={styles.macroInput}
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                inputMode="decimal"
              />
              <span className={styles.macroUnit}>g</span>
            </div>
          </div>

          <div className={styles.waterRow}>
            <span className={styles.waterIcon}>
              <IconWaterDrop size={20} color={Colors.dashboard.waterIcon} />
            </span>
            <div className={styles.waterBody}>
              <div className={styles.waterLabel}>{t('goals.dailyWater')}</div>
              <div className={styles.waterInputRow}>
                <input
                  ref={focus === 'water' ? focusRef : undefined}
                  className={styles.waterInput}
                  value={water}
                  onChange={(e) => setWater(e.target.value)}
                  inputMode="numeric"
                />
                <span className={styles.valueUnit}>ml</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.aiCard}>
          <div className={styles.aiHead}>
            <span className={styles.aiIcon}>
              <IconBrain size={22} color={Colors.dashboard.stroke} />
            </span>
            <div>
              <h2 className={styles.aiTitle}>{t('goals.aiCalculate')}</h2>
              <p className={styles.aiSub}>{t('goals.aiHint')}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.aiBtn}
            onClick={handleAiCalculate}
            disabled={saving || aiBusy}
          >
            {aiBusy ? (
              <span className="spinner" style={{ width: 22, height: 22 }} />
            ) : (
              <>
                <IconBolt size={18} color={Colors.dashboard.nutritionIcon} />
                {t('goals.aiCalculate')}
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving || aiBusy}
        >
          {saving ? (
            <span className="spinner" style={{ width: 22, height: 22 }} />
          ) : (
            <>
              <IconCheck size={20} color="#fff" />
              {t('goals.save')}
            </>
          )}
        </button>
      </div>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={t('common.ok', 'OK')}
        onClose={() => {
          const wasSaved = dialog?.title === t('goals.savedTitle');
          setDialog(null);
          if (wasSaved) navigate(-1);
        }}
      />
    </div>
  );
}
