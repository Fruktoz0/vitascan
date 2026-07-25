import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack, IconBolt, IconBrain, IconFire, IconOpacity, IconWaterDrop } from '../components/ui/Icons';
import { IconBakeryDining, IconEggAlt } from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { getErrorMessage, profileApi } from '../services/api';
import styles from './StackPage.module.css';

type GoalType = 'LOSE' | 'MAINTAIN' | 'GAIN';

export default function GoalsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get('focus'); // protein | carbs | fat | kcal | water
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [goal, setGoal] = useState<GoalType>('MAINTAIN');
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
        if (prof?.goal === 'LOSE' || prof?.goal === 'GAIN' || prof?.goal === 'MAINTAIN') setGoal(prof.goal);
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
      { key: 'LOSE' as const, label: t('goals.lose') },
      { key: 'MAINTAIN' as const, label: t('goals.maintain') },
      { key: 'GAIN' as const, label: t('goals.gain') },
    ],
    [t],
  );

  const parsePositive = (v: string) => {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };

  const handleSave = async () => {
    const k = parsePositive(kcal);
    const p = parsePositive(protein);
    const c = parsePositive(carbs);
    const f = parsePositive(fat);
    const w = parsePositive(water);
    if (![k, p, c, f, w].every((n) => Number.isFinite(n))) {
      setDialog({ title: t('food.missingDataTitle'), message: t('goals.invalidValues') });
      return;
    }
    setSaving(true);
    try {
      await profileApi.update({
        goal,
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
    setAiBusy(true);
    try {
      const res = await profileApi.aiCalculateGoals({
        goal,
        locale: i18n.language?.startsWith('en') ? 'en' : 'hu',
      });
      const g = res.goals ?? res.profile;
      if (g?.dailyKcalGoal != null) setKcal(String(Math.round(g.dailyKcalGoal)));
      if (g?.dailyProteinGoal != null) setProtein(String(Math.round(g.dailyProteinGoal)));
      if (g?.dailyCarbsGoal != null) setCarbs(String(Math.round(g.dailyCarbsGoal)));
      if (g?.dailyFatGoal != null) setFat(String(Math.round(g.dailyFatGoal)));
      if (g?.dailyWaterGoalMl != null) setWater(String(Math.round(g.dailyWaterGoalMl)));
      if (res.profile?.goal) setGoal(res.profile.goal);
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
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('goals.screenTitle')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.content}>
        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('goals.bodyGoal')}</div>
          <div className={styles.chips}>
            {goalOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`${styles.chip} ${goal === o.key ? styles.chipActive : ''}`}
                onClick={() => setGoal(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>
            <IconFire size={16} color={Colors.dashboard.stroke} /> {t('goals.dailyKcal')}
          </div>
          <input
            ref={focus === 'kcal' ? focusRef : undefined}
            className={styles.input}
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            inputMode="numeric"
          />
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>
            <IconEggAlt size={16} color={Colors.dashboard.stroke} /> {t('goals.dailyProtein')}
          </div>
          <input
            ref={focus === 'protein' ? focusRef : undefined}
            className={styles.input}
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>
            <IconBakeryDining size={16} color={Colors.dashboard.stroke} /> {t('goals.dailyCarbs')}
          </div>
          <input
            ref={focus === 'carbs' ? focusRef : undefined}
            className={styles.input}
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>
            <IconOpacity size={16} color={Colors.dashboard.stroke} /> {t('goals.dailyFat')}
          </div>
          <input
            ref={focus === 'fat' ? focusRef : undefined}
            className={styles.input}
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>
            <IconWaterDrop size={16} color={Colors.dashboard.stroke} /> {t('goals.dailyWater')}
          </div>
          <input
            ref={focus === 'water' ? focusRef : undefined}
            className={styles.input}
            value={water}
            onChange={(e) => setWater(e.target.value)}
            inputMode="numeric"
          />
        </div>

        <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving || aiBusy}>
          {saving ? <span className="spinner" style={{ width: 22, height: 22 }} /> : t('goals.save')}
        </button>

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
              <IconBrain size={20} color={Colors.dashboard.stroke} />
              <span>{t('goals.aiCalculate')}</span>
              <IconBolt size={16} color={Colors.dashboard.nutritionIcon} />
            </>
          )}
        </button>
        <p className={styles.aiHint}>{t('goals.aiHint')}</p>
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
