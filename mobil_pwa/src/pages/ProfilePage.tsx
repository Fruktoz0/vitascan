import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconAccountEditOutline,
  IconArrowBack,
  IconChevronRight,
  IconClose,
  IconEdit,
  IconLogout,
  IconNotificationsOutline,
  IconShield,
  IconTrophy,
} from '../components/ui/Icons';
import AvatarPicker, { UserAvatar } from '../components/ui/AvatarPicker';
import { profileApi, statsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { getAvatarDef, resolveAvatarKey } from '../design/avatars';
import { getReputationProgress, REPUTATION_LEVELS } from '../utils/reputation';
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
  const [rankOpen, setRankOpen] = useState(false);

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
  const rank = getReputationProgress(reputation);
  const rankName = t(`reputation.level.${rank.current.key}`);
  const nextName = rank.next ? t(`reputation.level.${rank.next.key}`) : '';
  const currentAvatar = resolveAvatarKey(avatarKey ?? profile?.profile?.avatarKey);
  const avatarDef = getAvatarDef(currentAvatar);

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

      <header className={styles.topBar}>
        <button type="button" className={styles.back} onClick={() => navigate('/menu')}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1 className={styles.pageTitle}>{t('profileTab')}</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.heroWrap}>
        <span className={styles.cardShadow} />
        <div className={styles.heroInner}>
          <button
            type="button"
            className={styles.avatarLarge}
            onClick={() => setPickerOpen(true)}
            aria-label={t('profile.avatarEdit')}
          >
            <span className={styles.avatarShadow} />
            <span className={styles.avatarFace} style={{ background: avatarDef.bg }}>
              <UserAvatar avatarKey={currentAvatar} size={72} />
            </span>
            <span className={styles.avatarEdit}>
              <IconEdit size={14} color={Colors.dashboard.stroke} />
            </span>
          </button>
          <h2 className={styles.heroName}>{user?.username ?? '—'}</h2>
          <p className={styles.heroSubtitle}>{user?.email}</p>
        </div>
      </div>

      <button type="button" className={styles.levelWrap} onClick={() => setRankOpen(true)}>
        <span className={styles.cardShadow} />
        <div className={styles.levelInner} style={{ background: rank.current.tint }}>
          <div className={styles.levelTop}>
            <span className={styles.rankIcon} style={{ background: rank.current.iconBg }}>
              <IconTrophy size={22} color={Colors.dashboard.stroke} />
            </span>
            <div className={styles.rankCopy}>
              <div className={styles.rankLabel}>{t('profile.rankLabel')}</div>
              <div className={styles.rankTitle}>
                {rank.current.emoji} {rankName}
              </div>
            </div>
            <span className={styles.levelPill}>{t('profile.rankLevelBadge', { n: rank.levelNumber })}</span>
          </div>
          <div className={styles.xpTrack}>
            <div
              className={styles.xpFill}
              style={{ width: `${Math.round(rank.ratio * 100)}%`, background: rank.current.fill }}
            />
          </div>
          <div className={styles.xpMeta}>
            <span>
              {rank.maxed
                ? t('reputation.maxLevelReached')
                : t('profile.levelXpTo', { current: rank.points, next: rank.next?.min ?? rank.points })}
            </span>
            <span className={styles.detailsLink}>
              {t('profile.levelDetails')}
              <IconChevronRight size={16} color={Colors.dashboard.stroke} />
            </span>
          </div>
        </div>
      </button>

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
        </div>
      </div>

      {user?.role === 'ADMIN' && (
        <button type="button" className={styles.adminBtn} onClick={() => navigate('/admin')}>
          <IconShield size={18} color={Colors.dashboard.stroke} /> {t('profile.admin')}
        </button>
      )}

      <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
        <IconLogout size={18} color="#B83B3B" /> {t('logout')}
      </button>

      {pickerOpen && (
        <AvatarPicker value={currentAvatar} onSelect={handleSelectAvatar} onClose={() => setPickerOpen(false)} />
      )}

      {rankOpen && (
        <div className={styles.rankOverlay} role="presentation" onClick={() => setRankOpen(false)}>
          <div
            className={styles.rankSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rank-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.rankSheetHead}>
              <h3 id="rank-sheet-title">{t('reputation.levelsTitle')}</h3>
              <button type="button" className={styles.rankClose} onClick={() => setRankOpen(false)} aria-label={t('reputation.close')}>
                <IconClose size={20} color={Colors.dashboard.stroke} />
              </button>
            </div>
            <p className={styles.rankHint}>
              {rank.maxed
                ? t('reputation.maxThanks')
                : t('reputation.pointsToNext', {
                    count: rank.remaining,
                    emoji: rank.next?.emoji ?? '',
                    level: nextName,
                  })}
            </p>
            <ul className={styles.rankLevels}>
              {REPUTATION_LEVELS.map((level, i) => {
                const unlocked = rank.points >= level.min;
                const active = level.key === rank.current.key;
                const name = t(`reputation.level.${level.key}`);
                return (
                  <li
                    key={level.key}
                    className={`${styles.rankLevelRow} ${active ? styles.rankLevelActive : ''} ${unlocked ? '' : styles.rankLevelLocked}`}
                    style={active ? { background: level.tint } : undefined}
                  >
                    <span className={styles.rankLevelEmoji} style={{ background: level.iconBg }}>
                      {level.emoji}
                    </span>
                    <span className={styles.rankLevelCopy}>
                      <span className={styles.rankLevelName}>{name}</span>
                      <span className={styles.rankLevelPts}>{t('reputation.fromPoints', { count: level.min })}</span>
                    </span>
                    {active && <span className={styles.rankCurrentBadge}>{t('reputation.current')}</span>}
                    <span className={styles.rankLevelNum}>{t('profile.rankLevelBadge', { n: i + 1 })}</span>
                  </li>
                );
              })}
            </ul>
            <p className={styles.rankHow}>{t('reputation.howToStart')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
