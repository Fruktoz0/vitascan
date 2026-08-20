import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../ui/GlassCard';
import { IconScaleOutline } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import { getErrorMessage, profileApi, type KcalGoalSuggestion } from '../../services/api';
import styles from './KcalGoalSuggestionCard.module.css';

type Props = {
  suggestion: KcalGoalSuggestion;
  onApplied: () => void;
  onDismissed: () => void;
};

function fmtKg(n: number, lang: string): string {
  return n.toLocaleString(lang.startsWith('en') ? 'en-US' : 'hu-HU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export default function KcalGoalSuggestionCard({ suggestion, onApplied, onDismissed }: Props) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState<'apply' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggested = suggestion.suggested;
  const current = suggestion.current;
  if (!suggested) return null;

  const lang = i18n.language ?? 'hu';
  const trend = suggestion.trendWeightKg;
  const start = suggestion.startWeightKg;
  const showRange =
    trend != null && start != null && Math.abs(trend - start) >= 0.3;

  const apply = async () => {
    setBusy('apply');
    setError(null);
    try {
      await profileApi.applyKcalGoalSuggestion();
      onApplied();
    } catch (e) {
      setError(getErrorMessage(e, t('homeScreen.kcalGoalSuggestError')));
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async () => {
    setBusy('dismiss');
    setError(null);
    try {
      await profileApi.dismissKcalGoalSuggestion();
      onDismissed();
    } catch (e) {
      setError(getErrorMessage(e, t('homeScreen.kcalGoalSuggestError')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassCardSimple
      backgroundColor={Colors.dashboard.card}
      padding={16}
      customRadius={{
        borderTopLeftRadius: 22,
        borderTopRightRadius: 18,
        borderBottomRightRadius: 26,
        borderBottomLeftRadius: 16,
      }}
    >
      <div className={styles.root}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.iconCircle}>
              <span className={styles.iconShadow} />
              <span className={styles.iconInner}>
                <IconScaleOutline size={20} color={Colors.dashboard.stroke} />
              </span>
            </span>
            <h2 className={styles.title}>{t('homeScreen.kcalGoalSuggestTitle')}</h2>
          </div>
        </div>

        {showRange && trend != null && start != null ? (
          <p className={styles.lead}>
            {t('homeScreen.kcalGoalSuggestWeightRange', {
              from: fmtKg(start, lang),
              to: fmtKg(trend, lang),
            })}
          </p>
        ) : trend != null ? (
          <p className={styles.lead}>
            {t('homeScreen.kcalGoalSuggestWeightNow', { kg: fmtKg(trend, lang) })}
          </p>
        ) : null}

        {suggestion.reachedTarget ? (
          <p className={styles.note}>{t('homeScreen.kcalGoalSuggestReached')}</p>
        ) : null}

        <div className={styles.grid}>
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{t('homeScreen.kcalGoalSuggestNow')}</span>
            <span className={styles.chipValue}>
              {current ? Math.round(current.dailyKcalGoal) : '—'}
            </span>
          </div>
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{t('homeScreen.kcalGoalSuggestNew')}</span>
            <span className={styles.chipValueMint}>{Math.round(suggested.dailyKcalGoal)}</span>
          </div>
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{t('goals.dailyProtein')}</span>
            <span className={styles.chipValue}>{Math.round(suggested.dailyProteinGoal)} g</span>
          </div>
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{t('goals.dailyWater')}</span>
            <span className={styles.chipValue}>{Math.round(suggested.dailyWaterGoalMl)} ml</span>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.btnRow}>
          <button
            type="button"
            className={styles.btnWrapper}
            disabled={busy !== null}
            onClick={() => void dismiss()}
          >
            <span className={styles.btnShadow} />
            <span className={styles.btnFace}>
              {busy === 'dismiss' ? (
                <span className="spinner" style={{ width: 18, height: 18 }} />
              ) : (
                t('homeScreen.kcalGoalSuggestLater')
              )}
            </span>
          </button>
          <button
            type="button"
            className={styles.btnWrapper}
            disabled={busy !== null}
            onClick={() => void apply()}
          >
            <span className={styles.btnShadow} />
            <span className={`${styles.btnFace} ${styles.btnFacePrimary}`}>
              {busy === 'apply' ? (
                <span className="spinner" style={{ width: 18, height: 18 }} />
              ) : (
                t('homeScreen.kcalGoalSuggestApply')
              )}
            </span>
          </button>
        </div>
      </div>
    </GlassCardSimple>
  );
}
