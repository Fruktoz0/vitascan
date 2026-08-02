import { randomBytes } from 'crypto';
import { Prisma, PrismaClient, FitnessSource } from '@prisma/client';
import type { WorkoutCreateInput } from './fitness.schema';
import { decryptSecret, encryptSecret, hasCredentialsKey } from './fitness.crypto';
import * as fs from './fitnesssyncer.client';

export function parseDay(date?: string): Date {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

export function parseDateOnly(date?: string): Date {
  const key =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateStr(new Date());
  return new Date(key + 'T00:00:00.000Z');
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function utcDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n == null ? null : Math.round(n);
}

function firstNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = numOrNull(v);
    if (n != null) return n;
  }
  return null;
}

function firstInt(...vals: unknown[]): number | null {
  const n = firstNum(...vals);
  return n == null ? null : Math.round(n);
}

/** Valid resting–exercise HR band — filters GPS altitude/speed false positives. */
function isPlausibleBpm(n: number): boolean {
  return Number.isFinite(n) && n >= 35 && n <= 240;
}

function bpmOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n != null && isPlausibleBpm(n) ? Math.round(n) : null;
}

/**
 * FitnessSyncer / Apple payloads vary in casing and nesting.
 * Walk the raw JSON and pick avg/min/max/resting from any heartrate-like keys.
 */
function digHrSummary(raw: unknown): {
  avg: number | null;
  min: number | null;
  max: number | null;
  resting: number | null;
} {
  const avgs: number[] = [];
  const mins: number[] = [];
  const maxs: number[] = [];
  const rests: number[] = [];

  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const el of node) visit(el, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[_-]/g, '');
      const bpm = bpmOrNull(v);
      if (bpm != null) {
        const isHr =
          key.includes('heartrate') ||
          key.includes('heart') ||
          key === 'avgheart' ||
          key === 'maxheart' ||
          key === 'minheart' ||
          key === 'hr';
        if (isHr) {
          if (key.includes('rest')) rests.push(bpm);
          else if (key.includes('max') || key.includes('peak')) maxs.push(bpm);
          else if (key.includes('min') || key.includes('low')) mins.push(bpm);
          else if (key.includes('avg') || key.includes('average') || key.includes('mean'))
            avgs.push(bpm);
          else if (key === 'heartrate' || key === 'hr' || key === 'heart') avgs.push(bpm);
        }
      }
      if (v && typeof v === 'object') visit(v, depth + 1);
    }
  };
  visit(raw, 0);

  const pick = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : null;

  return {
    avg: pick(avgs),
    min: mins.length ? Math.min(...mins) : null,
    max: maxs.length ? Math.max(...maxs) : null,
    resting: pick(rests),
  };
}

function hrFromGpsLaps(item: fs.FsActivityItem): {
  avg: number | null;
  min: number | null;
  max: number | null;
} {
  const laps = item.gps?.lap;
  if (!Array.isArray(laps) || laps.length === 0) {
    return { avg: null, min: null, max: null };
  }
  const avgs: number[] = [];
  const mins: number[] = [];
  const maxs: number[] = [];
  for (const lap of laps) {
    const a = bpmOrNull(lap.avgHeart);
    const mn = bpmOrNull((lap as { minHeart?: number }).minHeart);
    const mx = bpmOrNull(lap.maxHeart);
    if (a != null) avgs.push(a);
    if (mn != null) mins.push(mn);
    if (mx != null) maxs.push(mx);
  }
  return {
    avg: avgs.length ? Math.round(avgs.reduce((s, n) => s + n, 0) / avgs.length) : null,
    min: mins.length ? Math.min(...mins) : null,
    max: maxs.length ? Math.max(...maxs) : null,
  };
}

/** Collect heartRate samples from gps.lap[].points[] (FitnessSyncer Point.heartRate). */
function extractHrSeries(item: fs.FsActivityItem): Array<{ tMs: number; bpm: number }> {
  const out: Array<{ tMs: number; bpm: number }> = [];
  const laps = item.gps?.lap;
  if (!Array.isArray(laps)) return out;
  for (const lap of laps) {
    const points = lap.points as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(points)) continue;
    for (const p of points) {
      const bpm = bpmOrNull(
        p.heartRate ?? p.heartrate ?? p.HeartRate ?? p.hr ?? p.HR,
      );
      const tMs = numOrNull(p.time ?? p.date ?? p.timestamp);
      if (bpm == null || tMs == null) continue;
      out.push({ tMs: Math.round(tMs), bpm });
    }
  }
  out.sort((a, b) => a.tMs - b.tMs);
  return out;
}

