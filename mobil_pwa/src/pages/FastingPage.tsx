import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack, IconBolt, IconCheck, IconChevronRight, IconEvent, IconFire, IconPieChartOutline, IconRestaurant, IconTarget, IconTimer, IconTrophy } from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import KcalRing from '../components/ui/KcalRing';
import { fastingApi, getErrorMessage, type FastingCurrent, type FastSessionDto, type FastingProtocol } from '../services/api';
import {
  FASTING_PROTOCOLS,
  formatHms,
  formatMinutesLabel,
  protocolLabelKey,
  resolveGoalMinutes,
} from '../utils/fasting';
import stack from './StackPage.module.css';
import styles from './FastingPage.module.css';

const PROTOCOL_OPTIONS: Array<{
  key: FastingProtocol;
  Icon: typeof IconTimer;
  iconColor: string;
}> = [
  { key: '16:8', Icon: IconTimer, iconColor: '#1565C0' },
  { key: '18:6', Icon: IconBolt, iconColor: '#E65100' },
  { key: '20:4', Icon: IconFire, iconColor: '#c62828' },
  { key: 'OMAD', Icon: IconRestaurant, iconColor: '#6A1B9A' },
  { key: 'CUSTOM', Icon: IconTarget, iconColor: '#2e7d32' },
];

