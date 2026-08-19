import { getItem, setItem } from '../services/storage';

const HISTORY_KEY = 'vitascan.foodSearchHistory';
const OPENS_KEY = 'vitascan.foodOpenCounts';
const MAX_HISTORY = 16;
const MAX_SUGGESTIONS = 8;

function namespaced(base: string, userId?: string | null): string {
  return userId ? `${base}.${userId}` : base;
}

function foldQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadFoodSearchHistory(userId?: string | null): Promise<string[]> {
  const rows = await readJson<unknown>(namespaced(HISTORY_KEY, userId), []);
  return Array.isArray(rows) ? rows.filter((x): x is string => typeof x === 'string') : [];
}

export async function rememberFoodSearch(query: string, userId?: string | null): Promise<string[]> {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (foldQuery(trimmed).length < 2) {
    return loadFoodSearchHistory(userId);
  }
  const prev = await loadFoodSearchHistory(userId);
  const folded = foldQuery(trimmed);
  const rest = prev.filter((item) => {
    const existing = foldQuery(item);
    if (existing === folded) return false;
    // Gépelés közben a rövidebb előtagot cseréljük, ne halmozódjon.
    if (folded.startsWith(existing) && folded.length > existing.length) return false;
    return true;
  });
  const next = [trimmed, ...rest].slice(0, MAX_HISTORY);
  await setItem(namespaced(HISTORY_KEY, userId), JSON.stringify(next));
  return next;
}

export function matchSearchSuggestions(history: string[], query: string): string[] {
  const q = foldQuery(query);
  if (!q) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of history) {
    const folded = foldQuery(item);
    if (!folded || folded === q || !folded.includes(q) || seen.has(folded)) continue;
    seen.add(folded);
    out.push(item);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export async function loadFoodOpenCounts(
  userId?: string | null,
): Promise<Record<string, number>> {
  const rows = await readJson<Record<string, number>>(namespaced(OPENS_KEY, userId), {});
  if (!rows || typeof rows !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(rows)) {
    if (typeof n === 'number' && n > 0) out[id] = n;
  }
  return out;
}

export async function bumpFoodOpen(
  foodId: string,
  userId?: string | null,
): Promise<Record<string, number>> {
  const counts = await loadFoodOpenCounts(userId);
  counts[foodId] = (counts[foodId] ?? 0) + 1;
  await setItem(namespaced(OPENS_KEY, userId), JSON.stringify(counts));
  return counts;
}

export function rankFoodsByOpens<T extends { id: string }>(
  foods: T[],
  openCounts: Record<string, number>,
): T[] {
  return foods.slice().sort((a, b) => (openCounts[b.id] ?? 0) - (openCounts[a.id] ?? 0));
}