/** Keep chart usable — max ~120 samples evenly spaced. */
function downsampleHrSeries(
  series: Array<{ tMs: number; bpm: number }>,
  maxPoints = 120,
): Array<{ tMs: number; bpm: number }> {
  if (series.length <= maxPoints) return series;
  const result: Array<{ tMs: number; bpm: number }> = [];
  const step = (series.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(series[Math.round(i * step)]);
  }
  return result;
}

function hrFromSeries(series: Array<{ tMs: number; bpm: number }>): {
  avg: number | null;
  min: number | null;
  max: number | null;
} {
  if (series.length === 0) return { avg: null, min: null, max: null };
  const bpms = series.map((p) => p.bpm);
  return {
    avg: Math.round(bpms.reduce((s, n) => s + n, 0) / bpms.length),
    min: Math.min(...bpms),
    max: Math.max(...bpms),
  };
}

function metricsFromFsItem(item: fs.FsActivityItem) {
  const seriesRaw = extractHrSeries(item);
  const series = downsampleHrSeries(seriesRaw);
  const fromPoints = hrFromSeries(seriesRaw);
  const fromLaps = hrFromGpsLaps(item);
  const dug = digHrSummary(item);

  const avgHeartrate =
    bpmOrNull(item.avgHeartrate) ??
    bpmOrNull(item.avgHeartRate) ??
    fromLaps.avg ??
    fromPoints.avg ??
    dug.avg;
  const minHeartrate =
    bpmOrNull(item.minHeartrate) ??
    bpmOrNull(item.minHeartRate) ??
    fromLaps.min ??
    fromPoints.min ??
    dug.min;
  const maxHeartrate =
    bpmOrNull(item.maxHeartrate) ??
    bpmOrNull(item.maxHeartRate) ??
    fromLaps.max ??
    fromPoints.max ??
    dug.max;
  const restingHeartrate =
    bpmOrNull(item.restingHeartrate) ??
    bpmOrNull(item.restingHeartRate) ??
    dug.resting;

  return {
    title: item.title?.trim() || null,
    steps: intOrNull(item.steps),
    avgHeartrate,
    minHeartrate,
    maxHeartrate,
    restingHeartrate,
    pace: numOrNull(item.pace),
    speedAvg: numOrNull(item.speed_avg),
    speedMax: numOrNull(item.speed_max),
    elevationGain: numOrNull(item.elevation_gain),
    elevationMin: numOrNull(item.elevation_min),
    elevationMax: numOrNull(item.elevation_max),
    floorsClimbed: intOrNull(item.floorsClimbed),
    vo2Max: intOrNull(item.vo2Max),
    respiratoryRate: numOrNull(item.respiratoryRate),
    mindfulMinutes: intOrNull(item.mindfulMinutes),
    avgStressLevel: intOrNull(item.avgStressLevel),
    providerType: item.providerType?.trim() || null,
    hrSeries: series.length > 0 ? series : Prisma.JsonNull,
  };
}

function serializeWorkout(w: {
  id: string;
  activityType: string;
  title?: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMin: number;
  activeEnergyKcal: number | null;
  distanceKm: number | null;
  steps?: number | null;
  avgHeartrate?: number | null;
  minHeartrate?: number | null;
  maxHeartrate?: number | null;
  restingHeartrate?: number | null;
  pace?: number | null;
  speedAvg?: number | null;
  speedMax?: number | null;
  elevationGain?: number | null;
  elevationMin?: number | null;
  elevationMax?: number | null;
  floorsClimbed?: number | null;
  vo2Max?: number | null;
  respiratoryRate?: number | null;
  mindfulMinutes?: number | null;
  avgStressLevel?: number | null;
  providerType?: string | null;
  hrSeries?: unknown;
  source: FitnessSource;
  externalId: string | null;
  createdAt: Date;
}) {
  const hrSeries = Array.isArray(w.hrSeries)
    ? (w.hrSeries as Array<{ tMs?: number; bpm?: number }>)
        .filter((p) => typeof p?.tMs === 'number' && typeof p?.bpm === 'number')
        .map((p) => ({ tMs: p.tMs as number, bpm: p.bpm as number }))
    : null;

  return {
    id: w.id,
    activityType: w.activityType,
    title: w.title ?? null,
    startedAt: w.startedAt.toISOString(),
    endedAt: w.endedAt?.toISOString() ?? null,
    durationMin: w.durationMin,
    activeEnergyKcal: w.activeEnergyKcal,
    distanceKm: w.distanceKm,
    steps: w.steps ?? null,
    avgHeartrate: w.avgHeartrate ?? null,
    minHeartrate: w.minHeartrate ?? null,
    maxHeartrate: w.maxHeartrate ?? null,
    restingHeartrate: w.restingHeartrate ?? null,
    pace: w.pace ?? null,
    speedAvg: w.speedAvg ?? null,
    speedMax: w.speedMax ?? null,
    elevationGain: w.elevationGain ?? null,
    elevationMin: w.elevationMin ?? null,
    elevationMax: w.elevationMax ?? null,
    floorsClimbed: w.floorsClimbed ?? null,
    vo2Max: w.vo2Max ?? null,
    respiratoryRate: w.respiratoryRate ?? null,
    mindfulMinutes: w.mindfulMinutes ?? null,
    avgStressLevel: w.avgStressLevel ?? null,
    providerType: w.providerType ?? null,
    hrSeries,
    source: w.source,
    externalId: w.externalId,
    createdAt: w.createdAt.toISOString(),
  };
}

