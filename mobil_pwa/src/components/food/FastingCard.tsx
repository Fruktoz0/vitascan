import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../ui/GlassCard';
import KcalRing from '../ui/KcalRing';
import { IconTimer } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import type { FastSessionDto } from '../../services/api';
import { formatHms } from '../../utils/fasting';
import styles from './FastingCard.module.css';

type Props = {
  active: FastSessionDto | null;
  eatingUntil: string | null;
  protocol: string;
  goalMinutes: number;
  onOpen: () => void;
  onStart: () => void;
  onStop: () => void;
  busy?: boolean;
};

export default function FastingCard({
  active,
  eatingUntil,
  protocol,
  goalMinutes,
  onOpen,
  onStart,
  onStop,
  busy,
}: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const eatingLeft = eatingUntil ? new Date(eatingUntil).getTime() - now : 0;
  const inEating = !active && eatingLeft > 0;

  let elapsedMs = 0;
  let goalMs = (active?.goalMinutes ?? goalMinutes) * 60_000;
  if (active) {
    elapsedMs = now - new Date(active.startedAt).getTime();
  }

  const reached = active != null && elapsedMs >= goalMs;
  const overMs = reached ? elapsedMs - goalMs : 0;
  const hours = Math.round((active?.goalMinutes ?? goalMinutes) / 60);

  let status = t('fasting.idleTitle');
  if (active) status = reached ? t('fasting.goalReached') : t('fasting.running');

  const timeText = active ? formatHms(elapsedMs, false) : formatHms(0, false);

  return (
    <GlassCardSimple
      backgroundColor="#f6efe6"
      padding={20}
      customRadius={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 32,
        borderBottomRightRadius: 24,
        borderBottomLeftRadius: 32,
      }}
    >
      <button type="button" className={styles.headerBtn} onClick={onOpen}>
        <div className={styles.titleRow}>
          <div className={styles.iconCircle}>
            <span className={styles.iconShadow} />
            <span className={styles.iconInner}>
              <IconTimer size={24} color={Colors.dashboard.stroke} />
            </span>
          </div>
          <div>
            <div className={styles.title}>{t('fasting.title')}</div>
            <div className={styles.goal}>{status}</div>
          </div>
        </div>
        {active ? (
          <KcalRing consumed={elapsedMs} goal={goalMs} size={56} strokeWidth={6} showLabel={false} />
        ) : null}
      </button>

      <div className={styles.timeRow}>
        <span className={styles.time}>{timeText}</span>
        <span className={styles.meta}>
          {active && reached
            ? t('fasting.overGoal', { time: formatHms(overMs, false) })
            : inEating
              ? t('fasting.eatingLeft', { time: formatHms(eatingLeft, false) })
              : t('fasting.goalLabel', { hours })}
        </span>
      </div>
      <div className={styles.protocol}>
        <span className={styles.protocolBadge}>
          <IconTimer size={14} color="#1565C0" />
        </span>
        {protocol}
      </div>

      <div className={styles.btnRow}>
        {active ? (
          <button type="button" className={styles.btnWrapper} disabled={busy} onClick={onStop}>
            <span className={styles.btnShadow} />
            <span className={styles.btnFace}>{t('fasting.stop')}</span>
          </button>
        ) : (
          <button type="button" className={styles.btnWrapper} disabled={busy} onClick={onStart}>
            <span className={styles.btnShadow} />
            <span className={styles.btnFace}>
              {inEating ? t('fasting.startNext') : t('fasting.startNow')}
            </span>
          </button>
        )}
      </div>
    </GlassCardSimple>
  );
}
