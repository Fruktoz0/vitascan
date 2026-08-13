import * as Storage from './storage';

/** Same-origin `/api` (Vite proxy) or absolute URL from env. */
const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '/api').replace(/\/$/, '');

/** Absolute API base for display / OAuth setup. */
export function getApiBaseUrl(): string {
  if (API_BASE.startsWith('http')) return API_BASE;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${API_BASE.startsWith('/') ? '' : '/'}${API_BASE}`;
  }
  return API_BASE;
}

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
  payload?: Record<string, unknown>;
  constructor(status: number, message: string, payload?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/** Human-readable message for UI (always returns something useful). */
export function getErrorMessage(err: unknown, fallback = 'Váratlan hiba történt.'): string {
  let raw = '';
  if (err instanceof ApiError) raw = err.message || fallback;
  else if (err instanceof Error && err.message.trim()) raw = err.message;
  else raw = fallback;
  return clampUiMessage(raw, fallback);
}

/** Keep dialogs readable — API/Prisma dumps must not blow up the UI. */
export function clampUiMessage(message: string, fallback = 'Váratlan hiba történt.', max = 220): string {
  const cleaned = String(message ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

function toNetworkApiError(error: unknown): ApiError {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed|aborted|the operation was aborted/i.test(lower)
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
    if (/aborted|timeout/i.test(lower)) {
      return new ApiError(
        0,
        'A kérés megszakadt vagy túl sokáig tartott. Próbálj kisebb fotót, vagy ismételd meg.',
      );
    }
    return new ApiError(
      0,
      'Nem érhető el a szerver. Ellenőrizd a hálózatot, az API futását, és a VITE_API_URL / proxy beállítást.',
    );
  }
  return new ApiError(0, raw.trim() || 'Váratlan hiba történt a kérés közben.');
}

/** Abort signal for slow endpoints; older browsers without AbortSignal.timeout just wait. */
function requestTimeout(ms: number): { signal?: AbortSignal } {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(ms) };
  }
  return {};
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
    ...(options.headers as Record<string, string>),
  };
  // Fastify rejects empty bodies when Content-Type is application/json (DELETE/GET → 400 Bad Request).
  const hasBody = options.body != null && options.body !== '';
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (
    hasBody &&
    !isFormData &&
    headers['Content-Type'] == null &&
    headers['content-type'] == null
  ) {
    headers['Content-Type'] = 'application/json';
  }
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
            : response.status === 502 || response.status === 504
              ? 'A felismerés nem ért célba (időtúllépés vagy túl nagy kép). Próbálj kisebb/élesebb fotót, vagy ismételd meg.'
              : response.status === 413
                ? 'A kép túl nagy. Próbálj kisebb felbontású fotót.'
                : `Szerver hiba (HTTP ${response.status}).`,
        );
      }
    }

    if (!response.ok) {
      const rawError = typeof data?.error === 'string' ? data.error.trim() : '';
      const rawMessage = typeof data?.message === 'string' ? data.message.trim() : '';
      const isGenericEnglish =
        /^internal server error$/i.test(rawError) ||
        /^bad request$/i.test(rawError) ||
        /^unauthorized$/i.test(rawError) ||
        /^forbidden$/i.test(rawError) ||
        /^not found$/i.test(rawError);
      const preferred =
        (rawError && !isGenericEnglish ? rawError : '') ||
        (rawMessage && !isGenericEnglish ? rawMessage : '') ||
        '';
      const msg =
        preferred ||
        (response.status === 401
          ? 'Hibás email vagy jelszó.'
          : response.status === 403
            ? 'Nincs jogosultság ehhez a művelethez.'
            : response.status === 404
              ? 'A kért erőforrás nem található.'
              : response.status === 409
                ? 'Ez az adat már létezik.'
                : response.status === 429
                  ? 'Túl sok kérés. Várj egy percet, majd próbáld újra.'
                  : response.status === 413
                    ? 'A kép túl nagy. Próbálj kisebb felbontású fotót.'
                  : response.status === 502 || response.status === 504
                    ? 'A felismerés nem ért célba. Próbáld újra, vagy küldj kisebb fotót.'
                  : response.status >= 500
                    ? `Szerverhiba (HTTP ${response.status}).`
                    : `A kérés sikertelen (HTTP ${response.status}).`);
      throw new ApiError(
        response.status,
        msg,
        data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined,
      );
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
  weekly: (opts?: { weekStart?: string; weeksBack?: number }) => {
    const p = new URLSearchParams();
    if (opts?.weekStart) p.set('weekStart', opts.weekStart);
    if (opts?.weeksBack != null) p.set('weeksBack', String(opts.weeksBack));
    const q = p.toString();
    return request<WeeklyStatsResult>(`/stats/weekly${q ? `?${q}` : ''}`);
  },
  monthly: (year: number, month: number) => request<any>(`/stats/monthly?year=${year}&month=${month}`),
  loggedDays: (year: number, month: number) =>
    request<{
      year: number;
      month: number;
      dailyKcalGoal: number;
      dates: string[];
      days: { date: string; kcal: number }[];
    }>(`/stats/logged-days?year=${year}&month=${month}`),
  streak: () => request<{ streak: number; message: string }>('/stats/streak'),
};

export type WeeklyDayStats = {
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  logCount: number;
};

export type WeeklyStatsSummary = {
  avgKcal: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  totalKcal: number;
  loggedDays: number;
  emptyDays?: number;
  daysOnTarget: number;
  avgDeltaVsGoal: number;
  highestDay: { date: string; kcal: number } | null;
  lowestDay: { date: string; kcal: number } | null;
  kcalRange: number | null;
  mostLoggedDay: { date: string; logCount: number } | null;
  bestDayVsGoal?: { date: string; kcal: number; delta: number } | null;
  worstDayVsGoal?: { date: string; kcal: number; delta: number } | null;
  macroAdherence?: {
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  };
  dominantMeal?: { mealType: string; avgKcal: number; sharePct: number } | null;
  prevWeek?: {
    avgKcal: number;
    loggedDays: number;
    avgDeltaVsGoal: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    deltaAvgKcal: number;
  };
  body?: {
    weightDeltaKg: number | null;
    firstWeightKg: number | null;
    lastWeightKg: number | null;
    firstWeightDate: string | null;
    lastWeightDate: string | null;
    measurements: Array<{
      bodyPart: string;
      firstCm: number;
      lastCm: number;
      deltaCm: number;
      firstDate?: string | null;
      lastDate?: string | null;
    }>;
  } | null;
};

export type WeeklyStatsResult = {
  days: WeeklyDayStats[];
  avg: { kcal: number; protein: number; carbs: number; fat: number };
  mealAvg: Record<
    string,
    { kcal: number; protein: number; carbs: number; fat: number; daysWithMeal: number }
  >;
  mealDaily?: Record<
    string,
    Array<{ date: string; kcal: number; protein?: number; carbs?: number; fat?: number }>
  >;
  weightDaily?: Array<{ date: string; weightKg: number | null }>;
  from: string;
  to: string;
  goals?: {
    dailyKcalGoal: number;
    dailyProteinGoal: number;
    dailyCarbsGoal: number;
    dailyFatGoal: number;
    goal: string | null;
  };
  summary?: WeeklyStatsSummary;
};

export type FoodStatus = 'UNVERIFIED' | 'VERIFIED' | 'BANNED';

export type FoodOrigin = 'local' | 'off' | 'usda' | 'external';

export interface FoodComponent {
  id?: string;
  name: string;
  amountG: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  sortOrder?: number;
}

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
  isPrepared?: boolean;
  components?: FoodComponent[];
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
        brand?: string;
        barcode?: string;
        servingUnit?: string;
        servingSize?: number;
      }>;
      remaining: number;
      limit: number;
    }>('/foods/ai-recognize', {
      method: 'POST',
      body: JSON.stringify(data),
      // Fail with our own message before a proxy/tunnel answers with an HTML 502.
      ...requestTimeout(70_000),
    }),
  aiServingEstimate: (data: {
    name: string;
    brand?: string;
    unit: 'db' | 'adag' | 'ek' | 'szelet';
    locale?: 'hu' | 'en';
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    sugar?: number;
  }) =>
    request<{
      gramsPerUnit: number;
      remaining: number;
      limit: number;
    }>('/foods/ai-serving-estimate', { method: 'POST', body: JSON.stringify(data) }),
  aiLabelFill: (data: {
    imageBase64: string;
    mimeType?: string;
    locale?: 'hu' | 'en';
  }) =>
    request<{
      name: string;
      brand?: string;
      barcode?: string;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber?: number;
      sugar?: number;
      isApproximate: boolean;
      approximateNote?: string;
      remaining: number;
      limit: number;
    }>('/foods/ai-label-fill', {
      method: 'POST',
      body: JSON.stringify(data),
      ...requestTimeout(70_000),
    }),
  update: (id: string, data: Partial<Food> | Record<string, unknown>) =>
    request<Food>(`/foods/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  editHistory: (id: string) =>
    request<{ edits: Array<{ id: string; username: string; createdAt: string }> }>(
      `/foods/${id}/edits`,
    ),
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
  deleteGroup: (logGroupId: string) =>
    request(`/logs/group/${logGroupId}`, { method: 'DELETE' }),
};

