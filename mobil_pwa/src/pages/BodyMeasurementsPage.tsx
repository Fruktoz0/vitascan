import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconAdd,
  IconBrain,
  IconBolt,
  IconChevronRight,
  IconMoreHoriz,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  bodyApi,
  getErrorMessage,
  type BodyAnalysisContent,
  type BodyPart,
} from '../services/api';
import { BODY_PARTS, BODY_PART_META } from '../utils/bodyMeta';
import styles from './BodyMeasurements.module.css';

function parseAnalysis(content: string | null): BodyAnalysisContent | null {
  if (!content) return null;
  try {
    const o = JSON.parse(content);
    if (!o?.headline || !o?.summary) return null;
    return {
      headline: String(o.headline),
      summary: String(o.summary),
      positives: Array.isArray(o.positives) ? o.positives.map(String) : [],
      concerns: Array.isArray(o.concerns) ? o.concerns.map(String) : [],
      suggestions: Array.isArray(o.suggestions) ? o.suggestions.map(String) : [],
    };
  } catch {
    return null;
  }
}

export default function BodyMeasurementsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [parts, setParts] = useState<
    Array<{ bodyPart: BodyPart; valueCm: number | null; loggedDate: string | null }>
  >([]);
  const [analysis, setAnalysis] = useState<BodyAnalysisContent | null>(null);
  const [remaining, setRemaining] = useState(3);
  const [aiBusy, setAiBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, ai] = await Promise.all([
        bodyApi.summary(),
        bodyApi.getAnalysis().catch(() => null),
      ]);
      setParts(summary.parts);
      setRemaining(ai?.remaining ?? 3);
      setAnalysis(parseAnalysis(ai?.content ?? null));
    } catch {
      setParts(BODY_PARTS.map((bodyPart) => ({ bodyPart, valueCm: null, loggedDate: null })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAnalysis = async () => {
    setAiBusy(true);
    try {
      const res = await bodyApi.generateAnalysis(
        i18n.language?.startsWith('en') ? 'en' : 'hu',
      );
      setAnalysis(res.analysis ?? parseAnalysis(res.content));
      setRemaining(res.remaining);
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('bodyData.aiFailed')),
      });
    } finally {
      setAiBusy(false);
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

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <div className={styles.content}>
        <div className={styles.ctaWrap}>
          <span className={styles.ctaShadow} />
          <button type="button" className={styles.ctaBtn} onClick={() => navigate('/body/new')}>
            <span className={styles.ctaIcon}>
              <IconAdd size={18} color={Colors.dashboard.stroke} />
            </span>
            <span className={styles.ctaLabel}>{t('bodyData.addMeasurement')}</span>
            <span className={styles.ctaMore} aria-hidden>
              <IconMoreHoriz size={22} color={Colors.dashboard.stroke} />
            </span>
          </button>
        </div>

        {BODY_PARTS.map((part) => {
          const meta = BODY_PART_META[part];
          const PartIcon = meta.Icon;
          const row = parts.find((p) => p.bodyPart === part);
          const val =
            row?.valueCm != null
              ? t('bodyData.lastValue', { value: row.valueCm.toFixed(1) })
              : t('bodyData.lastEmpty');
          return (
            <div key={part} className={styles.partCardWrap}>
              <span className={styles.partCardShadow} />
              <button
                type="button"
                className={styles.partCard}
                onClick={() => navigate(`/body/${part}`)}
              >
                <span className={styles.partIcon} style={{ background: meta.bg }}>
                  <PartIcon size={22} color={Colors.dashboard.stroke} />
                </span>
                <span className={styles.partText}>
                  <span className={styles.partName}>{t(meta.labelKey)}</span>
                  <span className={styles.partLast}>{val}</span>
                </span>
                <IconChevronRight
                  size={22}
                  color={Colors.dashboard.stroke}
                  className={styles.partChevron}
                />
              </button>
            </div>
          );
        })}

        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.aiCard}>
            <div className={styles.aiHead}>
              <span className={styles.aiIcon}>
                <IconBrain size={22} color={Colors.dashboard.stroke} />
              </span>
              <div>
                <div className={styles.aiTitle}>{t('bodyData.aiTitle')}</div>
                <div className={styles.aiSub}>
                  {t('bodyData.aiRemaining', { count: remaining })}
                </div>
              </div>
            </div>

            {analysis ? (
              <>
                <h3 className={styles.aiHeadline}>{analysis.headline}</h3>
                <p className={styles.aiSummary}>{analysis.summary}</p>
                {analysis.positives.length > 0 && (
                  <div className={styles.aiBlock}>
                    <div className={`${styles.aiBlockLabel} ${styles.aiPositive}`}>
                      {t('bodyData.aiPositives')}
                    </div>
                    <ul className={styles.aiList}>
                      {analysis.positives.map((x, i) => (
                        <li key={`p-${i}`}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.concerns.length > 0 && (
                  <div className={styles.aiBlock}>
                    <div className={`${styles.aiBlockLabel} ${styles.aiConcern}`}>
                      {t('bodyData.aiConcerns')}
                    </div>
                    <ul className={styles.aiList}>
                      {analysis.concerns.map((x, i) => (
                        <li key={`c-${i}`}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.suggestions.length > 0 && (
                  <div className={styles.aiBlock}>
                    <div className={`${styles.aiBlockLabel} ${styles.aiSuggest}`}>
                      {t('bodyData.aiSuggestions')}
                    </div>
                    <ul className={styles.aiList}>
                      {analysis.suggestions.map((x, i) => (
                        <li key={`s-${i}`}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.aiEmpty}>{t('bodyData.aiEmpty')}</p>
            )}

            <button
              type="button"
              className={styles.aiBtn}
              disabled={aiBusy || remaining <= 0}
              onClick={runAnalysis}
            >
              {aiBusy ? (
                <span className="spinner" style={{ width: 20, height: 20 }} />
              ) : (
                <>
                  <IconBolt size={18} color="#fff" />
                  {analysis ? t('bodyData.aiRerun') : t('bodyData.aiRun')}
                </>
              )}
            </button>
          </div>
        </div>

        <p className={styles.quote}>{t('bodyData.motivation')}</p>
      </div>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={t('common.ok', 'OK')}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
