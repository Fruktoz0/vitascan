import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack } from '../components/ui/Icons';
import { getErrorMessage, notificationsApi, type NotificationPrefs } from '../services/api';
import {
  ensurePushSubscription,
  isIosDevice,
  isStandalonePwa,
  pushUnsupported,
  requestAndSubscribe,
} from '../services/pushSubscribe';
import styles from './StackPage.module.css';

type PrefsState = Omit<NotificationPrefs, 'vapidPublicKey'>;

const DEFAULT_PREFS: PrefsState = {
  mealEnabled: true,
  mealBreakfast: true,
  mealLunch: true,
  mealDinner: true,
  mealSnack: false,
  mealBreakfastAt: '08:00',
  mealLunchAt: '12:30',
  mealDinnerAt: '18:30',
  mealSnackAt: '15:30',
  waterEnabled: true,
  waterEveryHours: 2,
  waterQuietStart: '22:00',
  waterQuietEnd: '07:00',
  dailySummaryEnabled: false,
  dailySummaryAt: '20:00',
  cartPartnerEnabled: true,
  shareInviteEnabled: true,
  timezone: 'Europe/Budapest',
};

const MEAL_CHIPS = [
  { flag: 'mealBreakfast', time: 'mealBreakfastAt', labelKey: 'mealBreakfast' },
  { flag: 'mealLunch', time: 'mealLunchAt', labelKey: 'mealLunch' },
  { flag: 'mealDinner', time: 'mealDinnerAt', labelKey: 'mealDinner' },
  { flag: 'mealSnack', time: 'mealSnackAt', labelKey: 'mealSnack' },
] as const;

const WATER_FREQ = [1, 2, 3, 4] as const;

