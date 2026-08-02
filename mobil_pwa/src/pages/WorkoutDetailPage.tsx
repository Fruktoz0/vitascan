import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconArrowBack,
  IconBolt,
  IconDirectionsWalk,
  IconFire,
  IconFitnessCenter,
  IconHeart,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { fitnessApi, getErrorMessage, type FitnessWorkout } from '../services/api';
import styles from './FitnessPage.module.css';

type MetricRow = {
  key: string;
  label: string;
  value: string;
  unit?: string;
};

function formatPace(pace: number): string {
  if (!Number.isFinite(pace) || pace <= 0) return String(pace);
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function row(
  key: string,
  label: string,
  raw: number | null | undefined,
  format: (n: number) => string,
  unit?: string,
): MetricRow | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return { key, label, value: format(raw), unit };
}

export default function WorkoutDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'hu-HU';

  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<FitnessWorkout | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fitnessApi.getWorkout(id);
      setWorkout(res.workout);
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.loadError')),
      });
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (!id) {
      navigate('/fitness', { replace: true });
      return;
    }
    load();
  }, [id, load, navigate]);

  const timeRange = useMemo(() => {
    if (!workout) return '';
    const start = new Date(workout.startedAt);
    const end = workout.endedAt ? new Date(workout.endedAt) : null;
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    const dateOpts: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    const datePart = start.toLocaleDateString(locale, dateOpts);
    const startT = start.toLocaleTimeString(locale, opts);
    const endT = end ? end.toLocaleTimeString(locale, opts) : null;
    return endT ? `${datePart} · ${startT} – ${endT}` : `${datePart} · ${startT}`;
  }, [workout, locale]);

  const hrStats = useMemo(() => {
    if (!workout) return null;
    let min = workout.minHeartrate;
    let avg = workout.avgHeartrate;
    let max = workout.maxHeartrate;
    const series = workout.hrSeries;
    if (series && series.length > 0) {
      const bpms = series.map((p) => p.bpm);
      if (min == null) min = Math.min(...bpms);
      if (max == null) max = Math.max(...bpms);
      if (avg == null) avg = Math.round(bpms.reduce((s, n) => s + n, 0) / bpms.length);
    }
    if (avg == null && min == null && max == null) return null;
    return { min, avg, max };
  }, [workout]);

  const hrChart = useMemo(() => {
    const series = workout?.hrSeries;
    if (!series || series.length < 2) return null;
    const w = 320;
    const h = 120;
    const pad = 8;
    const bpms = series.map((p) => p.bpm);
    const t0 = series[0].tMs;
    const t1 = series[series.length - 1].tMs;
    const span = Math.max(1, t1 - t0);
    const lo = Math.min(...bpms);
    const hi = Math.max(...bpms);
    const range = Math.max(1, hi - lo);
    const coords = series.map((p) => {
      const x = pad + ((p.tMs - t0) / span) * (w - pad * 2);
      const y = h - pad - ((p.bpm - lo) / range) * (h - pad * 2);
      return { x, y };
    });
    const line = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${h - pad} L${coords[0].x.toFixed(1)},${h - pad} Z`;
    const avg =
      workout?.avgHeartrate ??
      Math.round(bpms.reduce((s, n) => s + n, 0) / bpms.length);
    return { w, h, line, area, lo, hi, avg };
  }, [workout]);

  const movementRows = useMemo(() => {
    if (!workout) return [];
    return [
      row('distance', t('fitness.metricDistance'), workout.distanceKm, (n) => n.toFixed(2), 'km'),
      row('steps', t('fitness.metricSteps'), workout.steps, (n) => n.toLocaleString(locale)),
      row('pace', t('fitness.metricPace'), workout.pace, formatPace, 'min/km'),
      row(
        'speedAvg',
        t('fitness.metricSpeedAvg'),
        workout.speedAvg,
        (n) => (n < 30 ? (n * 3.6).toFixed(1) : n.toFixed(1)),
        'km/h',
      ),
      row(
        'speedMax',
        t('fitness.metricSpeedMax'),
        workout.speedMax,
        (n) => (n < 30 ? (n * 3.6).toFixed(1) : n.toFixed(1)),
        'km/h',
      ),
      row('elevGain', t('fitness.metricElevGain'), workout.elevationGain, (n) => String(Math.round(n)), 'm'),
      row('elevMin', t('fitness.metricElevMin'), workout.elevationMin, (n) => String(Math.round(n)), 'm'),
      row('elevMax', t('fitness.metricElevMax'), workout.elevationMax, (n) => String(Math.round(n)), 'm'),
      row('floors', t('fitness.metricFloors'), workout.floorsClimbed, (n) => String(n)),
    ].filter(Boolean) as MetricRow[];
  }, [workout, t, locale]);

  const otherRows = useMemo(() => {
    if (!workout) return [];
    return [
      row('vo2', t('fitness.metricVo2'), workout.vo2Max, (n) => String(n), 'ml/kg/min'),
      row('resp', t('fitness.metricResp'), workout.respiratoryRate, (n) => n.toFixed(1), '/min'),
      row('mindful', t('fitness.metricMindful'), workout.mindfulMinutes, (n) => String(n), 'min'),
      row('stress', t('fitness.metricStress'), workout.avgStressLevel, (n) => String(n)),
      row('restHr', t('fitness.metricRestHr'), workout.restingHeartrate, (n) => String(n), 'bpm'),
    ].filter(Boolean) as MetricRow[];
  }, [workout, t]);

  const handleDelete = async () => {
    if (!workout) return;
    setDeleting(true);
    try {
      await fitnessApi.deleteWorkout(workout.id);
      navigate('/fitness', { replace: true });
    } catch (e) {
      setConfirmDelete(false);
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.deleteWorkoutError')),
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className={`${styles.screen} page-scroll`}>
        <div className={styles.loadingCenter}>{t('common.loading')}</div>
      </div>
    );
  }

  if (!workout) {
    return (
      <div className={`${styles.screen} page-scroll`}>
        <header className={styles.detailTopBar}>
          <button type="button" className={styles.backBtn} onClick={() => navigate('/fitness')}>
            <IconArrowBack size={22} color={Colors.dashboard.stroke} />
          </button>
          <h1 className={styles.pageTitle}>{t('fitness.workoutDetail')}</h1>
        </header>
        <p className={styles.emptyText} style={{ padding: '20px' }}>
          {t('fitness.workoutNotFound')}
        </p>
        <ConfirmDialog
          visible={!!dialog}
          title={dialog?.title ?? ''}
          message={dialog?.message ?? ''}
          confirmLabel={t('common.ok')}
          onClose={() => setDialog(null)}
        />
      </div>
    );
  }

  const displayName = workout.title?.trim() || workout.activityType;
  const hrBarPct =
    hrStats?.min != null &&
    hrStats?.avg != null &&
    hrStats?.max != null &&
    hrStats.max > hrStats.min
      ? Math.min(100, Math.max(0, ((hrStats.avg - hrStats.min) / (hrStats.max - hrStats.min)) * 100))
      : null;

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />

      <header className={styles.detailTopBar}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/fitness')}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1 className={styles.pageTitle}>{t('fitness.workoutDetail')}</h1>
      </header>

      <div className={styles.content}>
        {/* Hero */}
        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.cardInner}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionIcon} style={{ background: '#FFE0B2' }}>
                <IconFitnessCenter size={22} color={Colors.dashboard.stroke} />
              </span>
              <div className={styles.sectionHeadGrow}>
                <div className={styles.sectionTitle}>{displayName}</div>
                <div className={styles.sectionSub}>
                  {workout.title && workout.title !== workout.activityType
                    ? workout.activityType
                    : timeRange}
                </div>
                {workout.title && workout.title !== workout.activityType ? (
                  <div className={styles.sectionSub}>{timeRange}</div>
                ) : null}
              </div>
            </div>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <IconBolt size={18} color={Colors.dashboard.stroke} />
                <span className={styles.heroStatValue}>{Math.round(workout.durationMin)}</span>
                <span className={styles.heroStatUnit}>min</span>
              </div>
              {workout.activeEnergyKcal != null && (
                <div className={styles.heroStat}>
                  <IconFire size={18} color={Colors.dashboard.stroke} />
                  <span className={styles.heroStatValue}>
                    {Math.round(workout.activeEnergyKcal)}
                  </span>
                  <span className={styles.heroStatUnit}>kcal</span>
                </div>
              )}
              {hrStats?.avg != null && (
                <div className={styles.heroStat}>
                  <IconHeart size={18} color="#c62828" />
                  <span className={styles.heroStatValue}>{hrStats.avg}</span>
                  <span className={styles.heroStatUnit}>bpm</span>
                </div>
              )}
              {workout.distanceKm != null && (
                <div className={styles.heroStat}>
                  <IconDirectionsWalk size={18} color={Colors.dashboard.stroke} />
                  <span className={styles.heroStatValue}>{workout.distanceKm.toFixed(1)}</span>
                  <span className={styles.heroStatUnit}>km</span>
                </div>
              )}
            </div>
            <div className={styles.sourceRow}>
              <span className={styles.sourceBadge}>{workout.source}</span>
              {workout.providerType ? (
                <span className={styles.sourceBadge}>{workout.providerType}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Heart rate section */}
        {(hrStats || hrChart) && (
          <div className={styles.cardWrap}>
            <span className={styles.cardShadow} />
            <div className={`${styles.cardInner} ${styles.detailSection}`}>
              <div className={styles.detailSectionHead}>
                <span className={styles.detailSectionIcon} style={{ background: '#FFCDD2' }}>
                  <IconHeart size={18} color="#c62828" />
                </span>
                <div>
                  <div className={styles.sectionTitle}>{t('fitness.hrSection')}</div>
                  <div className={styles.sectionSub}>{t('fitness.hrSectionHint')}</div>
                </div>
              </div>

              {hrStats && (
                <div className={styles.hrBigRow}>
                  <div className={styles.hrBigCell}>
                    <div className={styles.hrBigLabel}>{t('fitness.metricAvgHr')}</div>
                    <div className={styles.hrBigValue}>
                      {hrStats.avg ?? '—'}
                      <span>bpm</span>
                    </div>
                  </div>
                  <div className={styles.hrBigCell}>
                    <div className={styles.hrBigLabel}>{t('fitness.metricMinHr')}</div>
                    <div className={styles.hrBigValue}>
                      {hrStats.min ?? '—'}
                      <span>bpm</span>
                    </div>
                  </div>
                  <div className={styles.hrBigCell}>
                    <div className={styles.hrBigLabel}>{t('fitness.metricMaxHr')}</div>
                    <div className={styles.hrBigValue}>
                      {hrStats.max ?? '—'}
                      <span>bpm</span>
                    </div>
                  </div>
                </div>
              )}

              {hrBarPct != null && hrStats?.min != null && hrStats?.max != null && (
                <div className={styles.hrTrack} style={{ marginTop: 12 }}>
                  <div className={styles.hrFill} style={{ width: `${hrBarPct}%` }} />
                  <span className={styles.hrMarker} style={{ left: `${hrBarPct}%` }} />
                </div>
              )}

              {hrChart && (
                <div className={styles.hrChartBlock}>
                  <div className={styles.sectionSub} style={{ marginBottom: 8 }}>
                    {t('fitness.hrChartHint', {
                      avg: hrChart.avg,
                      min: hrChart.lo,
                      max: hrChart.hi,
                    })}
                  </div>
                  <div className={styles.hrChartWrap}>
                    <svg
                      className={styles.hrChartSvg}
                      viewBox={`0 0 ${hrChart.w} ${hrChart.h}`}
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={t('fitness.hrChartTitle')}
                    >
                      <path d={hrChart.area} className={styles.hrChartArea} />
                      <path d={hrChart.line} className={styles.hrChartLine} fill="none" />
                    </svg>
                    <div className={styles.hrChartAxis}>
                      <span>{hrChart.hi}</span>
                      <span>{hrChart.lo}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Movement */}
        {movementRows.length > 0 && (
          <div className={styles.cardWrap}>
            <span className={styles.cardShadow} />
            <div className={`${styles.cardInner} ${styles.detailSection}`}>
              <div className={styles.detailSectionHead}>
                <span className={styles.detailSectionIcon} style={{ background: '#C8E6C9' }}>
                  <IconDirectionsWalk size={18} color={Colors.dashboard.stroke} />
                </span>
                <div>
                  <div className={styles.sectionTitle}>{t('fitness.movementSection')}</div>
                  <div className={styles.sectionSub}>{t('fitness.movementSectionHint')}</div>
                </div>
              </div>
              <ul className={styles.metricRows}>
                {movementRows.map((m) => (
                  <li key={m.key} className={styles.metricRow}>
                    <span className={styles.metricRowLabel}>{m.label}</span>
                    <span className={styles.metricRowValue}>
                      {m.value}
                      {m.unit ? <span className={styles.metricRowUnit}>{m.unit}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Other */}
        {otherRows.length > 0 && (
          <div className={styles.cardWrap}>
            <span className={styles.cardShadow} />
            <div className={`${styles.cardInner} ${styles.detailSection}`}>
              <div className={styles.detailSectionHead}>
                <span className={styles.detailSectionIcon} style={{ background: '#E8F5E9' }}>
                  <IconBolt size={18} color={Colors.dashboard.stroke} />
                </span>
                <div>
                  <div className={styles.sectionTitle}>{t('fitness.otherSection')}</div>
                  <div className={styles.sectionSub}>{t('fitness.otherSectionHint')}</div>
                </div>
              </div>
              <ul className={styles.metricRows}>
                {otherRows.map((m) => (
                  <li key={m.key} className={styles.metricRow}>
                    <span className={styles.metricRowLabel}>{m.label}</span>
                    <span className={styles.metricRowValue}>
                      {m.value}
                      {m.unit ? <span className={styles.metricRowUnit}>{m.unit}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <button
          type="button"
          className={styles.goalDelete}
          disabled={deleting}
          onClick={() => setConfirmDelete(true)}
        >
          {t('common.delete')}
        </button>
      </div>

      <ConfirmDialog
        visible={confirmDelete}
        title={t('fitness.deleteWorkoutTitle')}
        message={t('fitness.deleteWorkoutConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={t('common.ok')}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
