import { API_BASE } from './config';
import {
  ApiError,
  getAccessToken,
  refreshAccessTokenFromStorage,
  request,
} from './client';

export type FoodStatus = 'UNVERIFIED' | 'VERIFIED' | 'BANNED';

export type DashboardResponse = {
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
  topContributors: {
    id: string;
    username: string;
    reputation: number;
    role: string;
  }[];
};

export function getDashboard() {
  return request<DashboardResponse>('/admin/dashboard');
}

export type TimeSeriesPoint = { date: string; count: number };

export type WaterSeriesPoint = { date: string; count: number; totalMl: number };

export type KeyCount = { key: string; count: number };

export type VoteBucket = { value: number; count: number };

export type DashboardAnalytics = {
  since: string;
  days: number;
  usersByDay: TimeSeriesPoint[];
  foodsByDay: TimeSeriesPoint[];
  logsByDay: TimeSeriesPoint[];
  waterByDay: WaterSeriesPoint[];
  foodStatus: KeyCount[];
  foodTier: KeyCount[];
  foodSource: KeyCount[];
  mealTypes: KeyCount[];
  logSources: KeyCount[];
  votes: VoteBucket[];
  usersByRole: KeyCount[];
  profilesByGoal: KeyCount[];
  profilesByGender: KeyCount[];
  activityLevels: KeyCount[];
  totals: {
    foodsAll: number;
    foodsVerified: number;
    votes: number;
    waterLogs: number;
    waterMlTotal: number;
    weightLogs: number;
    softDeletedUsers: number;
    activeRefreshTokens: number;
  };
};

export function getDashboardAnalytics() {
  return request<DashboardAnalytics>('/admin/dashboard/analytics');
}

