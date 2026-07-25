import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconAccountEditOutline,
  IconChevronRight,
  IconLogout,
  IconNotificationsOutline,
  IconShield,
  IconTarget,
} from '../components/ui/Icons';
import AvatarPicker, { UserAvatar } from '../components/ui/AvatarPicker';
import { profileApi, statsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import styles from './ProfilePage.module.css';

function SettingsRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.settingsRow} onClick={onClick}>
      <span className={styles.rowIcon}>{icon}</span>
      <span className={styles.rowLabel}>{label}</span>
      {value && <span className={styles.rowValue}>{value}</span>}
      {!value && <IconChevronRight size={18} color="#B0BEC5" />}
    </button>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const avatarKey = useProfileStore((s) => s.avatarKey);
  const setAvatarKey = useProfileStore((s) => s.setAvatarKey);
  const [profile, setProfile] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [me, st] = await Promise.all([profileApi.getMe(), statsApi.streak()]);
        setProfile(me);
        setStreak(st.streak ?? 0);
      } catch {}
    })();
  }, []);

  const reputation = profile?.reputation ?? 0;
  const currentAvatar = avatarKey ?? profile?.profile?.avatarKey ?? user?.username ?? 'Felix';

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login', { replace: true });
  };

  const handleSelectAvatar = async (key: string) => {
    try {
      await setAvatarKey(key);
      setPickerOpen(false);
    } catch (e: any) {
      window.alert(e?.message || 'Mentés sikertelen');
    }
  };

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <h1 className={styles.pageTitle}>{t('profileTab')}</h1>

      <div className={styles.heroWrap}>
        <span className={styles.cardShadow} />
        <div className={styles.heroInner}>
          <button type="button" className={styles.avatarLarge} onClick={() => setPickerOpen(true)}>
            <UserAvatar avatarKey={currentAvatar} size={72} />
            <span className={styles.avatarEditHint}>Csere</span>
          </button>
          <h2 className={styles.heroName}>{user?.username ?? '—'}</h2>
          <p className={styles.heroSubtitle}>{user?.email}</p>
        </div>
      </div>

      <div className={styles.levelWrap}>
        <span className={styles.cardShadow} />
        <div className={styles.levelInner}>
          <div className={styles.levelTop}>
            <div>
              <div className={styles.rankLabel}>{t('profile.rankLabel')}</div>
              <div className={styles.rankTitle}>{reputation >= 100 ? 'Expert' : 'Member'}</div>
            </div>
            <span className={styles.levelPill}>XP {reputation}</span>
          </div>
          <div className={styles.xpTrack}>
            <div className={styles.xpFill} style={{ width: `${Math.min(reputation, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className={styles.statsGrid}>
        {[
          { label: t('profile.statActiveDays'), value: `${streak}`, bg: '#D7EBD2' },
          { label: t('profile.dailyKcal'), value: `${profile?.dailyKcalGoal ?? profile?.profile?.dailyKcalGoal ?? '—'}`, bg: '#FCE2C8' },
          { label: t('profile.dailyWater'), value: `${profile?.dailyWaterGoalMl ?? profile?.profile?.dailyWaterGoalMl ?? '—'}`, bg: '#D8E6F2' },
          {
            label: t('profile.weight'),
            value: (profile?.weightKg ?? profile?.profile?.weightKg)
              ? `${profile?.weightKg ?? profile?.profile?.weightKg}`
              : '—',
            bg: '#F4E5C2',
          },
        ].map((s) => (
          <div key={s.label} className={styles.statCard} style={{ background: s.bg }}>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.settingsWrap}>
        <span className={styles.cardShadow} />
        <div className={styles.settingsInner}>
          <h3 className={styles.settingsTitle}>{t('profile.settingsTitle')}</h3>
          <SettingsRow
            icon={<IconAccountEditOutline size={20} color="#2E7D32" />}
            label={t('profile.settingsPersonal')}
            onClick={() => navigate('/personal-data')}
          />
          <SettingsRow
            icon={<IconNotificationsOutline size={20} color="#1565C0" />}
            label={t('profile.settingsNotifications')}
            onClick={() => navigate('/notifications')}
          />
          <SettingsRow
            icon={<IconTarget size={20} color="#E65100" />}
            label={t('profile.settingsGoals')}
            onClick={() => navigate('/personal-data')}
          />
        </div>
      </div>

      {user?.role === 'ADMIN' && (
        <button type="button" className={styles.adminBtn} onClick={() => navigate('/admin')}>
          <IconShield size={18} color={Colors.dashboard.stroke} /> Admin
        </button>
      )}

      <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
        <IconLogout size={18} color="#B83B3B" /> {t('logout')}
      </button>

      {pickerOpen && (
        <AvatarPicker value={currentAvatar} onSelect={handleSelectAvatar} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
