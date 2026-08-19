import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack, IconBolt, IconCheck, IconEvent, IconFire, IconPieChartOutline, IconRestaurant, IconTarget, IconTimer, IconTrophy } from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import KcalRing from '../components/ui/KcalRing';
import { fastingApi, getErrorMessage, type FastingCurrent, type FastSessionDto, type FastingProtocol } from '../services/api';
import {
  FASTING_PROTOCOLS,
  formatHms,
  resolveGoalMinutes,
} from '../utils/fasting';
import stack from './StackPage.module.css';
import styles from './FastingPage.module.css';

function protocolLabelKey(protocol: string) {
  if (protocol === '16:8') return 'fasting.protocol168';
  if (protocol === '18:6') return 'fasting.protocol186';
  if (protocol === '20:4') return 'fasting.protocol204';
  if (protocol === 'OMAD') return 'fasting.protocolOMAD';
  return 'fasting.protocolCUSTOM';
}

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
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

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
  const eatingLeft = current?.eatingUntil ? new Date(current.eatingUntil).getTime() - now : 0;
  const inEating = !active && eatingLeft > 0;
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
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fasting.stopFailed')),
      });
    } finally {
      setBusy(false);
    }
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
      longest: formatHms(longestMin * 60_000, false),
      average: formatHms(avgMin * 60_000, false),
    };
  }, [history, active, elapsedMs]);

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
                      : inEating
                        ? t('fasting.eatingWindow')
                        : t('fasting.idleTitle')}
                  </div>
                  <div className={styles.heroSub}>
                    {active && reached
                      ? t('fasting.overGoal', { time: formatHms(elapsedMs - goalMs, true) })
                      : inEating
                        ? t('fasting.eatingLeft', { time: formatHms(eatingLeft, true) })
                        : t('fasting.goalLabel', { hours: Math.round(goalMinutes / 60) })}
                  </div>
                </div>
                {active ? (
                  <KcalRing consumed={elapsedMs} goal={goalMs} size={72} strokeWidth={7} showLabel={false} />
                ) : null}
              </div>
              <div className={styles.clock}>
                {active ? formatHms(elapsedMs, true) : inEating ? formatHms(eatingLeft, true) : '00:00:00'}
              </div>
            </div>

            {!active ? (
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={`${styles.cardHeadIcon} ${styles.iconPeach}`}>
                    <IconTimer size={18} color={Colors.dashboard.stroke} />
                  </span>
                  <div>
                    <h2 className={styles.cardTitle}>{t('fasting.protocol')}</h2>
                    <p className={styles.cardSub}>{t('fasting.protocolHint')}</p>
                  </div>
                </div>
                <div className={styles.protocolGrid}>
                  {PROTOCOL_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`${styles.protocolOption} ${protocol === o.key ? styles.protocolOptionActive : ''}`}
                      onClick={() => setProtocol(o.key)}
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
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {active ? (
              <button type="button" className={stack.saveBtn} disabled={busy} onClick={() => void handleStop()}>
                {t('fasting.stop')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={stack.saveBtn}
                  disabled={busy}
                  onClick={() => void handleStart('MANUAL')}
                >
                  {inEating ? t('fasting.startNext') : t('fasting.startNow')}
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

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={`${styles.cardHeadIcon} ${styles.iconLavender}`}>
                  <IconEvent size={18} color={Colors.dashboard.stroke} />
                </span>
                <div>
                  <h2 className={styles.cardTitle}>{t('fasting.history')}</h2>
                  <p className={styles.cardSub}>{t('fasting.historyHint')}</p>
                </div>
              </div>
              {history.length === 0 ? (
                <p className={styles.empty}>{t('fasting.historyEmpty')}</p>
              ) : (
                <ul className={styles.history}>
                  {history.map((item) => {
                    const started = new Date(item.startedAt);
                    const ended = item.endedAt ? new Date(item.endedAt) : null;
                    const dur = ended ? ended.getTime() - started.getTime() : 0;
                    return (
                      <li key={item.id} className={styles.historyItem}>
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
                        <div className={styles.historyDur}>{formatHms(dur, false)}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
