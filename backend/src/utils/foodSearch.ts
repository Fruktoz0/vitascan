/** Cirill betűk — ilyen nevű ételeket nem jelenítünk meg. */
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;

/**
 * PostgreSQL `translate()` 1:1 mapping (NFC). Keep in sync with `foldDiacritics`.
 * Hungarian: áéíóöőúüű → aeiou
 */
const ACCENT_PAIRS: Array<[string, string]> = [
  ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ä', 'a'], ['ã', 'a'], ['å', 'a'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'],
  ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['ö', 'o'], ['õ', 'o'], ['ő', 'o'], ['ø', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'], ['ű', 'u'],
  ['ñ', 'n'], ['ç', 'c'], ['ÿ', 'y'],
];
export const SQL_ACCENT_FROM = ACCENT_PAIRS.map(([from]) => from).join('');
export const SQL_ACCENT_TO = ACCENT_PAIRS.map(([, to]) => to).join('');

/** Ékezetek eltávolítása, hogy a „tojas” és „tojás” ugyanazt találja. */
export function foldDiacritics(input: string): string {
  let s = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss');

  let out = '';
  for (const ch of s) {
    const i = SQL_ACCENT_FROM.indexOf(ch);
    out += i >= 0 ? SQL_ACCENT_TO[i]! : ch;
  }
  return out;
}

export function foldedLikePattern(query: string): string | null {
  const folded = foldDiacritics(query).replace(/[%_\\]/g, '');
  if (!folded) return null;
  return `%${folded}%`;
}

/** Szavakra bontás: minden token a név/márka bármely szavának belsejében is egyezhet. */
export function tokenizeSearchQuery(query: string): string[] {
  const folded = foldDiacritics(query).replace(/[%_\\]/g, '');
  if (!folded) return [];

  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of folded.split(/[\s,;+/]+/)) {
    const t = raw.replace(/^[-.]+|[-.]+$/g, '');
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    tokens.push(t);
  }
  if (tokens.length === 0) {
    const compact = folded.replace(/\s+/g, '');
    if (compact.length >= 2) return [compact];
  }
  return tokens;
}

type PrismaRaw = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

