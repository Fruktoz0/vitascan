import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Colors } from '../design/tokens';
import { IconArrowBack } from '../components/ui/Icons';
import { adminApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import styles from './AdminPage.module.css';

type AdminTab = 'dashboard' | 'foods' | 'users' | 'recipes';

export default function AdminPage() {
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
    } catch {}
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      navigate('/home', { replace: true });
      return;
    }
    load();
  }, [user, navigate, load]);

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>Admin</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.tabs}>
        {(
          [
            ['dashboard', '📊'],
            ['foods', '🍽️'],
            ['users', '👥'],
            ['recipes', '📖'],
          ] as const
        ).map(([id, emoji]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
            onClick={() => setTab(id)}
          >
            {emoji} {id}
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
          <div className={styles.grid}>
            {[
              ['Users', dashboard.stats.totalUsers],
              ['New today', dashboard.stats.newUsersToday],
              ['Foods', dashboard.stats.totalFoods],
              ['Pending foods', dashboard.stats.pendingFoods],
              ['Pending recipes', dashboard.stats.pendingRecipes ?? 0],
              ['Logs today', dashboard.stats.logsToday],
              ['Premium', dashboard.stats.premiumUsers],
            ].map(([label, value]) => (
              <div key={String(label)} className={styles.stat}>
                <div className={styles.statValue}>{value}</div>
                <div className={styles.statLabel}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'foods' &&
          foods.map((f) => (
            <div key={f.id} className={styles.row}>
              <div>
                <div className={styles.rowTitle}>{f.nameHu || f.name}</div>
                <div className={styles.rowMeta}>{f.status}</div>
              </div>
              <div className={styles.rowActions}>
                <button type="button" onClick={() => adminApi.setFoodStatus(f.id, 'VERIFIED').then(load)}>
                  ✅
                </button>
                <button type="button" onClick={() => adminApi.setFoodStatus(f.id, 'BANNED').then(load)}>
                  🚫
                </button>
              </div>
            </div>
          ))}

        {!loading && tab === 'users' &&
          users.map((u) => (
            <div key={u.id} className={styles.row}>
              <div>
                <div className={styles.rowTitle}>{u.username}</div>
                <div className={styles.rowMeta}>
                  {u.role} · {u.tier ?? 'FREE'} · rep {u.reputation ?? 0}
                </div>
              </div>
            </div>
          ))}

        {!loading && tab === 'recipes' &&
          recipes.map((r) => (
            <div key={r.id} className={styles.row}>
              <div>
                <div className={styles.rowTitle}>{r.title}</div>
                <div className={styles.rowMeta}>
                  {r.createdBy?.username} · {r.sourceType} · {r.status}
                </div>
              </div>
              <div className={styles.rowActions}>
                <button type="button" onClick={() => adminApi.approveRecipe(r.id).then(load)}>
                  ✅
                </button>
                <button type="button" onClick={() => adminApi.rejectRecipe(r.id).then(load)}>
                  🚫
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