export type DailyAnalysisResult = {
  date: string;
  content: string | null;
  generationCount: number;
  remaining: number;
  max?: number;
  updatedAt: string | null;
};

export type AnalysisKind = 'nutrition' | 'fitness' | 'coach' | 'mealSuggest' | 'weeklyNutrition';

export const analysisApi = {
  get: (date: string, kind: AnalysisKind = 'nutrition') =>
    request<DailyAnalysisResult>(`/analysis?date=${date}&kind=${kind}`),
  generate: (
    date: string,
    locale?: 'hu' | 'en',
    kind: AnalysisKind = 'nutrition',
    mealType?: string,
    opts?: { force?: boolean },
  ) => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const offMin = -d.getTimezoneOffset();
    const sign = offMin >= 0 ? '+' : '-';
    const oh = pad(Math.floor(Math.abs(offMin) / 60));
    const om = pad(Math.abs(offMin) % 60);
    const localTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${oh}:${om}`;
    return request<DailyAnalysisResult>('/analysis', {
      method: 'POST',
      body: JSON.stringify({
        date,
        localTime,
        kind,
        ...(locale ? { locale } : {}),
        ...(mealType ? { mealType } : {}),
        ...(opts?.force ? { force: true } : {}),
      }),
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
  setForDate: (date: string, totalMl: number) =>
    request<{ logs: any[]; log: any | null; totalMl: number; goalMl: number }>('/water', {
      method: 'POST',
      body: JSON.stringify({ date, totalMl }),
    }),
  history: () =>
    request<{
      latest: {
        id: string;
        totalMl: number;
        loggedDate: string;
        updatedAt: string;
        deltaMl: number | null;
      } | null;
      items: Array<{
        id: string;
        totalMl: number;
        loggedDate: string;
        updatedAt: string;
        deltaMl: number | null;
      }>;
      goalMl: number;
    }>('/water/history'),
  update: (id: string, data: { totalMl?: number; date?: string }) =>
    request(`/water/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/water/${id}`, { method: 'DELETE' }),
};

export type DayNote = {
  id: string;
  content: string;
  loggedDate: string;
  updatedAt: string;
};

export const dayNoteApi = {
  getByDate: (date: string) =>
    request<{ note: DayNote | null }>(`/day-notes?date=${encodeURIComponent(date)}`),
  save: (date: string, content: string) =>
    request<{ note: DayNote | null }>('/day-notes', {
      method: 'PUT',
      body: JSON.stringify({ date, content }),
    }),
};

export const weightApi = {
  getByDate: (date: string) =>
    request<{
      log: {
        id: string;
        weightKg: number;
        loggedDate: string;
        updatedAt: string;
      } | null;
      weightKg: number | null;
      suggestedWeightKg: number | null;
      deltaKg: number | null;
      lastMeasuredAt: string | null;
    }>(`/weight?date=${date}`),
  setForDate: (date: string, weightKg: number) =>
    request<{
      log: {
        id: string;
        weightKg: number;
        loggedDate: string;
        updatedAt: string;
      } | null;
      weightKg: number | null;
      suggestedWeightKg: number | null;
      deltaKg: number | null;
      lastMeasuredAt: string | null;
    }>('/weight', { method: 'POST', body: JSON.stringify({ date, weightKg }) }),
  history: () =>
    request<{
      latest: {
        id: string;
        weightKg: number;
        loggedDate: string;
        updatedAt: string;
        deltaKg: number | null;
      } | null;
      items: Array<{
        id: string;
        weightKg: number;
        loggedDate: string;
        updatedAt: string;
        deltaKg: number | null;
      }>;
      monthlyChangeKg: number | null;
    }>('/weight/history'),
  update: (id: string, data: { weightKg?: number; date?: string }) =>
    request(`/weight/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/weight/${id}`, { method: 'DELETE' }),
};

export type BodyPart = 'ARM' | 'THIGH' | 'WAIST' | 'FOREARM' | 'HIP' | 'CHEST' | 'CALF';

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
  update: (id: string, data: { valueCm?: number; date?: string }) =>
    request(`/body/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/body/${id}`, { method: 'DELETE' }),
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

export type FitnessHrPoint = { tMs: number; bpm: number };

export type FitnessWorkout = {
  id: string;
  activityType: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMin: number;
  activeEnergyKcal: number | null;
  distanceKm: number | null;
  steps: number | null;
  avgHeartrate: number | null;
  minHeartrate: number | null;
  maxHeartrate: number | null;
  restingHeartrate: number | null;
  pace: number | null;
  speedAvg: number | null;
  speedMax: number | null;
  elevationGain: number | null;
  elevationMin: number | null;
  elevationMax: number | null;
  floorsClimbed: number | null;
  vo2Max: number | null;
  respiratoryRate: number | null;
  mindfulMinutes: number | null;
  avgStressLevel: number | null;
  providerType: string | null;
  hrSeries: FitnessHrPoint[] | null;
  source: 'SHORTCUTS' | 'MANUAL' | 'FITNESSSYNCER';
  externalId: string | null;
  createdAt: string;
};

export type FitnessSyncerStatus = {
  status: 'DISCONNECTED' | 'CONNECTED' | 'ERROR';
  hasCredentials: boolean;
  hasClientId: boolean;
  connected: boolean;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  callbackUrl: string | null;
  oauthPending?: boolean;
  needsSync: boolean;
  cryptoConfigured: boolean;
};

export const fitnessApi = {
  getFsStatus: () => request<FitnessSyncerStatus>('/fitness/fitnesssyncer/status'),
  saveFsCredentials: (clientId: string, clientSecret: string) =>
    request<FitnessSyncerStatus>('/fitness/fitnesssyncer/credentials', {
      method: 'PUT',
      body: JSON.stringify({ clientId, clientSecret }),
    }),
  startFsConnect: () =>
    request<{ authorizeUrl: string; callbackUrl: string; hint?: string }>(
      '/fitness/fitnesssyncer/connect',
    ),
  exchangeFsPaste: (pasted: string) =>
    request<FitnessSyncerStatus>('/fitness/fitnesssyncer/exchange', {
      method: 'POST',
      body: JSON.stringify({ pasted }),
    }),
  disconnectFs: () => request<FitnessSyncerStatus>('/fitness/fitnesssyncer', { method: 'DELETE' }),
  sync: (days?: number) =>
    request<{
      ok: boolean;
      sources: number;
      workoutsUpserted: number;
      stepsUpserted: number;
      days: number;
      lastSyncAt: string;
    }>('/fitness/sync', {
      method: 'POST',
      body: JSON.stringify(days != null ? { days } : {}),
    }),
  listWorkouts: (date: string) =>
    request<{ date: string; workouts: FitnessWorkout[] }>(`/fitness/workouts?date=${date}`),
  getWorkout: (id: string) =>
    request<{ workout: FitnessWorkout }>(`/fitness/workouts/${id}`),
  createWorkout: (data: {
    activityType: string;
    startedAt: string;
    endedAt?: string | null;
    durationMin: number;
    activeEnergyKcal?: number | null;
    distanceKm?: number | null;
  }) =>
    request<{ workout: FitnessWorkout }>('/fitness/workouts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteWorkout: (id: string) =>
    request<{ ok: boolean }>(`/fitness/workouts/${id}`, { method: 'DELETE' }),
  getSteps: (date: string) =>
    request<{
      date: string;
      steps: number | null;
      source: 'SHORTCUTS' | 'MANUAL' | 'FITNESSSYNCER' | null;
      updatedAt: string | null;
    }>(`/fitness/steps?date=${date}`),
  putSteps: (date: string, steps: number) =>
    request<{
      date: string;
      steps: number;
      source: 'SHORTCUTS' | 'MANUAL' | 'FITNESSSYNCER';
      updatedAt: string;
    }>('/fitness/steps', {
      method: 'PUT',
      body: JSON.stringify({ date, steps }),
    }),
};

export const profileApi = {
  getMe: () => request<any>('/profile/me'),
  update: (data: unknown) => request('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  aiCalculateGoals: (data?: {
    goal?: 'LOSE' | 'MAINTAIN' | 'GAIN';
    targetWeightKg?: number | null;
    goalWeeks?: number | null;
    locale?: 'hu' | 'en';
  }) =>
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
        pendingRecipes?: number;
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
  getRecipes: (opts?: { status?: string; page?: number; limit?: number }) => {
    const p = new URLSearchParams();
    if (opts?.status) p.set('status', opts.status);
    if (opts?.page) p.set('page', String(opts.page));
    if (opts?.limit) p.set('limit', String(opts.limit));
    return request<{
      recipes: Array<{
        id: string;
        title: string;
        status: string;
        sourceType: string;
        createdAt: string;
        createdBy: { id: string; username: string };
        hasImage: boolean;
      }>;
      total: number;
    }>(`/admin/recipes?${p}`);
  },
  approveRecipe: (id: string) => request(`/admin/recipes/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  rejectRecipe: (id: string, reason?: string) =>
    request(`/admin/recipes/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

export type RecipeCategory = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DESSERT' | 'OTHER';
export type RecipeSourceType =
  | 'MANUAL'
  | 'IMAGE'
  | 'VIDEO'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'WEB';

export type RecipeNutrition = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  incomplete: boolean;
  matchedCount: number;
  totalCount: number;
};

export type RecipeIngredientDraft = {
  id?: string;
  name: string;
  amount?: number | null;
  unit?: string | null;
  amountG?: number | null;
  sortOrder?: number;
  foodId?: string | null;
  matchConfidence?: number | null;
  matchedFoodName?: string | null;
  suggestedFood?: { id: string; displayName: string } | null;
};

export type RecipeDraft = {
  title: string;
  description?: string | null;
  servings: number;
  category?: RecipeCategory | null;
  ingredients: RecipeIngredientDraft[];
  instructions: string[];
  sourceUrl?: string | null;
  sourceExternalId?: string | null;
  sourceType: RecipeSourceType;
};

export type RecipeListItem = {
  id: string;
  title: string;
  servings: number;
  category: RecipeCategory | null;
  status: string;
  sourceType: RecipeSourceType;
  createdAt: string;
  createdBy: { id: string; username: string };
  hasImage: boolean;
  isFavorite: boolean;
  nutrition?: RecipeNutrition | null;
};

export type RecipeDetail = RecipeDraft & {
  id: string;
  status: string;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; username: string };
  hasImage: boolean;
  isFavorite: boolean;
  isOwner: boolean;
  nutrition?: RecipeNutrition | null;
};

async function requestBlob(path: string, retry = true): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessTokenFromStorage();
    if (refreshed) return requestBlob(path, false);
    throw new ApiError(401, 'A hitelesítés frissítése sikertelen. Próbáld újra később.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'A kép betöltése sikertelen.');
  }
  return response.blob();
}

export const recipesApi = {
  list: (opts?: { page?: number; limit?: number; search?: string; category?: RecipeCategory }) => {
    const p = new URLSearchParams();
    if (opts?.page) p.set('page', String(opts.page));
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.search) p.set('search', opts.search);
    if (opts?.category) p.set('category', opts.category);
    const q = p.toString();
    return request<{ recipes: RecipeListItem[]; page: number; limit: number; total: number }>(
      `/recipes${q ? `?${q}` : ''}`,
    );
  },
  get: (id: string) => request<RecipeDetail>(`/recipes/${id}`),
  create: (data: RecipeDraft & { tempImageKey?: string; sourceExternalId?: string | null }) =>
    request<RecipeDetail>('/recipes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<RecipeDraft> & { tempImageKey?: string }) =>
    request<RecipeDetail>(`/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request(`/recipes/${id}`, { method: 'DELETE' }),
  favorite: (id: string) => request<{ isFavorite: boolean }>(`/recipes/${id}/favorite`, { method: 'POST' }),
  unfavorite: (id: string) => request<{ isFavorite: boolean }>(`/recipes/${id}/favorite`, { method: 'DELETE' }),
  match: (ingredients: RecipeIngredientDraft[], servings = 1) =>
    request<{ ingredients: RecipeIngredientDraft[]; nutrition: RecipeNutrition | null }>('/recipes/match', {
      method: 'POST',
      body: JSON.stringify({ ingredients, servings }),
    }),
  log: (id: string, data: { servings: number; mealType: string; date?: string }) =>
    request(`/recipes/${id}/log`, { method: 'POST', body: JSON.stringify(data) }),
  importFromImage: (file: File, locale: 'hu' | 'en' = 'hu') => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{
      draft: RecipeDraft;
      nutrition?: RecipeNutrition | null;
      tempImageKey: string;
      remaining: number;
      limit: number;
    }>(`/recipes/import/image?locale=${locale}`, { method: 'POST', body: fd });
  },
  importFromUrl: (url: string, locale: 'hu' | 'en' = 'hu') =>
    request<{
      draft: RecipeDraft;
      nutrition?: RecipeNutrition | null;
      tempImageKey?: string;
      needsFallback?: boolean;
      remaining: number;
      limit: number;
    }>('/recipes/import/url', { method: 'POST', body: JSON.stringify({ url, locale }) }),
  importFromVideo: (file: File, locale: 'hu' | 'en' = 'hu') => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{
      draft: RecipeDraft;
      nutrition?: RecipeNutrition | null;
      remaining: number;
      limit: number;
    }>(`/recipes/import/video?locale=${locale}`, {
      method: 'POST',
      body: fd,
      ...requestTimeout(180_000),
    });
  },
  getImageBlob: (id: string) => requestBlob(`/recipes/${id}/image`),
  getTempImageBlob: (key: string) => requestBlob(`/recipes/tmp/${key}/image`),
};
