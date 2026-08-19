import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconArrowBack,
  IconBookOutline,
  IconCheck,
  IconClose,
  IconPeopleOutline,
  IconPieChartOutline,
  IconRestaurant,
  IconTrophy,
} from '../components/ui/Icons';
import { adminApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { getReputationProgress } from '../utils/reputation';
import styles from './AdminPage.module.css';

type AdminTab = 'dashboard' | 'foods' | 'users' | 'recipes';

const STAT_TONES = ['#D7EBD2', '#FCE2C8', '#D8E6F2', '#F4E5C2', '#E7DDFF', '#FFDAD6', '#E8F5E9'] as const;

function statusClass(status: string) {
  if (status === 'VERIFIED') return styles.pillMint;
  if (status === 'BANNED') return styles.pillPeach;
  if (status === 'PENDING' || status === 'UNVERIFIED') return styles.pillSand;
  return styles.pillMuted;
}

export default function AdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [foods, setFoods] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'dashboard') setDashboard(await adminApi.getDashboard());
      if (tab === 'foods') {
        const res = await adminApi.getFoods({ limit: 40 });
        setFoods(res.foods);
      }
      if (tab === 'users') {
        const res = await adminApi.getUsers({ limit: 40 });
        setUsers(res.users);
      }
      if (tab === 'recipes') {
        const res = await adminApi.getRecipes({ status: 'PENDING', limit: 40 });
        setRecipes(res.recipes);
      }
    } catch {
      /* keep previous data */
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      navigate('/home', { replace: true });
      return;
    }
    load();
  }, [user, navigate, load]);

  const foodStatusLabel = (status: string) => {
    if (status === 'VERIFIED') return t('adminPage.statusVerified');
    if (status === 'BANNED') return t('adminPage.statusBanned');
    if (status === 'PENDING') return t('adminPage.statusPending');
    return t('adminPage.statusUnverified');
  };

  const roleLabel = (role: string) => (role === 'ADMIN' ? t('adminPage.roleAdmin') : t('adminPage.roleUser'));
  const tierLabel = (tier?: string) => (tier === 'PREMIUM' ? t('adminPage.tierPremium') : t('adminPage.tierFree'));

  const tabs: { id: AdminTab; label: string; icon: typeof IconPieChartOutline }[] = [
    { id: 'dashboard', label: t('adminPage.tabDashboard'), icon: IconPieChartOutline },
    { id: 'foods', label: t('adminPage.tabFoods'), icon: IconRestaurant },
    { id: 'users', label: t('adminPage.tabUsers'), icon: IconPeopleOutline },
    { id: 'recipes', label: t('adminPage.tabRecipes'), icon: IconBookOutline },
  ];

  const stats = dashboard
    ? [
        { label: t('adminPage.statUsers'), value: dashboard.stats.totalUsers },
        { label: t('adminPage.statNewToday'), value: dashboard.stats.newUsersToday },
        { label: t('adminPage.statFoods'), value: dashboard.stats.totalFoods },
        { label: t('adminPage.statPendingFoods'), value: dashboard.stats.pendingFoods },
        { label: t('adminPage.statPendingRecipes'), value: dashboard.stats.pendingRecipes ?? 0 },
        { label: t('adminPage.statLogsToday'), value: dashboard.stats.logsToday },
        { label: t('adminPage.statPremium'), value: dashboard.stats.premiumUsers },
      ]
    : [];

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate('/menu/profile')}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('adminPage.title')}</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.tabs}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={16} color={Colors.dashboard.stroke} />
            {label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {loading && (
          <div className={styles.center}>
            <div className="spinner" />
          </div>
        )}

        {!loading && tab === 'dashboard' && dashboard && (
          <>
            <div className={styles.grid}>
              {stats.map((s, i) => (
                <div key={s.label} className={styles.stat} style={{ background: STAT_TONES[i % STAT_TONES.length] }}>
                  <div className={styles.statValue}>{s.value}</div>
                  <div className={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            <section className={styles.panel}>
              <span className={styles.panelShadow} />
              <div className={styles.panelInner}>
                <div className={styles.panelHead}>
                  <span className={styles.panelIcon}>
                    <IconTrophy size={20} color={Colors.dashboard.stroke} />
                  </span>
                  <h2>{t('adminPage.leaderboard')}</h2>
                </div>
                {dashboard.topContributors.length === 0 ? (
                  <p className={styles.empty}>{t('adminPage.leaderboardEmpty')}</p>
                ) : (
                  <ul className={styles.rankList}>
                    {dashboard.topContributors.map((u: any, i: number) => {
                      const progress = getReputationProgress(u.reputation ?? 0);
                      const medal =
                        i === 0 ? styles.medalGold : i === 1 ? styles.medalSilver : i === 2 ? styles.medalBronze : styles.medalRest;
                      return (
                        <li key={u.id} className={styles.rankRow}>
                          <span className={`${styles.medal} ${medal}`}>{i + 1}</span>
                          <span className={styles.rankInfo}>
                            <span className={styles.rankName}>{u.username}</span>
                            <span className={styles.rankMeta}>
                              {progress.current.emoji} {t(`reputation.level.${progress.current.key}`)}
                              {' · '}
                              {roleLabel(u.role)}
                            </span>
                          </span>
                          <span className={styles.rankPts}>
                            {progress.points} {t('reputation.points')}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}

        {!loading &&
          tab === 'foods' &&
          foods.map((f) => (
            <div key={f.id} className={styles.rowCard}>
              <div className={styles.rowBody}>
                <div className={styles.rowTitle}>{f.nameHu || f.name}</div>
                <span className={`${styles.pill} ${statusClass(f.status)}`}>{foodStatusLabel(f.status)}</span>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionMint}`}
                  onClick={() => adminApi.setFoodStatus(f.id, 'VERIFIED').then(load)}
                >
                  <IconCheck size={18} color={Colors.dashboard.stroke} />
                  {t('adminPage.approve')}
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionPeach}`}
                  onClick={() => adminApi.setFoodStatus(f.id, 'BANNED').then(load)}
                >
                  <IconClose size={18} color={Colors.dashboard.stroke} />
                  {t('adminPage.ban')}
                </button>
              </div>
            </div>
          ))}

        {!loading &&
          tab === 'users' &&
          users.map((u) => {
            const progress = getReputationProgress(u.reputation ?? 0);
            return (
              <div key={u.id} className={styles.rowCard}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTitle}>{u.username}</div>
                  <div className={styles.rowMeta}>
                    {roleLabel(u.role)} · {tierLabel(u.tier ?? u.profile?.tier)}
                  </div>
                </div>
                <span className={styles.userRank} style={{ background: progress.current.tint }}>
                  {progress.current.emoji} {t(`reputation.level.${progress.current.key}`)}
                  <strong>
                    {progress.points} {t('reputation.points')}
                  </strong>
                </span>
              </div>
            );
          })}

        {!loading &&
          tab === 'recipes' &&
          recipes.map((r) => (
            <div key={r.id} className={styles.rowCard}>
              <div className={styles.rowBody}>
                <div className={styles.rowTitle}>{r.title}</div>
                <div className={styles.rowMeta}>
                  {r.createdBy?.username} · {r.sourceType}
                </div>
                <span className={`${styles.pill} ${statusClass(r.status)}`}>{foodStatusLabel(r.status)}</span>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionMint}`}
                  onClick={() => adminApi.approveRecipe(r.id).then(load)}
                >
                  <IconCheck size={18} color={Colors.dashboard.stroke} />
                  {t('adminPage.approve')}
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionPeach}`}
                  onClick={() => adminApi.rejectRecipe(r.id).then(load)}
                >
                  <IconClose size={18} color={Colors.dashboard.stroke} />
                  {t('adminPage.reject')}
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
