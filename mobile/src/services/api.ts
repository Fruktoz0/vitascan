import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3005';

let accessToken: string | null = null;
export function setAccessToken(token: string | null) { accessToken = token; }

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401 && retry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return request<T>(path, options, false);
    throw new ApiError(401, 'Lejárt munkamenet.');
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Ismeretlen hiba.');
  return data as T;
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync('refreshToken');
    if (!stored) return false;
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored }),
    });
    if (!res.ok) { await SecureStore.deleteItemAsync('refreshToken'); setAccessToken(null); return false; }
    const { accessToken: newAccess, refreshToken: newRefresh } = await res.json();
    setAccessToken(newAccess);
    await SecureStore.setItemAsync('refreshToken', newRefresh);
    return true;
  } catch { return false; }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { username: string; email: string; password: string; acceptedTerms: true }) =>
    request<{ user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: (refreshToken: string) =>
    request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
};

// ─── Onboarding ───────────────────────────────────────────────────────────────
export const onboardingApi = {
  getStatus: () => request<{ completed: boolean; steps: any }>('/onboarding/status'),
  complete: (data: any) => request<any>('/onboarding/complete', { method: 'POST', body: JSON.stringify({ ...data, acceptedTerms: true }) }),
  previewTdee: (data: any) => request<any>('/onboarding/preview-tdee', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Stats ────────────────────────────────────────────────────────────────────
export const statsApi = {
  today: () => request<any>('/stats/today'),
  day: (date: string) => request<any>(`/stats/day?date=${date}`),
  weekly: () => request<any>('/stats/weekly'),
  monthly: (year: number, month: number) => request<any>(`/stats/monthly?year=${year}&month=${month}`),
  streak: () => request<{ streak: number; message: string }>('/stats/streak'),
};

// ─── Food ─────────────────────────────────────────────────────────────────────
export type FoodStatus = 'UNVERIFIED' | 'VERIFIED' | 'BANNED';

export interface Food {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  servingSize?: number;
  servingUnit?: string;
  status: FoodStatus;
  tier: 'FREE' | 'PREMIUM';
  isOFF?: boolean;
  score?: number;
  myVote?: 1 | -1 | null;
  source?: 'DB' | 'OFF' | 'OFF_NEW' | 'MANUAL' | 'SCAN' | 'SEARCH';
  creator?: { username: string; reputation: number };
  _count?: { votes: number };
}

export const foodApi = {
  search: (q: string, opts?: { limit?: number; offset?: number; includeOFF?: boolean }) => {
    const p = new URLSearchParams({ q, limit: String(opts?.limit ?? 20), offset: String(opts?.offset ?? 0), includeOFF: String(opts?.includeOFF ?? false) });
    return request<{ foods: Food[]; total: number; offCount: number }>(`/foods?${p}`);
  },
  getById: (id: string) => request<Food & { score: number; myVote: 1 | -1 | null }>(`/foods/${id}`),
  getByBarcode: (barcode: string) => request<Food & { source: string }>(`/foods/barcode/${barcode}`),
  create: (data: any) => request<Food>('/foods', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Food>) => request<Food>(`/foods/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  vote: (foodId: string, value: 1 | -1) =>
    request<{ action: 'added' | 'removed' | 'changed'; score: number; earnedExpertBadge?: boolean }>(
      `/foods/${foodId}/vote`, { method: 'POST', body: JSON.stringify({ value }) }
    ),
};

// ─── Logs ─────────────────────────────────────────────────────────────────────
export const logApi = {
  getToday: () => { const today = new Date().toISOString().split('T')[0]; return request<any>(`/logs?date=${today}`); },
  getByDate: (date: string) => request<any>(`/logs?date=${date}`),
  getRange: (from: string, to: string) => request<any>(`/logs?from=${from}&to=${to}`),
  create: (data: any) => request('/logs', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/logs/${id}`, { method: 'DELETE' }),
};

// ─── Water ────────────────────────────────────────────────────────────────────
export const waterApi = {
  getToday: () => request<{ logs: any[]; totalMl: number; goalMl: number }>('/water/today'),
  add: (amountMl: number) => request('/water', { method: 'POST', body: JSON.stringify({ amountMl }) }),
  delete: (id: string) => request(`/water/${id}`, { method: 'DELETE' }),
};

// ─── Profile ──────────────────────────────────────────────────────────────────
export const profileApi = {
  getMe: () => request<any>('/profile/me'),
  update: (data: any) => request('/profile', { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── Premium ──────────────────────────────────────────────────────────────────
export const premiumApi = {
  getStatus: () => request<any>('/premium/status'),
  getFeatures: () => request<any>('/premium/features'),
  // DEV only:
  devUpgrade: () => request('/premium/upgrade', { method: 'POST' }),
  devDowngrade: () => request('/premium/downgrade', { method: 'POST' }),
};

// ─── Export ───────────────────────────────────────────────────────────────────
export const exportApi = {
  preview: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return request<{
      from: string; to: string; days: number;
      logCount: number; waterCount: number; sheets: string[];
    }>(`/export/preview?${p}`);
  },
  // A tényleges letöltés FileSystem.downloadAsync-kal történik az ExportEngine-ben
  getDownloadUrl: (from?: string, to?: string) => {
    const base = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3005';
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return `${base}/export?${p}`;
  },
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  getDashboard: () => request<{
    stats: {
      totalUsers: number; newUsersToday: number;
      totalFoods: number; pendingFoods: number; bannedFoods: number;
      totalLogs: number; logsToday: number; premiumUsers: number;
    };
    topContributors: { id: string; username: string; reputation: number; role: string }[];
  }>('/admin/dashboard'),
  getFoods: (opts?: { status?: string; q?: string; limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (opts?.status) p.set('status', opts.status);
    if (opts?.q) p.set('q', opts.q);
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.offset) p.set('offset', String(opts.offset));
    return request<{ foods: any[]; total: number }>(`/admin/foods?${p}`);
  },
  deleteFood: (id: string) => request(`/admin/foods/${id}`, { method: 'DELETE' }),
  setFoodStatus: (id: string, status: 'UNVERIFIED' | 'VERIFIED' | 'BANNED') =>
    request(`/admin/foods/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getUsers: (opts?: { q?: string; role?: string; limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (opts?.q) p.set('q', opts.q);
    if (opts?.role) p.set('role', opts.role);
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.offset) p.set('offset', String(opts.offset));
    return request<{ users: any[]; total: number }>(`/admin/users?${p}`);
  },
  setUserRole: (id: string, role: 'USER' | 'ADMIN') =>
    request(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  setUserTier: (id: string, tier: 'FREE' | 'PREMIUM') =>
    request(`/admin/users/${id}/tier`, { method: 'PATCH', body: JSON.stringify({ tier }) }),
  softDeleteUser: (id: string) =>
    request(`/admin/users/${id}`, { method: 'DELETE' }),
  adjustReputation: (id: string, delta: number, reason?: string) =>
    request(`/admin/users/${id}/reputation`, { method: 'PATCH', body: JSON.stringify({ delta, reason }) }),
  getBadges: () =>
    request<{ experts: any[]; threshold: number; total: number }>('/admin/badges'),
};