async function findFoodIdsForToken(prisma: PrismaRaw, token: string): Promise<string[]> {
  const pattern = `%${token}%`;
  const from = SQL_ACCENT_FROM;
  const to = SQL_ACCENT_TO;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Food"
    WHERE translate(
            lower(
              coalesce(name, '') || ' ' ||
              coalesce("nameHu", '') || ' ' ||
              coalesce("nameEn", '') || ' ' ||
              coalesce(brand, '')
            ),
            ${from},
            ${to}
          ) LIKE ${pattern}
  `;
  return rows.map((r) => r.id);
}

/** Ékezetfüggetlen név/márka egyezés. Több szó: mindegyik tokennek szerepelnie kell. */
export async function findFoodIdsByAccentInsensitiveName(
  prisma: PrismaRaw,
  query: string,
): Promise<string[]> {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];

  let ids: string[] | null = null;
  for (const token of tokens) {
    const tokenIds = await findFoodIdsForToken(prisma, token);
    if (ids === null) {
      ids = tokenIds;
    } else {
      const set = new Set(tokenIds);
      ids = ids.filter((id) => set.has(id));
    }
    if (ids.length === 0) return [];
  }
  return ids ?? [];
}

export function hasCyrillic(...parts: Array<string | null | undefined>): boolean {
  return parts.some((p) => p != null && CYRILLIC_RE.test(p));
}

export function foodHasCyrillic(food: {
  name?: string | null;
  nameHu?: string | null;
  nameEn?: string | null;
  brand?: string | null;
}): boolean {
  return hasCyrillic(food.name, food.nameHu, food.nameEn, food.brand);
}

export type FoodOrigin = 'local' | 'off' | 'usda';

export function resolveOrigin(
  food: { externalId?: string | null },
  fromExternalThisRequest: boolean,
): FoodOrigin {
  const ext = food.externalId ?? '';
  if (ext.startsWith('usda:')) return 'usda';
  if (ext.startsWith('off:')) return 'off';
  if (fromExternalThisRequest) {
    // barcode OFF mentés externalId nélkül — ritka
    return 'off';
  }
  return 'local';
}

function tokenFieldScore(
  value: string | null | undefined,
  token: string,
  weight: number,
): number {
  if (!value) return 0;
  const v = foldDiacritics(value);
  if (!v) return 0;
  if (v === token) return 1000 * weight;
  if (v.startsWith(token)) return 820 * weight - Math.min(v.length, 80);

  const words = v.split(/[\s,;+/]+/).filter(Boolean);
  let best = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const later = i === 0 ? 0 : 12;
    if (w === token) best = Math.max(best, 780 * weight - later);
    else if (w.startsWith(token)) best = Math.max(best, 700 * weight - later);
    else if (w.includes(token)) best = Math.max(best, 620 * weight - later);
  }
  if (v.includes(token)) best = Math.max(best, 480 * weight);
  return best;
}

/**
 * Szöveges relevancia: nagyobb = jobb.
 * Preferálja a nameHu egyezést; idegen (csak nameEn) hátrébb.
 * Tokenenként a szavak belsejében és a 2. (későbbi) szavakban is pontoz.
 */
export function textRelevanceScore(
  food: {
    name?: string | null;
    nameHu?: string | null;
    nameEn?: string | null;
    brand?: string | null;
  },
  query: string,
): number {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return 0;

  let total = 0;
  for (const token of tokens) {
    const hu = tokenFieldScore(food.nameHu, token, 1.2);
    const name = tokenFieldScore(food.name, token, 1.0);
    const brand = tokenFieldScore(food.brand, token, 0.7);
    const en = tokenFieldScore(food.nameEn, token, 0.55);
    let score = Math.max(hu, name, brand, en);
    if (en > 0 && hu === 0 && name === 0 && brand === 0) {
      score *= 0.45;
    }
    total += score;
  }

  const avg = total / tokens.length;
  const phrase = foldDiacritics(query);
  const blob = foldDiacritics(
    [food.nameHu, food.name, food.nameEn, food.brand].filter(Boolean).join(' '),
  );
  if (phrase.length >= 2 && blob.includes(phrase)) {
    return avg + 120;
  }
  return avg;
}

export function rankBySourceAndStatus(food: { source?: string; status?: string }): number {
  if (food.source === 'INTERNAL') return 0;
  if (food.source === 'USER_SCAN' && food.status === 'VERIFIED') return 1;
  if (food.source === 'EXTERNAL_API') return 2;
  if (food.source === 'USER_SCAN' && food.status === 'UNVERIFIED') return 3;
  return 4;
}

/** Forrás rank + használati gyakoriság + szöveges relevancia + createdAt */
export function compareFoodsForSearch(
  a: any,
  b: any,
  query: string,
  usageCounts?: Map<string, number>,
): number {
  if (query) {
    const usageA = usageCounts?.get(a.id) ?? 0;
    const usageB = usageCounts?.get(b.id) ?? 0;
    if (usageB !== usageA) return usageB - usageA;

    const relDiff = textRelevanceScore(b, query) - textRelevanceScore(a, query);
    if (relDiff !== 0) return relDiff;
  }

  const rankDiff = rankBySourceAndStatus(a) - rankBySourceAndStatus(b);
  if (rankDiff !== 0) return rankDiff;

  const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
  const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
  return bTime - aTime;
}

export function mapFoodResponse(
  food: any,
  opts: { origin: FoodOrigin; isFavorite?: boolean },
) {
  return {
    ...food,
    displayName: food.nameHu ?? food.nameEn ?? food.name,
    origin: opts.origin,
    isFavorite: opts.isFavorite ?? false,
  };
}
