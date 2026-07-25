import * as Storage from './storage';

/** Same-origin `/api` (Vite proxy) or absolute URL from env. */
const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '/api').replace(/\/$/, '');

const API_VERBOSE = import.meta.env.DEV && import.meta.env.VITE_API_DEBUG === '1';

function apiDebug(...args: unknown[]) {
  if (API_VERBOSE) console.log(...args);
}

let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Human-readable message for UI (always returns something useful). */
export function getErrorMessage(err: unknown, fallback = 'Váratlan hiba történt.'): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

function toNetworkApiError(error: unknown): ApiError {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(lower)
  ) {
    const isHttpsPage =
      typeof window !== 'undefined' && window.location?.protocol === 'https:';
    const apiLooksHttp = API_BASE.startsWith('http://');
    if (isHttpsPage && apiLooksHttp) {
      return new ApiError(
        0,
        'A böngésző blokkolta a kérést (HTTPS oldal → HTTP API). Használd a /api proxyt vagy HTTPS API-t.',
      );
    }
    return new ApiError(
      0,
      'Nem érhető el a szerver. Ellenőrizd a hálózatot, az API futását, és a VITE_API_URL / proxy beállítást.',
    );
  }
  return new ApiError(0, raw.trim() || 'Váratlan hiba történt a kérés közben.');
}

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshAccessTokenFromStorage(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const run = async (): Promise<boolean> => {
    try {
      const stored = await Storage.getItem('refreshToken');
      if (!stored) return false;
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored }),
      });
      if (!res.ok) {
        setAccessToken(null);
        return false;
      }
      const { accessToken: newAccess, refreshToken: newRefresh } = await res.json();
      setAccessToken(newAccess);
      await Storage.setItem('refreshToken', newRefresh);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    }
  };

  refreshInFlight = run().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const url = `${API_BASE}${path}`;
  apiDebug(`[API] ${options.method || 'GET'} ${url}`);

  try {
    const response = await fetch(url, { ...options, headers });
    apiDebug(`[API] status ${response.status}`);

    const isAuthForm =
      path.startsWith('/auth/login') || path.startsWith('/auth/register');

    if (response.status === 401 && retry && !isAuthForm) {
      apiDebug('[API] 401 → refresh');
      const refreshed = await refreshAccessTokenFromStorage();
      if (refreshed) return request<T>(path, options, false);
      throw new ApiError(401, 'A hitelesítés frissítése sikertelen. Próbáld újra később.');
    }

    const responseText = await response.text();
    apiDebug('[API] body', responseText);

    let data: any = null;
    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new ApiError(
          response.status,
          response.ok
            ? 'Érvénytelen válasz a szervertől.'
            : `Szerver hiba (HTTP ${response.status}, nem JSON).`,
        );
      }
    }

    if (!response.ok) {
      const msg =
        (typeof data?.error === 'string' && data.error) ||
        (typeof data?.message === 'string' && data.message) ||
        (response.status === 401
          ? 'Hibás email vagy jelszó.'
          : response.status === 403
            ? 'Nincs jogosultság ehhez a művelethez.'
            : response.status === 404
              ? 'A kért erőforrás nem található.'
              : response.status === 429
                ? 'Túl sok kérés. Várj egy percet, majd próbáld újra.'
                : response.status >= 500
                  ? `Szerverhiba (HTTP ${response.status}).`
                  : `A kérés sikertelen (HTTP ${response.status}).`);
      throw new ApiError(response.status, msg);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw toNetworkApiError(error);
  }
}

export const authApi = {
  register: (data: { username: string; email: string; password: string; acceptedTerms: true }) =>
    request<{ user: unknown }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: UserDto }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: (refreshToken: string) =>
    request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
};

interface UserDto {
  id: string;
  username: string;
  email: string;
  role: string;
}

export const statsApi = {
  today: () => request<any>('/stats/today'),
  day: (date: string) => request<any>(`/stats/day?date=${date}`),
  weekly: () => request<any>('/stats/weekly'),
  monthly: (year: number, month: number) => request<any>(`/stats/monthly?year=${year}&month=${month}`),
  streak: () => request<{ streak: number; message: string }>('/stats/streak'),
};

export type FoodStatus = 'UNVERIFIED' | 'VERIFIED' | 'BANNED';

export type FoodOrigin = 'local' | 'off' | 'usda' | 'external';