export default function FastingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<FastingCurrent | null>(null);
  const [history, setHistory] = useState<FastSessionDto[]>([]);
  const [protocol, setProtocol] = useState<FastingProtocol>('16:8');
  const [customHours, setCustomHours] = useState('16');
  const [now, setNow] = useState(() => Date.now());
  const [dialog, setDialog] = useState<{
    kind: 'alert' | 'reset';
    title: string;
    message: string;
    confirmLabel?: string;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const [cur, hist] = await Promise.all([fastingApi.current(), fastingApi.history()]);
      setCurrent(cur);
      setHistory(hist.items);
      const p = FASTING_PROTOCOLS.includes(cur.protocol as FastingProtocol)
        ? (cur.protocol as FastingProtocol)
        : '16:8';
      setProtocol(p);
      if (p === 'CUSTOM') setCustomHours(String(Math.round((cur.goalMinutes / 60) * 10) / 10));
    } catch (e) {
      setDialog({
        kind: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fasting.loadFailed')),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const customMinutes = useMemo(() => {
    const n = Number(String(customHours).replace(',', '.'));
    if (!Number.isFinite(n)) return 960;
    return resolveGoalMinutes('CUSTOM', Math.round(n * 60));
  }, [customHours]);

  const goalMinutes = protocol === 'CUSTOM' ? customMinutes : resolveGoalMinutes(protocol);

  const active = current?.active ?? null;
  const elapsedMs = active ? now - new Date(active.startedAt).getTime() : 0;
  const goalMs = (active?.goalMinutes ?? goalMinutes) * 60_000;
  const reached = active != null && elapsedMs >= goalMs;

  const handleStart = async (source: 'MANUAL' | 'FROM_LAST_MEAL') => {
    setBusy(true);
    try {
      await fastingApi.start({
        protocol,
        goalMinutes: protocol === 'CUSTOM' ? customMinutes : undefined,
        source,
      });
      await load();
    } catch (e) {
      setDialog({
        kind: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fasting.startFailed')),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await fastingApi.stop();
      await load();
    } catch (e) {
      setDialog({
        kind: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fasting.stopFailed')),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await fastingApi.delete(active.id);
      await load();
    } catch (e) {
      setDialog({
        kind: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fasting.resetFailed')),
      });
    } finally {
      setBusy(false);
    }
  };

  const persistGoal = async (nextProtocol: FastingProtocol, hoursOverride?: string) => {
    const raw = Number(String(hoursOverride ?? customHours).replace(',', '.'));
    const minutes =
      nextProtocol === 'CUSTOM'
        ? resolveGoalMinutes('CUSTOM', Number.isFinite(raw) ? Math.round(raw * 60) : 960)
        : resolveGoalMinutes(nextProtocol);
    setBusy(true);
    try {
      const cur = await fastingApi.setGoal({ protocol: nextProtocol, goalMinutes: minutes });
      setCurrent(cur);
    } catch (e) {
      setDialog({
        kind: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fasting.goalSaveFailed')),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleProtocol = (key: FastingProtocol) => {
    setProtocol(key);
    void persistGoal(key);
  };

  const locale = i18n.language === 'hu' ? 'hu-HU' : 'en-US';

  const stats = useMemo(() => {
    const completed = history.length;
    const hitGoal = history.filter((item) => item.elapsedMinutes >= item.goalMinutes).length;
    const longestMin = Math.max(
      0,
      ...history.map((item) => item.elapsedMinutes),
      active ? Math.floor(elapsedMs / 60_000) : 0,
    );
    const avgMin =
      completed > 0
        ? Math.round(history.reduce((sum, item) => sum + item.elapsedMinutes, 0) / completed)
        : 0;
    return {
      completed,
      hitGoal,
      longest: formatMinutesLabel(longestMin, i18n.language),
      average: formatMinutesLabel(avgMin, i18n.language),
    };
  }, [history, active, elapsedMs, i18n.language]);

  return (
    <div className={`${stack.screen} page-scroll no-tab`}>
      <header className={stack.header}>
        <button type="button" className={stack.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('fasting.title')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={stack.content}>
        {loading ? (
          <p className={stack.message}>{t('common.loading')}</p>
        ) : (
          <>
            <div className={styles.hero}>
              <div className={styles.heroTop}>
                <span className={styles.heroIcon}>
                  <IconTimer size={22} color={Colors.dashboard.stroke} />
                </span>
                <div>
                  <div className={styles.heroTitle}>
                    {active
                      ? reached
                        ? t('fasting.goalReached')
                        : t('fasting.running')
                      : t('fasting.idleTitle')}
                  </div>
                  <div className={styles.heroSub}>
                    {active && reached
                      ? t('fasting.overGoal', { time: formatHms(elapsedMs - goalMs, true) })
                      : t('fasting.goalLabel', {
                          hours: Math.round((active?.goalMinutes ?? goalMinutes) / 60),
                        })}
                  </div>
                </div>
                {active ? (
                  <KcalRing consumed={elapsedMs} goal={goalMs} size={72} strokeWidth={7} showLabel={false} />
                ) : null}
              </div>
              <div className={styles.clock}>
                {active ? formatHms(elapsedMs, true) : '00:00:00'}
              </div>
              <div className={styles.goalBlock}>
                <div className={styles.goalBlockHead}>
                  <span className={styles.goalBlockTitle}>{t('fasting.protocol')}</span>
                  <span className={styles.goalBlockHint}>{t('fasting.protocolHint')}</span>
                </div>
                <div className={styles.protocolGrid}>
                  {PROTOCOL_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`${styles.protocolOption} ${protocol === o.key ? styles.protocolOptionActive : ''}`}
                      onClick={() => handleProtocol(o.key)}
                    >
                      <span className={styles.protocolIcon}>
                        <o.Icon size={18} color={o.iconColor} />
                      </span>
                      <span className={styles.protocolLabel}>{t(protocolLabelKey(o.key))}</span>
                    </button>
                  ))}
                </div>
                {protocol === 'CUSTOM' ? (
                  <label className={styles.customRow}>
                    <span>{t('fasting.customHours')}</span>
                    <input
                      className={stack.input}
                      type="number"
                      min={1}
                      max={23}
                      step={0.5}
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value)}
                      onBlur={() => void persistGoal('CUSTOM')}
                    />
                  </label>
                ) : null}
              </div>
            </div>

            {active ? (
              <>
                <button type="button" className={stack.saveBtn} disabled={busy} onClick={() => void handleStop()}>
                  {t('fasting.stop')}
                </button>
                <button
                  type="button"
                  className={stack.aiBtn}
                  disabled={busy}
                  onClick={() =>
                    setDialog({
                      kind: 'reset',
                      title: t('fasting.resetTitle'),
                      message: t('fasting.resetMessage'),
                      confirmLabel: t('fasting.reset'),
                    })
                  }
                >
                  {t('fasting.reset')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={stack.saveBtn}
                  disabled={busy}
                  onClick={() => void handleStart('MANUAL')}
                >
                  {t('fasting.startNow')}
                </button>
                <button
                  type="button"
                  className={stack.aiBtn}
                  disabled={busy || !current?.lastMealAt}
                  onClick={() => void handleStart('FROM_LAST_MEAL')}
                >
                  {t('fasting.startFromMeal')}
                </button>
                {!current?.lastMealAt ? (
                  <p className={stack.message}>{t('fasting.startFromMealHint')}</p>
                ) : null}
              </>
            )}

            <p className={styles.disclaimer}>{t('fasting.disclaimer')}</p>

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={`${styles.cardHeadIcon} ${styles.iconMint}`}>
                  <IconPieChartOutline size={18} color={Colors.dashboard.stroke} />
                </span>
                <div>
                  <h2 className={styles.cardTitle}>{t('fasting.stats')}</h2>
                  <p className={styles.cardSub}>{t('fasting.statsHint')}</p>
                </div>
              </div>
              <div className={styles.statGrid}>
                <div className={styles.statChip}>
                  <span className={styles.statIcon} style={{ background: '#e8f5e9' }}>
                    <IconCheck size={16} color="#2e7d32" />
                  </span>
                  <div>
                    <span className={styles.statLabel}>{t('fasting.statCompleted')}</span>
                    <span className={styles.statValue}>{stats.completed}</span>
                  </div>
                </div>
                <div className={styles.statChip}>
                  <span className={styles.statIcon} style={{ background: '#fff3e0' }}>
                    <IconTrophy size={16} color="#E65100" />
                  </span>
                  <div>
                    <span className={styles.statLabel}>{t('fasting.statHitGoal')}</span>
                    <span className={styles.statValue}>
                      {stats.completed === 0 ? '—' : `${stats.hitGoal}/${stats.completed}`}
                    </span>
                  </div>
                </div>
                <div className={styles.statChip}>
                  <span className={styles.statIcon} style={{ background: '#e3f2fd' }}>
                    <IconTimer size={16} color="#1565C0" />
                  </span>
                  <div>
                    <span className={styles.statLabel}>{t('fasting.statLongest')}</span>
                    <span className={styles.statValue}>{stats.longest}</span>
                  </div>
                </div>
                <div className={styles.statChip}>
                  <span className={styles.statIcon} style={{ background: '#f3e5f5' }}>
                    <IconBolt size={16} color="#6A1B9A" />
                  </span>
                  <div>
                    <span className={styles.statLabel}>{t('fasting.statAverage')}</span>
                    <span className={styles.statValue}>{stats.average}</span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`${styles.card} ${styles.cardHit}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate('/fasting/history')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/fasting/history');
                }
              }}
            >
              <div className={styles.cardHead}>
                <span className={`${styles.cardHeadIcon} ${styles.iconLavender}`}>
                  <IconEvent size={18} color={Colors.dashboard.stroke} />
                </span>
                <div className={styles.cardHeadText}>
                  <h2 className={styles.cardTitle}>{t('fasting.history')}</h2>
                  <p className={styles.cardSub}>{t('fasting.historyPreviewHint')}</p>
                </div>
                <IconChevronRight size={20} color={Colors.dashboard.stroke} />
              </div>
              {history.length === 0 ? (
                <p className={styles.empty}>{t('fasting.historyEmpty')}</p>
              ) : (
                <ul className={styles.history}>
                  {history.slice(0, 2).map((item) => {
                    const started = new Date(item.startedAt);
                    return (
                      <li key={item.id} className={styles.historyRow}>
                        <div>
                          <div className={styles.historyTitle}>{t(protocolLabelKey(item.protocol))}</div>
                          <div className={styles.historySub}>
                            {started.toLocaleString(locale, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        <div className={styles.historyDur}>
                          {formatMinutesLabel(item.elapsedMinutes, i18n.language)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {history.length > 2 ? (
                <p className={styles.historyMore}>{t('fasting.historyMore', { count: history.length - 2 })}</p>
              ) : null}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.confirmLabel}
        destructive={dialog?.kind === 'reset'}
        onConfirm={dialog?.kind === 'reset' ? () => void handleReset() : undefined}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
