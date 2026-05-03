import { API_BASE } from './config';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

const REFRESH_STORAGE_KEY = 'vitascan_refresh_token';

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_STORAGE_KEY, token);
    else localStorage.removeItem(REFRESH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshAccessTokenFromStorage(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const run = async (): Promise<boolean> => {
    try {
      const stored = getStoredRefreshToken();
      if (!stored) return false;
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored }),
      });
      if (!res.ok) {
        setAccessToken(null);
        setStoredRefreshToken(null);
        return false;
      }
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      setAccessToken(data.accessToken);
      setStoredRefreshToken(data.refreshToken);
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

export async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  const body = options.body;
  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData;
  const hasNonEmptyBody =
    body !== undefined &&
    body !== null &&
    !(typeof body === 'string' && body.length === 0);

  if (hasNonEmptyBody && !isFormData) {
    const ct = headers['Content-Type'] ?? headers['content-type'];
    if (!ct) {
      headers['Content-Type'] = 'application/json';
    }
  }

  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const url = `${API_BASE}${path}`;

  try {
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 && retry) {
      const refreshed = await refreshAccessTokenFromStorage();
      if (refreshed) return request<T>(path, options, false);
      throw new ApiError(
        401,
        'A hitelesítés frissítése sikertelen. Jelentkezz be újra.',
      );
    }

    const responseText = await response.text();
    let data: unknown;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new ApiError(response.status, 'Szerver hiba (nem érvényes JSON).');
    }

    if (!response.ok) {
      const err =
        typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : 'Ismeretlen hiba.';
      throw new ApiError(response.status, err);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Hálózati hiba.');
  }
}