export function getFoods(opts?: {
  status?: FoodStatus;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const p = new URLSearchParams();
  if (opts?.status) p.set('status', opts.status);
  if (opts?.q) p.set('q', opts.q);
  if (opts?.limit != null) p.set('limit', String(opts.limit));
  if (opts?.offset != null) p.set('offset', String(opts.offset));
  const qs = p.toString();
  return request<{ foods: unknown[]; total: number }>(
    `/admin/foods${qs ? `?${qs}` : ''}`,
  );
}

export type FoodDetail = {
  id: string;
  name: string;
  nameHu?: string | null;
  nameEn?: string | null;
  brand?: string | null;
  barcode?: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  servingSize?: number | null;
  servingUnit?: string | null;
  status: FoodStatus;
  tier: string;
  source: string;
  displayName?: string;
  score?: number;
  creator?: { id: string; username: string; reputation: number } | null;
  createdAt: string;
};

export type CreateFoodBody = {
  name: string;
  nameHu?: string | null;
  nameEn?: string | null;
  brand?: string | null;
  barcode?: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  servingSize?: number | null;
  servingUnit?: string | null;
  status?: FoodStatus;
  tier?: 'FREE' | 'PREMIUM';
  source?: 'INTERNAL' | 'USER_SCAN' | 'EXTERNAL_API';
};

export function createFood(body: CreateFoodBody) {
  return request<FoodDetail>('/admin/foods', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getFoodDetail(id: string) {
  return request<FoodDetail>(`/admin/foods/${id}`);
}

export function updateFood(id: string, body: Partial<Omit<FoodDetail, 'id' | 'creator' | 'createdAt' | 'score' | 'displayName' | 'tier' | 'source'>>) {
  return request<FoodDetail>(`/admin/foods/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function bulkSetFoodStatus(ids: string[], status: FoodStatus) {
  return request<{ updated: number }>('/admin/foods/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
  });
}

export function deleteFood(id: string) {
  return request<{ message: string }>(`/admin/foods/${id}`, {
    method: 'DELETE',
  });
}

export function setFoodStatus(id: string, status: FoodStatus) {
  return request(`/admin/foods/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function getUsers(opts?: {
  q?: string;
  role?: 'USER' | 'ADMIN';
  limit?: number;
  offset?: number;
}) {
  const p = new URLSearchParams();
  if (opts?.q) p.set('q', opts.q);
  if (opts?.role) p.set('role', opts.role);
  if (opts?.limit != null) p.set('limit', String(opts.limit));
  if (opts?.offset != null) p.set('offset', String(opts.offset));
  const qs = p.toString();
  return request<{ users: AdminUserRow[]; total: number }>(
    `/admin/users${qs ? `?${qs}` : ''}`,
  );
}

export type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  role: string;
  reputation: number;
  deletedAt: string | null;
  createdAt: string;
  profile: { tier?: string; goal?: string } | null;
  _count: { logs: number; createdFoods: number; votes: number };
};

export function setUserRole(id: string, role: 'USER' | 'ADMIN') {
  return request(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function setUserTier(id: string, tier: 'FREE' | 'PREMIUM') {
  return request(`/admin/users/${id}/tier`, {
    method: 'PATCH',
    body: JSON.stringify({ tier }),
  });
}

export function softDeleteUser(id: string) {
  return request<{ message: string }>(`/admin/users/${id}`, {
    method: 'DELETE',
  });
}

export function adjustReputation(id: string, delta: number, reason?: string) {
  return request(`/admin/users/${id}/reputation`, {
    method: 'PATCH',
    body: JSON.stringify({ delta, reason }),
  });
}

// ─── Refresh token DB takarítás ─────────────────────────────────────────────

export type RefreshTokenCleanupState = {
  intervalHours: number;
  revokedRetentionDays: number;
  lastRunAt: string | null;
  lastDeletedCount: number | null;
  totalRefreshTokens: number;
};

export function getRefreshTokenCleanup() {
  return request<RefreshTokenCleanupState>('/admin/system/refresh-token-cleanup');
}

export function patchRefreshTokenCleanup(body: {
  intervalHours?: number;
  revokedRetentionDays?: number;
}) {
  return request<RefreshTokenCleanupState>('/admin/system/refresh-token-cleanup', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function runRefreshTokenCleanupNow() {
  return request<RefreshTokenCleanupState & { deleted: number }>(
    '/admin/system/refresh-token-cleanup/run',
    { method: 'POST' },
  );
}

// ─── Adatbázis (db-tools proxy az API-n keresztül) ───────────────────────────

export type DatabaseStatusResponse = {
  configured: boolean;
  ok?: boolean;
  backupDir?: string;
  manualBackupDir?: string;
  scheduledBackupDir?: string;
  databaseConfigured?: boolean;
  rcloneUploadEnabled?: boolean;
  rcloneRemote?: string | null;
  error?: string;
};

export function getDatabaseStatus() {
  return request<DatabaseStatusResponse>('/admin/database/status');
}

export type DriveUploadStatus = 'ok' | 'skipped' | 'failed';

export function runDatabaseBackup() {
  return request<{
    message: string;
    filename: string;
    size: number;
    mtime: string;
    driveUpload?: DriveUploadStatus;
    driveUploadError?: string;
  }>('/admin/database/backup', { method: 'POST' });
}

export type BackupSource = 'manual' | 'auto' | 'legacy';

export type BackupFileRow = { name: string; size: number; mtime: string; source?: BackupSource };

export function listDatabaseBackups() {
  return request<{ files: BackupFileRow[] }>('/admin/database/backups');
}

export type ScheduleConfig = {
  cron: string;
  enabled: boolean;
  timezone?: string;
  manualBackupDir?: string;
  scheduledBackupDir?: string;
  retentionDays?: number;
};

export function getDatabaseSchedule() {
  return request<ScheduleConfig>('/admin/database/schedule');
}

export function putDatabaseSchedule(body: ScheduleConfig) {
  return request('/admin/database/schedule', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function getDatabaseDirs(path?: string) {
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  return request<{ current: string; parent: string | null; dirs: { name: string; path: string }[] }>(
    `/admin/database/dirs${qs}`,
  );
}

export function deleteDatabaseBackup(name: string) {
  const qs = `?name=${encodeURIComponent(name)}`;
  return request<{ message: string }>(`/admin/database/backups${qs}`, {
    method: 'DELETE',
  });
}

export function restoreDatabaseFromFile(filename: string) {
  return request<{ message: string }>('/admin/database/restore', {
    method: 'POST',
    body: JSON.stringify({ filename }),
  });
}

export async function dataMergeFromUpload(file: File) {
  const post = async (retry: boolean) => {
    const auth = getAccessToken();
    if (!auth) throw new ApiError(401, 'Nincs bejelentkezés.');
    const fd = new FormData();
    fd.append('file', file, file.name);
    const res = await fetch(`${API_BASE}/admin/database/data-update`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}` },
      body: fd,
    });
    if (res.status === 401 && retry) {
      const ok = await refreshAccessTokenFromStorage();
      if (ok) return post(false);
      throw new ApiError(401, 'A hitelesítés frissítése sikertelen.');
    }
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const err =
        typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : 'Frissítés sikertelen.';
      throw new ApiError(res.status, err);
    }
    return data as { message: string };
  };
  return post(true);
}

export async function downloadDatabaseBackup(name: string) {
  const doFetch = async (retry: boolean) => {
    const token = getAccessToken();
    const url = `${API_BASE}/admin/database/backups/download?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401 && retry) {
      const ok = await refreshAccessTokenFromStorage();
      if (ok) return doFetch(false);
      throw new ApiError(401, 'A hitelesítés frissítése sikertelen.');
    }
    if (!res.ok) {
      let msg = 'Letöltés sikertelen.';
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, msg);
    }
    return res.blob();
  };
  const blob = await doFetch(true);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.rel = 'noopener';
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function restoreDatabaseFromUpload(file: File) {
  const post = async (retry: boolean) => {
    const auth = getAccessToken();
    if (!auth) throw new ApiError(401, 'Nincs bejelentkezés.');
    const fd = new FormData();
    fd.append('file', file, file.name);
    const res = await fetch(`${API_BASE}/admin/database/restore-upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}` },
      body: fd,
    });
    if (res.status === 401 && retry) {
      const ok = await refreshAccessTokenFromStorage();
      if (ok) return post(false);
      throw new ApiError(401, 'A hitelesítés frissítése sikertelen.');
    }
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const err =
        typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : 'Feltöltés sikertelen.';
      throw new ApiError(res.status, err);
    }
    return data as { message: string };
  };

  return post(true);
}