export interface Food {
  id: string;
  name: string;
  nameHu?: string;
  nameEn?: string;
  displayName?: string;
  brand?: string;
  barcode?: string;
  externalId?: string;
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
  score?: number;
  myVote?: 1 | -1 | null;
  source?: 'INTERNAL' | 'USER_SCAN' | 'EXTERNAL_API' | 'MANUAL' | 'SCAN' | 'SEARCH';
  origin?: FoodOrigin;
  isFavorite?: boolean;
  creator?: { username: string; reputation: number };
  _count?: { votes: number };
}

export const foodApi = {
  search: (q: string, opts?: { limit?: number; offset?: number; mine?: boolean }) => {
    const p = new URLSearchParams({ q, limit: String(opts?.limit ?? 20), offset: String(opts?.offset ?? 0) });
    if (opts?.mine) p.set('mine', '1');
    return request<{ foods: Food[]; total: number }>(`/foods?${p}`);
  },
  recent: (limit = 20) =>
    request<{ foods: Food[]; total: number }>(`/foods/recent?limit=${limit}`),
  frequent: (limit = 20) =>
    request<{ foods: Food[]; total: number }>(`/foods/frequent?limit=${limit}`),
  favorites: (limit = 50) =>
    request<{ foods: Food[]; total: number }>(`/foods/favorites?limit=${limit}`),
  addFavorite: (id: string) =>
    request<{ isFavorite: boolean }>(`/foods/${id}/favorite`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  removeFavorite: (id: string) =>
    request<{ isFavorite: boolean }>(`/foods/${id}/favorite`, { method: 'DELETE' }),
  getById: (id: string) => request<Food & { score: number; myVote: 1 | -1 | null }>(`/foods/${id}`),
  getByBarcode: (barcode: string) => request<Food & { source: string }>(`/foods/barcode/${barcode}`),
  create: (data: unknown) => request<Food>('/foods', { method: 'POST', body: JSON.stringify(data) }),
  aiRecognize: (data: {
    mode: 'photo' | 'text';
    text?: string;
    imageBase64?: string;
    mimeType?: string;
    locale?: 'hu' | 'en';
  }) =>
    request<{
      dishName: string;
      ingredients: Array<{
        name: string;
        amountG: number;
        kcal: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber?: number;
        sugar?: number;
      }>;
      remaining: number;
      limit: number;
    }>('/foods/ai-recognize', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Food>) =>
    request<Food>(`/foods/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  vote: (foodId: string, value: 1 | -1) =>
    request<{
      action: 'added' | 'removed' | 'changed';
      score: number;
      status?: FoodStatus;
      myVote?: 1 | -1 | null;
      earnedExpertBadge?: boolean;
    }>(`/foods/${foodId}/vote`, { method: 'POST', body: JSON.stringify({ value }) }),
};

export const logApi = {
  getToday: () => {
    const today = new Date().toISOString().split('T')[0];
    return request<any>(`/logs?date=${today}`);
  },
  getByDate: (date: string) => request<any>(`/logs?date=${date}`),
  getRange: (from: string, to: string) => request<any>(`/logs?from=${from}&to=${to}`),
  create: (data: unknown) => request('/logs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request(`/logs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/logs/${id}`, { method: 'DELETE' }),
};

export type DailyAnalysisResult = {
  date: string;
  content: string | null;
  generationCount: number;
  remaining: number;
  updatedAt: string | null;
};

export const analysisApi = {
  get: (date: string) => request<DailyAnalysisResult>(`/analysis?date=${date}`),
  generate: (date: string, locale?: 'hu' | 'en') => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const offMin = -d.getTimezoneOffset();
    const sign = offMin >= 0 ? '+' : '-';
    const oh = pad(Math.floor(Math.abs(offMin) / 60));
    const om = pad(Math.abs(offMin) % 60);
    const localTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${oh}:${om}`;
    return request<DailyAnalysisResult>('/analysis', {
      method: 'POST',
      body: JSON.stringify({ date, localTime, ...(locale ? { locale } : {}) }),
    });
  },
};

export const waterApi = {
  getToday: () =>
    request<{ logs: any[]; log: any | null; totalMl: number; goalMl: number }>('/water/today'),
  getByDate: (date: string) =>
    request<{ logs: any[]; log: any | null; totalMl: number; goalMl: number }>(`/water?date=${date}`),
  /** Napi total módosítása (pozitív = hozzáadás, negatív = levonás). */
  adjust: (deltaMl: number, date?: string) =>
    request<{ logs: any[]; log: any | null; totalMl: number; goalMl: number }>('/water', {
      method: 'POST',
      body: JSON.stringify({ deltaMl, ...(date ? { date } : {}) }),
    }),
  /** Legacy: pozitív hozzáadás. */
  add: (amountMl: number, date?: string) =>
    request<{ logs: any[]; log: any | null; totalMl: number; goalMl: number }>('/water', {
      method: 'POST',
      body: JSON.stringify({ amountMl, ...(date ? { date } : {}) }),
    }),
  delete: (id: string) => request(`/water/${id}`, { method: 'DELETE' }),
};

export const weightApi = {
  getByDate: (date: string) =>
    request<{
      log: any | null;
      weightKg: number | null;
      deltaKg: number;
      lastMeasuredAt: string | null;
    }>(`/weight?date=${date}`),
  setForDate: (date: string, weightKg: number) =>
    request<{
      log: any;
      weightKg: number | null;
      deltaKg: number;
      lastMeasuredAt: string | null;
    }>('/weight', { method: 'POST', body: JSON.stringify({ date, weightKg }) }),
};

export type BodyPart = 'ARM' | 'THIGH' | 'WAIST' | 'FOREARM' | 'HIP' | 'CHEST';

export type BodyAnalysisContent = {
  headline: string;
  summary: string;
  positives: string[];
  concerns: string[];
  suggestions: string[];
};

export const bodyApi = {
  summary: () =>
    request<{
      parts: Array<{ bodyPart: BodyPart; valueCm: number | null; loggedDate: string | null }>;
      goals: Array<{ bodyPart: BodyPart; goalCm: number }>;
    }>('/body/summary'),
  create: (data: { bodyPart: BodyPart; valueCm: number; date: string }) =>
    request('/body', { method: 'POST', body: JSON.stringify(data) }),
  history: (bodyPart: BodyPart) =>
    request<{
      bodyPart: BodyPart;
      latest: {
        id: string;
        valueCm: number;
        loggedDate: string;
        updatedAt: string;
        deltaCm: number | null;
      } | null;
      items: Array<{
        id: string;
        valueCm: number;
        loggedDate: string;
        updatedAt: string;
        deltaCm: number | null;
      }>;
      monthlyChangeCm: number | null;
      goalCm: number | null;
    }>(`/body/history?bodyPart=${bodyPart}`),
  getGoals: () =>
    request<{ goals: Array<{ bodyPart: BodyPart; goalCm: number }> }>('/body/goals'),
  setGoals: (goals: Array<{ bodyPart: BodyPart; goalCm: number }>) =>
    request<{ goals: Array<{ bodyPart: BodyPart; goalCm: number }> }>('/body/goals', {
      method: 'PUT',
      body: JSON.stringify({ goals }),
    }),
  getAnalysis: () =>
    request<{
      content: string | null;
      generationCount: number;
      remaining: number;
      limit: number;
      updatedAt: string | null;
    }>('/body/analysis'),
  generateAnalysis: (locale?: 'hu' | 'en') =>
    request<{
      content: string;
      analysis: BodyAnalysisContent;
      generationCount: number;
      remaining: number;
      limit: number;
      updatedAt: string;
    }>('/body/analysis', {
      method: 'POST',
      body: JSON.stringify(locale ? { locale } : {}),
    }),
};

export const profileApi = {
  getMe: () => request<any>('/profile/me'),
  update: (data: unknown) => request('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  aiCalculateGoals: (data?: { goal?: 'LOSE' | 'MAINTAIN' | 'GAIN'; locale?: 'hu' | 'en' }) =>
    request<{ profile: any; goals: any }>('/profile/ai-calculate-goals', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),
};

export const premiumApi = {
  getStatus: () => request<any>('/premium/status'),
  getFeatures: () => request<any>('/premium/features'),
  devUpgrade: () => request('/premium/upgrade', { method: 'POST' }),
  devDowngrade: () => request('/premium/downgrade', { method: 'POST' }),
};

export const exportApi = {
  preview: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return request<{
      from: string;
      to: string;
      days: number;
      logCount: number;
      waterCount: number;
      sheets: string[];
    }>(`/export/preview?${p}`);
  },
  getDownloadUrl: (from?: string, to?: string) => {
    const base = API_BASE;
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return `${base}/export?${p}`;
  },
};

export const adminApi = {
  getDashboard: () =>
    request<{
      stats: {
        totalUsers: number;
        newUsersToday: number;
        totalFoods: number;
        pendingFoods: number;
        bannedFoods: number;
        totalLogs: number;
        logsToday: number;
        premiumUsers: number;
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
  softDeleteUser: (id: string) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  adjustReputation: (id: string, delta: number, reason?: string) =>
    request(`/admin/users/${id}/reputation`, { method: 'PATCH', body: JSON.stringify({ delta, reason }) }),
  getBadges: () => request<{ experts: any[]; threshold: number; total: number }>('/admin/badges'),
};