function permissionState(): NotificationPermission | 'unsupported' {
  if (pushUnsupported()) return 'unsupported';
  return Notification.permission;
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<PrefsState>(DEFAULT_PREFS);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(permissionState);

  useEffect(() => {
    let cancelled = false;
    notificationsApi
      .getPrefs()
      .then((row) => {
        if (cancelled) return;
        const { vapidPublicKey, ...rest } = row;
        setPrefs(rest);
        setVapidKey(vapidPublicKey);
        if (Notification.permission === 'granted') {
          void ensurePushSubscription(vapidPublicKey);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, t('notificationsScreen.saveFailed')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const persist = async (next: PrefsState) => {
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const saved = await notificationsApi.updatePrefs(next);
      const { vapidPublicKey, ...rest } = saved;
      setPrefs(rest);
      if (vapidPublicKey) setVapidKey(vapidPublicKey);
    } catch (err) {
      setError(getErrorMessage(err, t('notificationsScreen.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const enablePushThen = async (apply: (current: PrefsState) => PrefsState) => {
    const result = await requestAndSubscribe(vapidKey);
    setPerm(permissionState());
    if (result === 'denied' || result === 'unsupported') {
      setError(
        result === 'unsupported'
          ? t('notificationsScreen.unsupported')
          : t('notificationsScreen.permissionDenied'),
      );
      return;
    }
    if (result === 'missing-key') {
      setError(t('notificationsScreen.missingKey'));
      return;
    }
    await persist(apply(prefs));
  };

  const toggleMaster = (key: 'mealEnabled' | 'waterEnabled' | 'dailySummaryEnabled' | 'cartPartnerEnabled' | 'shareInviteEnabled') => {
    const turningOn = !prefs[key];
    if (turningOn) {
      void enablePushThen((current) => ({ ...current, [key]: true }));
      return;
    }
    void persist({ ...prefs, [key]: false });
  };

  const showIosHint = isIosDevice() && !isStandalonePwa();

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('notificationsScreen.screenTitle')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.content}>
        {loading ? <p className={styles.message}>{t('common.loading')}</p> : null}

        {showIosHint ? <p className={styles.banner}>{t('notificationsScreen.iosInstallHint')}</p> : null}

        {perm === 'unsupported' ? (
          <p className={styles.banner}>{t('notificationsScreen.unsupported')}</p>
        ) : perm === 'denied' ? (
          <p className={styles.banner}>{t('notificationsScreen.permissionDenied')}</p>
        ) : perm === 'default' ? (
          <div className={styles.banner}>
            <p style={{ margin: 0 }}>{t('notificationsScreen.permissionHint')}</p>
            <button
              type="button"
              className={styles.saveBtn}
              style={{ height: 44, marginTop: 12, fontSize: 15 }}
              onClick={() => void enablePushThen((current) => current)}
            >
              {t('notificationsScreen.permissionCta')}
            </button>
          </div>
        ) : null}

        {error ? <p className={styles.message}>{error}</p> : null}

        <button type="button" className={styles.toggleRow} onClick={() => toggleMaster('mealEnabled')} disabled={loading}>
          <span>{t('notificationsScreen.mealRemindersTitle')}</span>
          <span className={`${styles.toggle} ${prefs.mealEnabled ? styles.toggleOn : ''}`}>
            <span className={styles.knob} />
          </span>
        </button>

        {prefs.mealEnabled ? (
          <div className={styles.fieldCard}>
            <div className={styles.chips}>
              {MEAL_CHIPS.map((chip) => (
                <button
                  key={chip.flag}
                  type="button"
                  className={`${styles.chip} ${prefs[chip.flag] ? styles.chipActive : ''}`}
                  onClick={() => void persist({ ...prefs, [chip.flag]: !prefs[chip.flag] })}
                >
                  {t(`notificationsScreen.${chip.labelKey}`)}
                </button>
              ))}
            </div>
            {MEAL_CHIPS.filter((chip) => prefs[chip.flag]).map((chip) => (
              <label key={chip.time} className={styles.timeRow}>
                <span>{t(`notificationsScreen.${chip.labelKey}`)}</span>
                <input
                  className={styles.input}
                  type="time"
                  value={prefs[chip.time]}
                  onChange={(e) => void persist({ ...prefs, [chip.time]: e.target.value })}
                  aria-label={t('notificationsScreen.notifyTime')}
                />
              </label>
            ))}
          </div>
        ) : null}

        <button type="button" className={styles.toggleRow} onClick={() => toggleMaster('waterEnabled')} disabled={loading}>
          <span>{t('notificationsScreen.waterTitle')}</span>
          <span className={`${styles.toggle} ${prefs.waterEnabled ? styles.toggleOn : ''}`}>
            <span className={styles.knob} />
          </span>
        </button>

        {prefs.waterEnabled ? (
          <div className={styles.fieldCard}>
            <p className={styles.fieldHint} style={{ marginTop: 0 }}>
              {t('notificationsScreen.waterDesc')}
            </p>
            <div className={styles.fieldLabel}>{t('notificationsScreen.frequency')}</div>
            <div className={styles.chips}>
              {WATER_FREQ.map((hours) => (
                <button
                  key={hours}
                  type="button"
                  className={`${styles.chip} ${prefs.waterEveryHours === hours ? styles.chipActive : ''}`}
                  onClick={() => void persist({ ...prefs, waterEveryHours: hours })}
                >
                  {t(`notificationsScreen.freq${hours}h`)}
                </button>
              ))}
            </div>
            <p className={styles.fieldHint}>{t('notificationsScreen.quietHours')}</p>
          </div>
        ) : null}

        <button type="button" className={styles.toggleRow} onClick={() => toggleMaster('dailySummaryEnabled')} disabled={loading}>
          <span>{t('notificationsScreen.dailyTitle')}</span>
          <span className={`${styles.toggle} ${prefs.dailySummaryEnabled ? styles.toggleOn : ''}`}>
            <span className={styles.knob} />
          </span>
        </button>

        {prefs.dailySummaryEnabled ? (
          <div className={styles.fieldCard}>
            <p className={styles.fieldHint} style={{ marginTop: 0 }}>
              {t('notificationsScreen.dailyDesc')}
            </p>
            <label className={styles.timeRow}>
              <span>{t('notificationsScreen.notifyTime')}</span>
              <input
                className={styles.input}
                type="time"
                value={prefs.dailySummaryAt}
                onChange={(e) => void persist({ ...prefs, dailySummaryAt: e.target.value })}
              />
            </label>
          </div>
        ) : null}

        <button type="button" className={styles.toggleRow} onClick={() => toggleMaster('cartPartnerEnabled')} disabled={loading}>
          <span>{t('notificationsScreen.cartTitle')}</span>
          <span className={`${styles.toggle} ${prefs.cartPartnerEnabled ? styles.toggleOn : ''}`}>
            <span className={styles.knob} />
          </span>
        </button>
        <p className={styles.fieldHint} style={{ margin: '-6px 4px 0' }}>
          {t('notificationsScreen.cartDesc')}
        </p>

        <button type="button" className={styles.toggleRow} onClick={() => toggleMaster('shareInviteEnabled')} disabled={loading}>
          <span>{t('notificationsScreen.shareTitle')}</span>
          <span className={`${styles.toggle} ${prefs.shareInviteEnabled ? styles.toggleOn : ''}`}>
            <span className={styles.knob} />
          </span>
        </button>
        <p className={styles.fieldHint} style={{ margin: '-6px 4px 0' }}>
          {t('notificationsScreen.shareDesc')}
        </p>

        {saving ? <p className={styles.message}>{t('notificationsScreen.saving')}</p> : null}
      </div>
    </div>
  );
}
