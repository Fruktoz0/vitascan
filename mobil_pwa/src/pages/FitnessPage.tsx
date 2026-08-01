import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconAdd,
  IconBolt,
  IconBrain,
  IconCalendarToday,
  IconContentCopy,
  IconDirectionsWalk,
  IconExpandLess,
  IconExpandMore,
  IconFitnessCenter,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { AnalysisResultView } from '../components/food/AnalysisResult';
import {
  analysisApi,
  fitnessApi,
  getApiBaseUrl,
  getErrorMessage,
  logApi,
  type DailyAnalysisResult,
  type FitnessWorkout,
} from '../services/api';
import { parseAnalysisContent } from '../utils/parseAnalysisContent';
import { toLocalDateStr, useDateStore } from '../stores/dateStore';
import styles from './FitnessPage.module.css';

type DialogState =
  | null
  | { mode: 'alert'; title: string; message: string }
  | { mode: 'confirm'; title: string; message: string; onConfirm: () => void };

export default function FitnessPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { selectedDate } = useDateStore();
  const dateStr = toLocalDateStr(selectedDate);

  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<number | null>(null);
  const [workouts, setWorkouts] = useState<FitnessWorkout[]>([]);
  const [hasToken, setHasToken] = useState(false);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [activityType, setActivityType] = useState('Running');
  const [durationMin, setDurationMin] = useState('30');
  const [kcal, setKcal] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);

  const [analysis, setAnalysis] = useState<DailyAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [hasFoodLogs, setHasFoodLogs] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stepsRes, workoutsRes, tokenRes, analysisRes, logsRes] = await Promise.all([
        fitnessApi.getSteps(dateStr),
        fitnessApi.listWorkouts(dateStr),
        fitnessApi.getTokenStatus().catch(() => ({ hasToken: false })),
        analysisApi.get(dateStr).catch(() => null),
        logApi.getByDate(dateStr).catch(() => null),
      ]);
      setSteps(stepsRes.steps);
      setWorkouts(workoutsRes.workouts);
      setHasToken(tokenRes.hasToken);
      setAnalysis(analysisRes);
      const logCount = Array.isArray((logsRes as any)?.logs)
        ? (logsRes as any).logs.length
        : 0;
      setHasFoodLogs(logCount > 0);
    } catch (e) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.loadError')),
      });
    } finally {
      setLoading(false);
    }
  }, [dateStr, t]);

  useEffect(() => {
    load();
  }, [load]);

  const headerDate = useMemo(() => {
    const today = toLocalDateStr();
    if (dateStr === today) return t('date.today');
    return selectedDate.toLocaleDateString(locale === 'hu' ? 'hu-HU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [dateStr, selectedDate, t, locale]);

  const remaining = analysis?.remaining ?? 0;

  const handleGenerateToken = async () => {
    try {
      const res = await fitnessApi.createToken();
      setPlainToken(res.token);
      setHasToken(true);
      setSetupOpen(true);
    } catch (e) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.tokenError')),
      });
    }
  };

  const handleRevokeToken = () => {
    setDialog({
      mode: 'confirm',
      title: t('fitness.revokeTitle'),
      message: t('fitness.revokeConfirm'),
      onConfirm: async () => {
        setDialog(null);
        try {
          await fitnessApi.revokeToken();
          setHasToken(false);
          setPlainToken(null);
        } catch (e) {
          setDialog({
            mode: 'alert',
            title: t('food.errorTitle'),
            message: getErrorMessage(e, t('fitness.tokenError')),
          });
        }
      },
    });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setDialog({
        mode: 'alert',
        title: t('fitness.copiedTitle'),
        message: t('fitness.copied'),
      });
    } catch {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: t('fitness.copyFailed'),
      });
    }
  };

  const handleAddWorkout = async () => {
    const duration = Number(durationMin);
    if (!activityType.trim() || !Number.isFinite(duration) || duration <= 0) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: t('fitness.invalidWorkout'),
      });
      return;
    }
    setSavingWorkout(true);
    try {
      const started = new Date(selectedDate);
      started.setHours(12, 0, 0, 0);
      const energy = kcal.trim() ? Number(kcal) : null;
      await fitnessApi.createWorkout({
        activityType: activityType.trim(),
        startedAt: started.toISOString(),
        durationMin: duration,
        activeEnergyKcal: energy != null && Number.isFinite(energy) ? energy : null,
      });
      setAddOpen(false);
      setKcal('');
      await load();
    } catch (e) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.saveWorkoutError')),
      });
    } finally {
      setSavingWorkout(false);
    }
  };

  const handleDeleteWorkout = (id: string) => {
    setDialog({
      mode: 'confirm',
      title: t('fitness.deleteWorkoutTitle'),
      message: t('fitness.deleteWorkoutConfirm'),
      onConfirm: async () => {
        setDialog(null);
        try {
          await fitnessApi.deleteWorkout(id);
          await load();
        } catch (e) {
          setDialog({
            mode: 'alert',
            title: t('food.errorTitle'),
            message: getErrorMessage(e, t('fitness.deleteWorkoutError')),
          });
        }
      },
    });
  };

  const handleGenerateAnalysis = async () => {
    if (!hasFoodLogs) {
      setDialog({
        mode: 'alert',
        title: t('fitness.aiTitle'),
        message: t('fitness.aiNoFood'),
      });
      return;
    }
    if (remaining <= 0) {
      setDialog({
        mode: 'alert',
        title: t('fitness.aiTitle'),
        message: t('fitness.aiLimit'),
      });
      return;
    }
    if (analysis?.content) {
      setDialog({
        mode: 'confirm',
        title: t('fitness.aiTitle'),
        message: t('fitness.aiOverwrite'),
        onConfirm: async () => {
          setDialog(null);
          await runAnalysis();
        },
      });
      return;
    }
    await runAnalysis();
  };

  const runAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      setAnalysis(await analysisApi.generate(dateStr, locale));
    } catch (e) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.aiFailed')),
      });
    } finally {
      setAnalysisLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.screen}>
        <div className={styles.loadingCenter}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const parsed = parseAnalysisContent(analysis?.content);

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.topBar}>
        <h1 className={styles.pageTitle}>{t('fitness.title')}</h1>
        <button type="button" className={styles.calendarBtn} onClick={() => navigate('/date-picker')}>
          <span className={styles.calendarShadow} />
          <span className={styles.calendarInner}>
            <IconCalendarToday size={20} color={Colors.dashboard.stroke} />
          </span>
        </button>
      </header>
      <p className={styles.dateSub}>{headerDate}</p>

      <div className={styles.content}>
        {/* Steps */}
        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.cardInner}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionIcon} style={{ background: '#E8F5E9' }}>
                <IconDirectionsWalk size={22} color={Colors.dashboard.stroke} />
              </span>
              <div>
                <div className={styles.sectionTitle}>{t('fitness.stepsTitle')}</div>
                <div className={styles.sectionSub}>{t('fitness.stepsHint')}</div>
              </div>
            </div>
            {steps != null ? (
              <div className={styles.stepsValue}>
                {steps.toLocaleString(locale === 'hu' ? 'hu-HU' : 'en-US')}
                <span className={styles.stepsUnit}>{t('fitness.stepsUnit')}</span>
              </div>
            ) : (
              <p className={styles.emptyText}>{t('fitness.stepsEmpty')}</p>
            )}
          </div>
        </div>

        {/* Workouts */}
        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.cardInner}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionIcon} style={{ background: '#FFE0B2' }}>
                <IconFitnessCenter size={22} color={Colors.dashboard.stroke} />
              </span>
              <div className={styles.sectionHeadGrow}>
                <div className={styles.sectionTitle}>{t('fitness.workoutsTitle')}</div>
                <div className={styles.sectionSub}>{t('fitness.workoutsHint')}</div>
              </div>
              <button type="button" className={styles.iconBtn} onClick={() => setAddOpen((v) => !v)}>
                <IconAdd size={20} color={Colors.dashboard.stroke} />
              </button>
            </div>

            {addOpen && (
              <div className={styles.addForm}>
                <label className={styles.field}>
                  <span>{t('fitness.activityType')}</span>
                  <input
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value)}
                    placeholder="Running"
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('fitness.durationMin')}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('fitness.activeKcal')}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={kcal}
                    onChange={(e) => setKcal(e.target.value)}
                    placeholder="—"
                  />
                </label>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={savingWorkout}
                  onClick={handleAddWorkout}
                >
                  {savingWorkout ? t('common.loading') : t('fitness.saveWorkout')}
                </button>
              </div>
            )}

            {workouts.length === 0 ? (
              <p className={styles.emptyText}>{t('fitness.workoutsEmpty')}</p>
            ) : (
              <ul className={styles.workoutList}>
                {workouts.map((w) => (
                  <li key={w.id} className={styles.workoutRow}>
                    <div className={styles.workoutMain}>
                      <div className={styles.workoutName}>{w.activityType}</div>
                      <div className={styles.workoutMeta}>
                        {Math.round(w.durationMin)} min
                        {w.activeEnergyKcal != null
                          ? ` · ${Math.round(w.activeEnergyKcal)} kcal`
                          : ''}
                        {w.distanceKm != null ? ` · ${w.distanceKm.toFixed(1)} km` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteWorkout(w.id)}
                    >
                      {t('common.delete')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Shortcuts */}
        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.cardInner}>
            <button
              type="button"
              className={styles.collapseHead}
              onClick={() => setSetupOpen((v) => !v)}
            >
              <div>
                <div className={styles.sectionTitle}>{t('fitness.shortcutsTitle')}</div>
                <div className={styles.sectionSub}>
                  {hasToken ? t('fitness.tokenActive') : t('fitness.tokenMissing')}
                </div>
              </div>
              {setupOpen ? (
                <IconExpandLess size={22} color={Colors.dashboard.stroke} />
              ) : (
                <IconExpandMore size={22} color={Colors.dashboard.stroke} />
              )}
            </button>

            {setupOpen && (
              <div className={styles.setupBody}>
                <p className={styles.monoLabel}>{t('fitness.apiBase')}</p>
                <div className={styles.copyRow}>
                  <code className={styles.mono}>{apiBase}</code>
                  <button type="button" className={styles.iconBtn} onClick={() => copyText(apiBase)}>
                    <IconContentCopy size={18} color={Colors.dashboard.stroke} />
                  </button>
                </div>

                {plainToken ? (
                  <>
                    <p className={styles.monoLabel}>{t('fitness.tokenOnce')}</p>
                    <div className={styles.copyRow}>
                      <code className={styles.mono}>{plainToken}</code>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => copyText(plainToken)}
                      >
                        <IconContentCopy size={18} color={Colors.dashboard.stroke} />
                      </button>
                    </div>
                  </>
                ) : null}

                <div className={styles.tokenActions}>
                  <button type="button" className={styles.primaryBtn} onClick={handleGenerateToken}>
                    {hasToken ? t('fitness.regenerateToken') : t('fitness.generateToken')}
                  </button>
                  {hasToken && (
                    <button type="button" className={styles.secondaryBtn} onClick={handleRevokeToken}>
                      {t('fitness.revokeToken')}
                    </button>
                  )}
                </div>

                <ol className={styles.checklist}>
                  <li>{t('fitness.setupWorkout')}</li>
                  <li>{t('fitness.setupSteps')}</li>
                  <li>{t('fitness.setupAuth')}</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* AI analysis */}
        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.aiCard}>
            <div className={styles.aiHead}>
              <span className={styles.aiIcon}>
                <IconBrain size={22} color={Colors.dashboard.stroke} />
              </span>
              <div>
                <div className={styles.aiTitle}>{t('fitness.aiTitle')}</div>
                <div className={styles.aiSub}>
                  {t('fitness.aiRemaining', { count: remaining })}
                </div>
              </div>
            </div>

            {!parsed ? (
              <p className={styles.emptyText}>
                {hasFoodLogs ? t('fitness.aiEmpty') : t('fitness.aiNoFood')}
              </p>
            ) : parsed.kind === 'structured' ? (
              <div className={styles.analysisBox}>
                <AnalysisResultView data={parsed.data} />
              </div>
            ) : (
              <p className={styles.analysisPlain}>{parsed.text}</p>
            )}

            <button
              type="button"
              className={styles.aiBtn}
              disabled={!hasFoodLogs || remaining <= 0 || analysisLoading}
              onClick={handleGenerateAnalysis}
            >
              {analysisLoading ? (
                <span className="spinner" style={{ width: 20, height: 20 }} />
              ) : (
                <>
                  <IconBolt size={18} color="#fff" />
                  {analysis?.content ? t('fitness.aiRerun') : t('fitness.aiRun')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={t('common.ok', 'OK')}
        cancelLabel={dialog?.mode === 'confirm' ? t('common.cancel') : undefined}
        onConfirm={dialog?.mode === 'confirm' ? () => dialog.onConfirm() : undefined}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
