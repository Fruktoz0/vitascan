import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as adminApi from '../../api/admin';
import type { DashboardAnalytics, KeyCount } from '../../api/admin';

const CHART_H = 260;
const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7', '#64748b'];

const HU_STATUS: Record<string, string> = {
  UNVERIFIED: 'Függőben',
  VERIFIED: 'Ellenőrzött',
  BANNED: 'Tiltott',
};
const HU_TIER: Record<string, string> = { FREE: 'Ingyenes', PREMIUM: 'Prémium' };
const HU_SOURCE: Record<string, string> = {
  INTERNAL: 'Belső',
  USER_SCAN: 'Felhasználói scan',
  EXTERNAL_API: 'Külső API',
};
const HU_MEAL: Record<string, string> = {
  BREAKFAST: 'Reggeli',
  LUNCH: 'Ebéd',
  DINNER: 'Vacsora',
  SNACK: 'Nassolnivaló',
  OTHER: 'Egyéb',
};
const HU_ROLE: Record<string, string> = { USER: 'Felhasználó', ADMIN: 'Admin' };
const HU_GOAL: Record<string, string> = { LOSE: 'Fogyás', MAINTAIN: 'Megtartás', GAIN: 'Hízás' };
const HU_GENDER: Record<string, string> = { MALE: 'Férfi', FEMALE: 'Nő', OTHER: 'Egyéb' };
const HU_ACTIVITY: Record<string, string> = {
  SEDENTARY: 'Ülő',
  LIGHT: 'Enyhe',
  MODERATE: 'Közepes',
  ACTIVE: 'Aktív',
  VERY_ACTIVE: 'Nagyon aktív',
};

function mapKeyCounts(rows: KeyCount[], labels: Record<string, string>): { name: string; value: number }[] {
  return rows.map((r) => ({
    name: labels[r.key] ?? r.key,
    value: r.count,
  }));
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="admin-chart-card">
      <div className="admin-chart-card-head">
        <h3 className="admin-chart-card-title">{title}</h3>
        {subtitle && <p className="admin-chart-card-sub">{subtitle}</p>}
      </div>
      <div className="admin-chart-body">{children}</div>
    </section>
  );
}

function formatDateTick(s: string) {
  const [, m, d] = s.split('-');
  return `${m}.${d}.`;
}

