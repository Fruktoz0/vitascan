import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconAdd,
  IconBolt,
  IconBrain,
  IconCalendarToday,
  IconChevronRight,
  IconContentCopy,
  IconDirectionsWalk,
  IconExpandLess,
  IconExpandMore,
  IconFitnessCenter,
  IconRefresh,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { AnalysisResultView } from '../components/food/AnalysisResult';
import {
  analysisApi,
  clampUiMessage,
  fitnessApi,
  getErrorMessage,
  logApi,
  type DailyAnalysisResult,
  type FitnessSyncerStatus,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedDate } = useDateStore();
  const dateStr = toLocalDateStr(selectedDate);
  const autoSyncTried = useRef(false);

  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<number | null>(null);
  const [workouts, setWorkouts] = useState<FitnessWorkout[]>([]);
  const [fsStatus, setFsStatus] = useState<FitnessSyncerStatus | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [oauthPaste, setOauthPaste] = useState('');
  const [oauthPending, setOauthPending] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [activityType, setActivityType] = useState('Running');
  const [durationMin, setDurationMin] = useState('30');
  const [kcal, setKcal] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);

  const [analysis, setAnalysis] = useState<DailyAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [hasFoodLogs, setHasFoodLogs] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stepsRes, workoutsRes, statusRes, analysisRes, logsRes] = await Promise.all([
        fitnessApi.getSteps(dateStr),
        fitnessApi.listWorkouts(dateStr),
        fitnessApi.getFsStatus().catch(() => null),
        analysisApi.get(dateStr, 'fitness').catch(() => null),
        logApi.getByDate(dateStr).catch(() => null),
      ]);
      setSteps(stepsRes.steps);
      setWorkouts(workoutsRes.workouts);
      setFsStatus(statusRes);
      setOauthPending(!!statusRes?.oauthPending);
      setAnalysis(analysisRes);
      const logCount = Array.isArray((logsRes as any)?.logs) ? (logsRes as any).logs.length : 0;
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

  // Always start with FitnessSyncer panel collapsed (survives HMR / remount quirks).
  useEffect(() => {
    setSetupOpen(false);
  }, [dateStr]);

  // OAuth return query
  useEffect(() => {
    const fs = searchParams.get('fs');
    if (!fs) return;
    if (fs === 'connected') {
      setDialog({
        mode: 'alert',
        title: t('fitness.fsConnectedTitle'),
        message: t('fitness.fsConnected'),
      });
      // Keep FitnessSyncer panel collapsed — user can expand if needed.
    } else if (fs === 'error') {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: clampUiMessage(
          searchParams.get('message') || t('fitness.fsConnectError'),
          t('fitness.fsConnectError'),
        ),
      });
    }
    setSearchParams({}, { replace: true });
    load();
  }, [searchParams, setSearchParams, t, load]);

  // Auto-sync if connected and stale (>1h)
  useEffect(() => {
    if (loading || autoSyncTried.current || !fsStatus?.connected || !fsStatus.needsSync) return;
    autoSyncTried.current = true;
    (async () => {
      setSyncing(true);
      try {
        await fitnessApi.sync(7);
        await load();
      } catch {
        // silent — user can tap Sync
      } finally {
        setSyncing(false);
      }
    })();
  }, [loading, fsStatus, load]);

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

  const statusLabel = useMemo(() => {
    if (!fsStatus) return t('fitness.fsUnknown');
    if (fsStatus.connected) return t('fitness.fsStatusConnected');
    if (fsStatus.hasCredentials) return t('fitness.fsStatusCredsOnly');
    return t('fitness.fsStatusDisconnected');
  }, [fsStatus, t]);

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

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: t('fitness.fsCredsRequired'),
      });
      return;
    }
    setSavingCreds(true);
    try {
      const status = await fitnessApi.saveFsCredentials(clientId.trim(), clientSecret.trim());
      setFsStatus(status);
      setClientSecret('');
      setDialog({
        mode: 'alert',
        title: t('fitness.fsCredsSavedTitle'),
        message: t('fitness.fsCredsSaved'),
      });
    } catch (e) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.fsCredsError')),
      });
    } finally {
      setSavingCreds(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { authorizeUrl } = await fitnessApi.startFsConnect();
      setOauthPending(true);
      setOauthPaste('');
      // Open authorize in new tab so user can return to VitaScan and paste the URL
      window.open(authorizeUrl, '_blank', 'noopener,noreferrer');
      setDialog({
        mode: 'alert',
        title: t('fitness.fsConnectOpenedTitle'),
        message: t('fitness.fsConnectOpened'),
      });
    } catch (e) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.fsConnectError')),
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleExchangePaste = async () => {
    if (!oauthPaste.trim()) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: t('fitness.fsPasteRequired'),
      });
      return;
    }
    setExchanging(true);
    try {
      const status = await fitnessApi.exchangeFsPaste(oauthPaste.trim());
      setFsStatus(status);
      setOauthPending(false);
      setOauthPaste('');
      setDialog({
        mode: 'alert',
        title: t('fitness.fsConnectedTitle'),
        message: t('fitness.fsConnected'),
      });
    } catch (e) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.fsExchangeError')),
      });
    } finally {
      setExchanging(false);
    }
  };

  const handleDisconnect = () => {
    setDialog({
      mode: 'confirm',
      title: t('fitness.fsDisconnectTitle'),
      message: t('fitness.fsDisconnectConfirm'),
      onConfirm: async () => {
        setDialog(null);
        try {
          setFsStatus(await fitnessApi.disconnectFs());
        } catch (e) {
          setDialog({
            mode: 'alert',
            title: t('food.errorTitle'),
            message: getErrorMessage(e, t('fitness.fsDisconnectError')),
          });
        }
      },
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fitnessApi.sync(7);
      await load();
      setDialog({
        mode: 'alert',
        title: t('fitness.fsSyncDoneTitle'),
        message: t('fitness.fsSyncDone', {
          workouts: res.workoutsUpserted,
          steps: res.stepsUpserted,
        }),
      });
    } catch (e) {
      setDialog({
        mode: 'alert',
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fitness.fsSyncError')),
      });
    } finally {
      setSyncing(false);
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
      setAnalysis(await analysisApi.generate(dateStr, locale, 'fitness'));
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
  const callbackUrl = fsStatus?.callbackUrl;

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.topBar}>
        <h1 className={styles.pageTitle}>{t('fitness.title')}</h1>
        <div className={styles.topBarActions}>
          <button
            type="button"
            className={styles.calendarBtn}
            disabled={!fsStatus?.connected || syncing}
            aria-label={t('fitness.fsSync')}
            onClick={handleSync}
          >
            <span className={styles.calendarShadow} />
            <span className={styles.calendarInner}>
              <IconRefresh
                size={20}
                color={Colors.dashboard.stroke}
                className={syncing ? styles.spinIcon : undefined}
              />
            </span>
          </button>
          <button type="button" className={styles.calendarBtn} onClick={() => navigate('/date-picker')}>
            <span className={styles.calendarShadow} />
            <span className={styles.calendarInner}>
              <IconCalendarToday size={20} color={Colors.dashboard.stroke} />
            </span>
          </button>
        </div>
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
                  <li key={w.id}>
                    <button
                      type="button"
                      className={styles.workoutRow}
                      onClick={() => navigate(`/fitness/workout/${w.id}`)}
                    >
                      <div className={styles.workoutMain}>
                        <div className={styles.workoutName}>
                          {w.title?.trim() || w.activityType}
                        </div>
                        <div className={styles.workoutMeta}>
                          {Math.round(w.durationMin)} min
                          {w.activeEnergyKcal != null
                            ? ` · ${Math.round(w.activeEnergyKcal)} kcal`
                            : ''}
                          {w.distanceKm != null ? ` · ${w.distanceKm.toFixed(1)} km` : ''}
                          {w.avgHeartrate != null ? ` · ${w.avgHeartrate} bpm` : ''}
                        </div>
                      </div>
                      <IconChevronRight size={20} color="rgba(0,0,0,0.35)" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* FitnessSyncer */}
        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.cardInner}>
            <button
              type="button"
              className={styles.collapseHead}
              onClick={() => setSetupOpen((v) => !v)}
            >
              <div>
                <div className={styles.sectionTitle}>{t('fitness.fsTitle')}</div>
                <div className={styles.sectionSub}>{statusLabel}</div>
              </div>
              {setupOpen ? (
                <IconExpandLess size={22} color={Colors.dashboard.stroke} />
              ) : (
                <IconExpandMore size={22} color={Colors.dashboard.stroke} />
              )}
            </button>

            {setupOpen && (
              <div className={styles.setupBody}>
                {fsStatus?.lastSyncAt && (
                  <p className={styles.emptyText}>
                    {t('fitness.fsLastSync', {
                      time: new Date(fsStatus.lastSyncAt).toLocaleString(
                        locale === 'hu' ? 'hu-HU' : 'en-US',
                      ),
                    })}
                  </p>
                )}
                {fsStatus?.lastError && (
                  <p className={styles.errorText}>
                    {clampUiMessage(fsStatus.lastError, t('fitness.fsSyncError'), 160)}
                  </p>
                )}

                <label className={styles.field}>
                  <span>{t('fitness.fsClientId')}</span>
                  <input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    autoComplete="off"
                    placeholder={fsStatus?.hasClientId ? '••••••••' : ''}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('fitness.fsClientSecret')}</span>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    autoComplete="off"
                    placeholder={fsStatus?.hasCredentials ? '••••••••' : ''}
                  />
                </label>

                <div className={styles.tokenActions}>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={savingCreds}
                    onClick={handleSaveCredentials}
                  >
                    {savingCreds ? t('common.loading') : t('fitness.fsSaveCreds')}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={connecting || !fsStatus?.hasCredentials}
                    onClick={handleConnect}
                  >
                    {connecting ? t('common.loading') : t('fitness.fsConnect')}
                  </button>

                  {(oauthPending || !!oauthPaste) && !fsStatus?.connected && (
                    <>
                      <p className={styles.emptyText}>{t('fitness.fsPasteHint')}</p>
                      <label className={styles.field}>
                        <span>{t('fitness.fsPasteLabel')}</span>
                        <textarea
                          className={styles.pasteArea}
                          value={oauthPaste}
                          onChange={(e) => setOauthPaste(e.target.value)}
                          rows={3}
                          placeholder="https://personal.fitnesssyncer.com/?code=..."
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        disabled={exchanging || !oauthPaste.trim()}
                        onClick={handleExchangePaste}
                      >
                        {exchanging ? t('common.loading') : t('fitness.fsPasteSubmit')}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={syncing || !fsStatus?.connected}
                    onClick={handleSync}
                  >
                    {syncing ? t('fitness.fsSyncing') : t('fitness.fsSync')}
                  </button>
                  {fsStatus?.connected && (
                    <button type="button" className={styles.secondaryBtn} onClick={handleDisconnect}>
                      {t('fitness.fsDisconnect')}
                    </button>
                  )}
                </div>

                {callbackUrl && (
                  <>
                    <p className={styles.monoLabel}>{t('fitness.fsCallback')}</p>
                    <div className={styles.copyRow}>
                      <code className={styles.mono}>{callbackUrl}</code>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => copyText(callbackUrl)}
                      >
                        <IconContentCopy size={18} color={Colors.dashboard.stroke} />
                      </button>
                    </div>
                  </>
                )}

                <ol className={styles.checklist}>
                  <li>{t('fitness.fsSetup1')}</li>
                  <li>{t('fitness.fsSetup2')}</li>
                  <li>{t('fitness.fsSetup3')}</li>
                  <li>{t('fitness.fsSetup4')}</li>
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