export async function listWorkouts(prisma: PrismaClient, userId: string, dateStr?: string) {
  const day = parseDay(dateStr);
  const rangeStart = new Date(day);
  const rangeEnd = new Date(day);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  const rows = await prisma.workoutLog.findMany({
    where: { userId, startedAt: { gte: rangeStart, lt: rangeEnd } },
    orderBy: { startedAt: 'asc' },
  });

  return { date: toDateStr(day), workouts: rows.map(serializeWorkout) };
}

export async function getWorkout(prisma: PrismaClient, userId: string, id: string) {
  const row = await prisma.workoutLog.findFirst({ where: { id, userId } });
  if (!row) {
    throw Object.assign(new Error('Az edzés nem található.'), { statusCode: 404 });
  }
  return { workout: serializeWorkout(row) };
}

export async function createWorkout(
  prisma: PrismaClient,
  userId: string,
  data: WorkoutCreateInput,
) {
  const startedAt = new Date(data.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    throw Object.assign(new Error('Érvénytelen startedAt.'), { statusCode: 400 });
  }
  const endedAt = data.endedAt ? new Date(data.endedAt) : null;
  if (endedAt && Number.isNaN(endedAt.getTime())) {
    throw Object.assign(new Error('Érvénytelen endedAt.'), { statusCode: 400 });
  }

  const row = await prisma.workoutLog.create({
    data: {
      userId,
      activityType: data.activityType,
      startedAt,
      endedAt,
      durationMin: data.durationMin,
      activeEnergyKcal: data.activeEnergyKcal ?? null,
      distanceKm: data.distanceKm ?? null,
      source: 'MANUAL',
    },
  });
  return serializeWorkout(row);
}

export async function deleteWorkout(prisma: PrismaClient, userId: string, id: string) {
  const existing = await prisma.workoutLog.findFirst({ where: { id, userId } });
  if (!existing) {
    throw Object.assign(new Error('Az edzés nem található.'), { statusCode: 404 });
  }
  await prisma.workoutLog.delete({ where: { id } });
  return { ok: true };
}

