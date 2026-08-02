import { createHash, randomBytes } from 'crypto';

const AUTHORIZE_URL = 'https://www.fitnesssyncer.com/api/oauth/authorize';
const TOKEN_URL = 'https://api.fitnesssyncer.com/api/oauth/access_token';
const REVOKE_URL = 'https://api.fitnesssyncer.com/api/oauth/revoke_token';
const API_BASE = 'https://api.fitnesssyncer.com/api';

const DEFAULT_SCOPES = [
  'source_read',
  'source_data_read',
  'source_data_activity_read',
  'profile_read',
].join(' ');

export type FsTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type FsSource = {
  id: string;
  name?: string;
  type?: string;
  enabled?: boolean;
  providerType?: string;
};

export type FsGpsPoint = {
  time?: number;
  heartRate?: number;
  distance?: number;
  speed?: number;
  altitude?: number;
};

export type FsActivityItem = {
  type?: string;
  itemId?: string;
  activity?: string;
  fitnessSyncerActivity?: string;
  title?: string;
  date?: number;
  endDate?: number;
  duration?: number;
  calories?: number;
  distanceKM?: number;
  steps?: number;
  summary?: boolean;
  avgHeartrate?: number;
  minHeartrate?: number;
  maxHeartrate?: number;
  restingHeartrate?: number;
  avgHeartRate?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  pace?: number;
  speed_avg?: number;
  speed_max?: number;
  elevation_gain?: number;
  elevation_min?: number;
  elevation_max?: number;
  floorsClimbed?: number;
  vo2Max?: number;
  respiratoryRate?: number;
  mindfulMinutes?: number;
  avgStressLevel?: number;
  providerType?: string;
  gps?: {
    lap?: Array<{
      avgHeart?: number;
      maxHeart?: number;
      minHeart?: number;
      points?: FsGpsPoint[];
    }>;
  };
};

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set('client_id', opts.clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', opts.scope ?? DEFAULT_SCOPES);
  u.searchParams.set('redirect_uri', opts.redirectUri);
  u.searchParams.set('state', opts.state);
  u.searchParams.set('code_challenge', opts.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

async function postForm(url: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(shortFsError(json, res.status, 'FitnessSyncer token hiba')), {
      statusCode: res.status === 401 ? 401 : 502,
    });
  }
  return json;
}

function shortFsError(json: any, status: number, fallbackPrefix = 'FitnessSyncer API hiba'): string {
  const candidate =
    (typeof json?.error_description === 'string' && json.error_description) ||
    (typeof json?.message === 'string' && json.message) ||
    (typeof json?.error === 'string' && json.error) ||
    `${fallbackPrefix} (${status})`;
  const cleaned = candidate.replace(/\s+/g, ' ').trim();
  return cleaned.length > 200 ? `${cleaned.slice(0, 199).trimEnd()}…` : cleaned;
}

export async function exchangeAuthCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<FsTokenResponse> {
  return postForm(TOKEN_URL, {
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code_verifier: opts.codeVerifier,
  });
}

export async function refreshAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<FsTokenResponse> {
  return postForm(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
}

export async function revokeToken(opts: {
  clientId: string;
  clientSecret: string;
  token: string;
}): Promise<void> {
  try {
    await postForm(REVOKE_URL, {
      token: opts.token,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
    });
  } catch {
    // best-effort
  }
}

async function apiGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(shortFsError(json, res.status)), {
      statusCode: res.status === 401 || res.status === 403 ? 401 : 502,
    });
  }
  return json;
}

async function apiPost(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(shortFsError(json, res.status)), {
      statusCode: res.status === 401 || res.status === 403 ? 401 : 502,
    });
  }
  return json;
}

export async function listSources(accessToken: string): Promise<FsSource[]> {
  const body = await apiGet('/providers/sources/', accessToken);
  return Array.isArray(body?.items) ? body.items : [];
}

export async function refreshSource(accessToken: string, sourceId: string): Promise<void> {
  await apiPost(`/providers/sources/${encodeURIComponent(sourceId)}/refresh`, accessToken);
}

export async function listSourceItems(
  accessToken: string,
  sourceId: string,
  opts: { startDateMs: number; endDateMs: number; limit?: number; offset?: number },
): Promise<FsActivityItem[]> {
  const q = new URLSearchParams();
  q.set('startDate', String(opts.startDateMs));
  q.set('endDate', String(opts.endDateMs));
  q.set('limit', String(opts.limit ?? 100));
  q.set('offset', String(opts.offset ?? 0));
  const body = await apiGet(
    `/providers/sources/${encodeURIComponent(sourceId)}/items/?${q}`,
    accessToken,
  );
  const items = body?.items;
  if (Array.isArray(items)) return items;
  if (Array.isArray(body)) return body;
  return [];
}

/** Full item — list payloads often omit HR / GPS; detail usually has them. */
export async function getSourceItem(
  accessToken: string,
  sourceId: string,
  itemId: string,
): Promise<FsActivityItem> {
  const body = await apiGet(
    `/providers/sources/${encodeURIComponent(sourceId)}/items/${encodeURIComponent(itemId)}`,
    accessToken,
  );
  return unwrapFsItem(body);
}

function unwrapFsItem(body: any): FsActivityItem {
  if (!body || typeof body !== 'object') return {} as FsActivityItem;
  // Common wrappers
  if (body.item && typeof body.item === 'object') return body.item as FsActivityItem;
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    return body.data as FsActivityItem;
  }
  if (Array.isArray(body.items) && body.items[0] && typeof body.items[0] === 'object') {
    return body.items[0] as FsActivityItem;
  }
  return body as FsActivityItem;
}

/** Prefer richest of several detail fetches (source id variants). */
export async function getSourceItemRich(
  accessToken: string,
  candidates: Array<{ sourceId: string; itemId: string }>,
): Promise<FsActivityItem | null> {
  let best: FsActivityItem | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    if (!c.sourceId || !c.itemId) continue;
    try {
      const item = await getSourceItem(accessToken, c.sourceId, c.itemId);
      const score =
        (typeof item.avgHeartrate === 'number' ? 4 : 0) +
        (typeof item.maxHeartrate === 'number' ? 2 : 0) +
        (item.gps?.lap?.length ? 8 : 0) +
        (typeof item.calories === 'number' ? 1 : 0) +
        (typeof item.duration === 'number' ? 1 : 0);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
      if (score >= 12) break; // good enough (gps + hr)
    } catch {
      // try next candidate
    }
  }
  return best;
}

export const PERSONAL_REDIRECT_URI = 'https://personal.fitnesssyncer.com/';

export function getCallbackRedirectUri(): string {
  // FitnessSyncer Personal Applications lock redirect to this URL.
  return PERSONAL_REDIRECT_URI;
}

export function getPwaFitnessReturnUrl(query: Record<string, string>): string {
  const pwa = (process.env.PUBLIC_PWA_URL || 'http://localhost:4173').replace(/\/$/, '');
  const u = new URL(`${pwa}/fitness`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

/** Parse pasted personal.fitnesssyncer.com/?code=...&state=... or bare code. */
export function parsePastedOAuthInput(raw: string): { code: string; state?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw Object.assign(new Error('Üres kód / URL.'), { statusCode: 400 });
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const u = new URL(trimmed);
    const code = u.searchParams.get('code');
    const state = u.searchParams.get('state') || undefined;
    if (!code) {
      throw Object.assign(
        new Error('A bemásolt URL-ben nincs code paraméter.'),
        { statusCode: 400 },
      );
    }
    return { code, state };
  }
  // bare code
  return { code: trimmed };
}