export function DashboardPage() {
  const [data, setData] = useState<adminApi.DashboardResponse | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [dash, a] = await Promise.all([adminApi.getDashboard(), adminApi.getDashboardAnalytics()]);
      setData(dash);
      setAnalytics(a);
    } catch {
      setData(null);
      setAnalytics(null);
      setError('Nem sikerült betölteni az áttekintést.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const voteBars = useMemo(() => {
    if (!analytics) return [{ name: 'Fel', value: 0 }, { name: 'Le', value: 0 }];
    let up = 0;
    let down = 0;
    for (const v of analytics.votes) {
      if (v.value === 1) up = v.count;
      if (v.value === -1) down = v.count;
    }
    return [
      { name: 'Fel szavazat', value: up },
      { name: 'Le szavazat', value: down },
    ];
  }, [analytics]);

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-boot">
          <div className="admin-spinner" aria-hidden />
        </div>
      </div>
    );
  }

  if (error || !data || !analytics) {
    return (
      <div className="admin-page">
        <div className="admin-page-head">
          <h1 className="admin-page-title">Áttekintés</h1>
        </div>
        <div className="admin-alert admin-alert-error">{error}</div>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={() => void load()}>
          Újrapróbálás
        </button>
      </div>
    );
  }

  const s = data.stats;
  const t = analytics.totals;

  const foodStatusData = mapKeyCounts(analytics.foodStatus, HU_STATUS);
  const foodTierData = mapKeyCounts(analytics.foodTier, HU_TIER);
  const foodSourceData = mapKeyCounts(analytics.foodSource, HU_SOURCE);
  const mealData = mapKeyCounts(analytics.mealTypes, HU_MEAL);
  const logSrcData = mapKeyCounts(analytics.logSources, {
    MANUAL: 'Kézi',
    SCAN: 'Scan',
    SEARCH: 'Keresés',
  });
  const roleData = mapKeyCounts(analytics.usersByRole, HU_ROLE);
  const goalData = mapKeyCounts(analytics.profilesByGoal, HU_GOAL);
  const genderData = mapKeyCounts(analytics.profilesByGender, HU_GENDER);
  const activityData = mapKeyCounts(analytics.activityLevels, HU_ACTIVITY);

  const tooltipStyle = {
    backgroundColor: 'var(--admin-surface)',
    border: '1px solid var(--admin-border)',
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-page-title">Áttekintés</h1>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void load()}>
          Frissítés
        </button>
      </div>

      <div className="admin-stat-grid">
        <article className="admin-stat-card">
          <div className="admin-stat-label">Felhasználók</div>
          <div className="admin-stat-value">{s.totalUsers}</div>
          <div className="admin-stat-hint">+{s.newUsersToday} ma</div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-label">Prémium profil</div>
          <div className="admin-stat-value">{s.premiumUsers}</div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-label">Ételek (nem tiltott)</div>
          <div className="admin-stat-value">{s.totalFoods}</div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-label">Függőben</div>
          <div className="admin-stat-value admin-stat-warn">{s.pendingFoods}</div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-label">Tiltott ételek</div>
          <div className="admin-stat-value admin-stat-danger">{s.bannedFoods}</div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-label">Napló bejegyzések</div>
          <div className="admin-stat-value">{s.totalLogs}</div>
          <div className="admin-stat-hint">{s.logsToday} ma</div>
        </article>
      </div>

      <section className="admin-panel admin-analytics-intro">
        <h2 className="admin-panel-title">Adatbázis statisztikák</h2>
        <p className="admin-muted">
          Az alábbi grafikonok az utolsó <strong>{analytics.days} nap</strong> adatait mutatják (idősorok), illetve a teljes
          adatbázis aktuális eloszlását (kördiagramok / oszlopdiagramok). Forrás: PostgreSQL aggregátumok.
        </p>
        <div className="admin-analytics-totals">
          <span className="admin-analytics-pill">Összes étel: <strong>{t.foodsAll}</strong></span>
          <span className="admin-analytics-pill">Ellenőrzött étel: <strong>{t.foodsVerified}</strong></span>
          <span className="admin-analytics-pill">Szavazatok: <strong>{t.votes}</strong></span>
          <span className="admin-analytics-pill">Víznapló: <strong>{t.waterLogs}</strong> bejegyzés</span>
          <span className="admin-analytics-pill">Ivott víz összesen: <strong>{(t.waterMlTotal / 1000).toFixed(1)}</strong> l</span>
          <span className="admin-analytics-pill">Testsúly napló: <strong>{t.weightLogs}</strong></span>
          <span className="admin-analytics-pill">Soft-törölt user: <strong>{t.softDeletedUsers}</strong></span>
          <span className="admin-analytics-pill">Aktív refresh token: <strong>{t.activeRefreshTokens}</strong></span>
        </div>
      </section>

      <h2 className="admin-analytics-section-title">Idősorok</h2>
      <div className="admin-chart-grid">
        <ChartCard title="Új felhasználók" subtitle="Regisztrációk száma naponta">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <AreaChart data={analytics.usersByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => String(l)} />
              <Area type="monotone" dataKey="count" name="Új user" stroke="#6366f1" fill="url(#gUsers)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Új ételek" subtitle="Létrehozott étel rekordok naponta">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <LineChart data={analytics.foodsByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" name="Új étel" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Napló bejegyzések" subtitle="DailyLog rekordok naponta">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <AreaChart data={analytics.logsByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gLogs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" name="Napló" stroke="#f59e0b" fill="url(#gLogs)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Víznapló" subtitle="Bejegyzések száma és ivott víz (ml) naponta">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={analytics.waterByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 10 }} stroke="#06b6d4" width={32} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#0ea5e9" width={44} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar yAxisId="left" dataKey="count" name="Bejegyzés" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="totalMl" name="ml (össz.)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <h2 className="admin-analytics-section-title">Ételek eloszlása</h2>
      <div className="admin-chart-grid admin-chart-grid-3">
        <ChartCard title="Státusz">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <PieChart>
              <Pie data={foodStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {foodStatusData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Forrás">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <PieChart>
              <Pie data={foodSourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {foodSourceData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Szint (FREE / PREMIUM)">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={foodTierData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} stroke="var(--admin-muted)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" name="Darab" fill="#a855f7" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <h2 className="admin-analytics-section-title">Naplózás és szavazás</h2>
      <div className="admin-chart-grid admin-chart-grid-3">
        <ChartCard title="Étkezés típus">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={mealData} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={48} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" name="Darab" fill="#ec4899" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Napló forrás">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={logSrcData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" name="Darab" fill="#14b8a6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Szavazatok" subtitle="Teljes adatbázis">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={voteBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={44} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {voteBars.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <h2 className="admin-analytics-section-title">Felhasználók és profilok</h2>
      <div className="admin-chart-grid admin-chart-grid-2">
        <ChartCard title="Szerepkör">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={roleData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Cél (profil)">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={goalData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Nem (kitöltött profil)">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={genderData.length ? genderData : [{ name: 'Nincs adat', value: 0 }]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#ec4899" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Aktivitási szint">
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={activityData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={52} stroke="var(--admin-muted)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--admin-muted)" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#64748b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <section className="admin-panel">
        <h2 className="admin-panel-title">Top közreműködők</h2>
        {data.topContributors.length === 0 ? (
          <p className="admin-muted">Még nincs reputáció szerinti lista.</p>
        ) : (
          <ul className="admin-list-plain">
            {data.topContributors.map((u, i) => (
              <li key={u.id} className="admin-contributor-row">
                <span className="admin-contributor-rank">{i + 1}</span>
                <span className="admin-contributor-name">{u.username}</span>
                <span className="admin-badge admin-badge-muted">{u.role}</span>
                <span className="admin-contributor-rep">{u.reputation} pt</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