export async function getSteps(prisma: PrismaClient, userId: string, dateStr?: string) {
  const day = parseDateOnly(dateStr);
  const row = await prisma.dailyStepLog.findUnique({
    where: { userId_loggedDate: { userId, loggedDate: day } },
  });
  return {
    date: dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : toDateStr(new Date()),
    steps: row?.steps ?? null,
    source: row?.source ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function upsertSteps(
  prisma: PrismaClient,
  userId: string,
  dateStr: string,
  steps: number,
  source: FitnessSource,
) {
  const day = parseDateOnly(dateStr);
  const row = await prisma.dailyStepLog.upsert({
    where: { userId_loggedDate: { userId, loggedDate: day } },
    create: { userId, loggedDate: day, steps, source },
    update: { steps, source },
  });
  return {
    date: dateStr,
    steps: row.steps,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── FitnessSyncer connection ────────────────────────────────────────────────

export async function getFsStatus(prisma: PrismaClient, userId: string) {
  const p = await prisma.userProfile.findUnique({ where: { userId } });
  const lastSyncAt = p?.fsLastSyncAt?.getTime() ?? null;
  const stale =
    p?.fsStatus === 'CONNECTED' &&
    (lastSyncAt == null || Date.now() - lastSyncAt > 60 * 60 * 1000);

  return {
    status: p?.fsStatus ?? 'DISCONNECTED',
    hasCredentials: !!(p?.fsClientId && p?.fsClientSecretEnc),
    hasClientId: !!p?.fsClientId,
    connected: p?.fsStatus === 'CONNECTED' && !!p?.fsAccessTokenEnc,
    connectedAt: p?.fsConnectedAt?.toISOString() ?? null,
    lastSyncAt: p?.fsLastSyncAt?.toISOString() ?? null,
    lastError: p?.fsLastError ?? null,
    callbackUrl: fs.PERSONAL_REDIRECT_URI,
    oauthPending: !!(
      p?.fsOauthState &&
      p.fsOauthStateExpiresAt &&
      p.fsOauthStateExpiresAt.getTime() > Date.now()
    ),
    needsSync: stale,
    cryptoConfigured: hasCredentialsKey(),
  };
}

export async function saveFsCredentials(
  prisma: PrismaClient,
  userId: string,
  clientId: string,
  clientSecret: string,
) {
  if (!hasCredentialsKey()) {
    throw Object.assign(new Error('FITNESS_CREDENTIALS_KEY nincs beállítva.'), {
      statusCode: 503,
    });
  }
  const enc = encryptSecret(clientSecret);
  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      fsClientId: clientId.trim(),
      fsClientSecretEnc: enc,
      fsStatus: 'DISCONNECTED',
      fsAccessTokenEnc: null,
      fsRefreshTokenEnc: null,
      fsTokenExpiresAt: null,
      fsConnectedAt: null,
      fsLastError: null,
    },
    update: {
      fsClientId: clientId.trim(),
      fsClientSecretEnc: enc,
      // New credentials invalidate previous OAuth session
      fsAccessTokenEnc: null,
      fsRefreshTokenEnc: null,
      fsTokenExpiresAt: null,
      fsConnectedAt: null,
      fsStatus: 'DISCONNECTED',
      fsLastError: null,
    },
  });
  return getFsStatus(prisma, userId);
}

export async function startFsConnect(prisma: PrismaClient, userId: string) {
  const p = await prisma.userProfile.findUnique({ where: { userId } });
  if (!p?.fsClientId || !p.fsClientSecretEnc) {
    throw Object.assign(
      new Error('Előbb mentsd el a FitnessSyncer Client Id és Secret értékeket.'),
      { statusCode: 400 },
    );
  }

  const redirectUri = fs.PERSONAL_REDIRECT_URI;
  const { verifier, challenge } = fs.createPkcePair();
  const state = randomBytes(24).toString('hex');

  await prisma.userProfile.update({
    where: { userId },
    data: {
      fsOauthState: state,
      fsOauthCodeVerifier: verifier,
      fsOauthStateExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      fsLastError: null,
    },
  });

  const authorizeUrl = fs.buildAuthorizeUrl({
    clientId: p.fsClientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  return {
    authorizeUrl,
    callbackUrl: redirectUri,
    hint: 'After authorize, copy the full personal.fitnesssyncer.com URL (with ?code=) and paste it back in VitaScan.',
  };
}

/**
 * Personal App flow: user pastes https://personal.fitnesssyncer.com/?code=...&state=...
 * (or just the code). Exchanges for tokens using locked redirect URI.
 */
export async function exchangeFsPaste(
  prisma: PrismaClient,
  userId: string,
  pasted: string,
) {
  const p = await prisma.userProfile.findUnique({ where: { userId } });
  if (!p?.fsClientId || !p.fsClientSecretEnc || !p.fsOauthCodeVerifier) {
    throw Object.assign(
      new Error('Nincs folyamatban lévő OAuth — előbb nyomd meg a Kapcsolódást.'),
      { statusCode: 400 },
    );
  }
  if (p.fsOauthStateExpiresAt && p.fsOauthStateExpiresAt.getTime() < Date.now()) {
    throw Object.assign(new Error('Az OAuth lejárt — indítsd újra a Kapcsolódást.'), {
      statusCode: 400,
    });
  }

  const { code, state } = fs.parsePastedOAuthInput(pasted);
  if (state && p.fsOauthState && state !== p.fsOauthState) {
    throw Object.assign(new Error('State nem egyezik — indítsd újra a Kapcsolódást.'), {
      statusCode: 400,
    });
  }

  try {
    const secret = decryptSecret(p.fsClientSecretEnc);
    const tokens = await fs.exchangeAuthCode({
      clientId: p.fsClientId,
      clientSecret: secret,
      code,
      redirectUri: fs.PERSONAL_REDIRECT_URI,
      codeVerifier: p.fsOauthCodeVerifier,
    });

    await prisma.userProfile.update({
      where: { userId },
      data: {
        fsAccessTokenEnc: encryptSecret(tokens.access_token),
        fsRefreshTokenEnc: encryptSecret(tokens.refresh_token),
        fsTokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        fsConnectedAt: new Date(),
        fsStatus: 'CONNECTED',
        fsLastError: null,
        fsOauthState: null,
        fsOauthCodeVerifier: null,
        fsOauthStateExpiresAt: null,
      },
    });

    return getFsStatus(prisma, userId);
  } catch (err: any) {
    await prisma.userProfile.update({
      where: { userId },
      data: {
        fsStatus: 'ERROR',
        fsLastError: String(err?.message || 'OAuth exchange failed').slice(0, 240),
      },
    });
    throw Object.assign(new Error(err?.message || 'Token csere sikertelen.'), {
      statusCode: err?.statusCode || 502,
    });
  }
}

/** @deprecated Personal apps cannot callback here; kept for compatibility. */
export async function handleFsCallback(
  prisma: PrismaClient,
  opts: { code?: string; state?: string; error?: string },
) {
  if (opts.error) {
    return fs.getPwaFitnessReturnUrl({ fs: 'error', message: opts.error });
  }
  return fs.getPwaFitnessReturnUrl({
    fs: 'error',
    message: 'use_paste_flow',
  });
}

export async function disconnectFs(prisma: PrismaClient, userId: string) {
  const p = await prisma.userProfile.findUnique({ where: { userId } });
  if (p?.fsClientId && p.fsClientSecretEnc && p.fsAccessTokenEnc) {
    try {
      const secret = decryptSecret(p.fsClientSecretEnc);
      const access = decryptSecret(p.fsAccessTokenEnc);
      await fs.revokeToken({
        clientId: p.fsClientId,
        clientSecret: secret,
        token: access,
      });
    } catch {
      // ignore
    }
  }

  await prisma.userProfile.updateMany({
    where: { userId },
    data: {
      fsAccessTokenEnc: null,
      fsRefreshTokenEnc: null,
      fsTokenExpiresAt: null,
      fsConnectedAt: null,
      fsStatus: 'DISCONNECTED',
      fsLastError: null,
      fsOauthState: null,
      fsOauthCodeVerifier: null,
      fsOauthStateExpiresAt: null,
    },
  });

  return getFsStatus(prisma, userId);
}

async function getValidAccessToken(prisma: PrismaClient, userId: string): Promise<string> {
  const p = await prisma.userProfile.findUnique({ where: { userId } });
  if (!p?.fsClientId || !p.fsClientSecretEnc || !p.fsAccessTokenEnc || !p.fsRefreshTokenEnc) {
    throw Object.assign(new Error('Nincs FitnessSyncer kapcsolat.'), { statusCode: 400 });
  }

  const secret = decryptSecret(p.fsClientSecretEnc);
  const expiresAt = p.fsTokenExpiresAt?.getTime() ?? 0;
  const skewMs = 60_000;

  if (expiresAt - skewMs > Date.now()) {
    return decryptSecret(p.fsAccessTokenEnc);
  }

  try {
    const refreshed = await fs.refreshAccessToken({
      clientId: p.fsClientId,
      clientSecret: secret,
      refreshToken: decryptSecret(p.fsRefreshTokenEnc),
    });
    await prisma.userProfile.update({
      where: { userId },
      data: {
        fsAccessTokenEnc: encryptSecret(refreshed.access_token),
        fsRefreshTokenEnc: encryptSecret(refreshed.refresh_token),
        fsTokenExpiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000),
        fsStatus: 'CONNECTED',
        fsLastError: null,
      },
    });
    return refreshed.access_token;
  } catch (err: any) {
    await prisma.userProfile.update({
      where: { userId },
      data: {
        fsStatus: 'ERROR',
        fsLastError: String(err?.message || 'Token refresh failed').slice(0, 240),
      },
    });
    throw Object.assign(
      new Error('FitnessSyncer token lejárt — kapcsold újra.'),
      { statusCode: 401 },
    );
  }
}

export async function syncFromFitnessSyncer(
  prisma: PrismaClient,
  userId: string,
  days = 7,
) {
  const accessToken = await getValidAccessToken(prisma, userId);

  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;

  const sources = await fs.listSources(accessToken);
  const activitySources = sources.filter(
    (s) => s.enabled !== false && String(s.type || '').toLowerCase() === 'activity',
  );

  let workoutsUpserted = 0;
  let stepsUpserted = 0;

  for (const source of activitySources) {
    try {
      await fs.refreshSource(accessToken, source.id);
    } catch {
      // refresh best-effort; still try to pull items
    }

    let offset = 0;
    const limit = 100;
    for (;;) {
      const items = await fs.listSourceItems(accessToken, source.id, {
        startDateMs: startMs,
        endDateMs: endMs,
        limit,
        offset,
      });
      if (items.length === 0) break;

      for (const item of items) {
        if (item.summary === true) {
          if (typeof item.steps === 'number' && item.steps >= 0 && item.date != null) {
            const dateKey = utcDateKeyFromMs(item.date);
            await upsertSteps(prisma, userId, dateKey, Math.round(item.steps), 'FITNESSSYNCER');
            stepsUpserted += 1;
          }
          continue;
        }

        // Workout event
        const startedMs = item.date;
        if (startedMs == null) continue;
        const startedAt = new Date(startedMs);
        const endedAt = item.endDate != null ? new Date(item.endDate) : null;
        const durationSec = typeof item.duration === 'number' ? item.duration : 0;
        const durationMin =
          durationSec > 0
            ? durationSec / 60
            : endedAt
              ? Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 60000)
              : 0;

        const activityType =
          item.fitnessSyncerActivity ||
          item.activity ||
          item.title ||
          'Workout';

        const listItemId =
          item.itemId ||
          (typeof (item as { id?: string }).id === 'string'
            ? (item as { id: string }).id
            : null);
        const externalId = listItemId
          ? `fs:${listItemId}`
          : `fs:${source.id}:${startedMs}:${activityType}`;

        let richItem = item;
        if (listItemId) {
          const taskId =
            typeof (item as { taskId?: string }).taskId === 'string'
              ? (item as { taskId: string }).taskId
              : null;
          const detail = await fs.getSourceItemRich(accessToken, [
            { sourceId: source.id, itemId: listItemId },
            ...(taskId && taskId !== source.id
              ? [{ sourceId: taskId, itemId: listItemId }]
              : []),
            { sourceId: 'notebook', itemId: listItemId },
          ]);
          if (detail) {
            richItem = {
              ...item,
              ...detail,
              gps: detail.gps ?? item.gps,
              itemId: detail.itemId || listItemId,
            };
          }
        }

        const metrics = metricsFromFsItem(richItem);

        await prisma.workoutLog.upsert({
          where: { userId_externalId: { userId, externalId } },
          create: {
            userId,
            externalId,
            activityType: String(activityType).slice(0, 100),
            startedAt,
            endedAt,
            durationMin,
            activeEnergyKcal:
              typeof richItem.calories === 'number'
                ? richItem.calories
                : typeof item.calories === 'number'
                  ? item.calories
                  : null,
            distanceKm:
              typeof richItem.distanceKM === 'number'
                ? richItem.distanceKM
                : typeof item.distanceKM === 'number'
                  ? item.distanceKM
                  : null,
            source: 'FITNESSSYNCER',
            ...metrics,
          },
          update: {
            activityType: String(activityType).slice(0, 100),
            startedAt,
            endedAt,
            durationMin,
            activeEnergyKcal:
              typeof richItem.calories === 'number'
                ? richItem.calories
                : typeof item.calories === 'number'
                  ? item.calories
                  : null,
            distanceKm:
              typeof richItem.distanceKM === 'number'
                ? richItem.distanceKM
                : typeof item.distanceKM === 'number'
                  ? item.distanceKM
                  : null,
            source: 'FITNESSSYNCER',
            ...metrics,
          },
        });
        workoutsUpserted += 1;
      }

      if (items.length < limit) break;
      offset += limit;
    }
  }

  await prisma.userProfile.update({
    where: { userId },
    data: {
      fsLastSyncAt: new Date(),
      fsStatus: 'CONNECTED',
      fsLastError: null,
    },
  });

  return {
    ok: true,
    sources: activitySources.length,
    workoutsUpserted,
    stepsUpserted,
    days,
    lastSyncAt: new Date().toISOString(),
  };
}
