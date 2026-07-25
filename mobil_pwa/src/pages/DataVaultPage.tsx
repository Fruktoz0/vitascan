import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconDownload } from '../components/ui/Icons';
import { exportApi, getAccessToken, statsApi } from '../services/api';
import { useTierStore } from '../stores/tierStore';
import styles from './DataVaultPage.module.css';

export default function DataVaultPage() {
  const { t } = useTranslation();
  const { fetch: fetchTier, isPremium } = useTierStore();
  const [weekly, setWeekly] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await fetchTier();
      try {
        const [w, p] = await Promise.all([statsApi.weekly(), exportApi.preview()]);
        setWeekly(w);
        setPreview(p);
      } catch {}
      setLoading(false);
    })();
  }, [fetchTier]);

  const handleExport = async () => {
    if (!isPremium()) {
      alert(t('premiumMeta.exportDesc'));
      return;
    }
    const url = exportApi.getDownloadUrl(preview?.from, preview?.to);
    const token = getAccessToken();
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vitascan-export.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert(t('export.downloadErrorTitle'));
    }
  };

  const days = weekly?.days ?? [];

  return (
    <div className={`${styles.screen} page-scroll`}>
      <h1 className={styles.title}>{t('dataVaultTab')}</h1>

      {loading ? (
        <div className={styles.center}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className={styles.card}>
            <h2>{t('dataVault.weeklyCalories')}</h2>
            <div className={styles.bars}>
              {days.map((d: any, i: number) => {
                const max = Math.max(...days.map((x: any) => x.kcal ?? 0), 1);
                const h = Math.max(8, ((d.kcal ?? 0) / max) * 100);
                return (
                  <div key={i} className={styles.barCol}>
                    <div className={styles.bar} style={{ height: `${h}%` }} />
                    <span>{d.label ?? d.date?.slice(5) ?? i + 1}</span>
                  </div>
                );
              })}
              {days.length === 0 && <p className={styles.empty}>{t('homeScreen.noEntries')}</p>}
            </div>
          </div>

          <div className={styles.card}>
            <h2>{t('export.headerTitle')}</h2>
            {preview && (
              <p className={styles.meta}>
                {preview.from} → {preview.to} · {preview.logCount} log · {preview.waterCount} water
              </p>
            )}
            <button type="button" className={styles.exportBtn} onClick={handleExport}>
              <IconDownload size={18} color={Colors.dashboard.stroke} /> {t('export.downloadXlsx')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
