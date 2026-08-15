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

type PrismaRaw = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

/** Ékezetfüggetlen név/márka egyezés a Food táblán. */
export async function findFoodIdsByAccentInsensitiveName(
  prisma: PrismaRaw,
  query: string,
): Promise<string[]> {
  const pattern = foldedLikePattern(query);
  if (!pattern) return [];
  const from = SQL_ACCENT_FROM;
  const to = SQL_ACCENT_TO;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Food"
    WHERE translate(lower(coalesce(name, '')), ${from}, ${to}) LIKE ${pattern}
       OR translate(lower(coalesce("nameHu", '')), ${from}, ${to}) LIKE ${pattern}
       OR translate(lower(coalesce("nameEn", '')), ${from}, ${to}) LIKE ${pattern}
       OR translate(lower(coalesce(brand, '')), ${from}, ${to}) LIKE ${pattern}
  `;
  return rows.map((r) => r.id);
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

/**
 * Szöveges relevancia: nagyobb = jobb.
 * Preferálja a nameHu egyezést; idegen (csak nameEn) hátrébb.
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
  const q = foldDiacritics(query);
  if (!q) return 0;

  const scoreField = (value: string | null | undefined, weight: number): number => {
    if (!value) return 0;
    const v = foldDiacritics(value);
    if (!v) return 0;
    if (v === q) return 1000 * weight;
    if (v.startsWith(q)) return 800 * weight - Math.min(v.length, 200);
    if (v.includes(q)) return 500 * weight - Math.min(v.length, 200);
    return 0;
  };

  const hu = scoreField(food.nameHu, 1.2);
  const name = scoreField(food.name, 1.0);
  const brand = scoreField(food.brand, 0.7);
  const en = scoreField(food.nameEn, 0.55);

  // Ha csak EN egyezik (HU/name/brand nem), büntetés
  let score = Math.max(hu, name, brand, en);
  if (en > 0 && hu === 0 && name === 0 && brand === 0) {
    score *= 0.45;
  }

  return score;
}

export function rankBySourceAndStatus(food: { source?: string; status?: string }): number {
  if (food.source === 'INTERNAL') return 0;
  if (food.source === 'USER_SCAN' && food.status === 'VERIFIED') return 1;
  if (food.source === 'EXTERNAL_API') return 2;
  if (food.source === 'USER_SCAN' && food.status === 'UNVERIFIED') return 3;
  return 4;
}

/** Forrás rank + szöveges relevancia + createdAt */
export function compareFoodsForSearch(a: any, b: any, query: string): number {
  const rankDiff = rankBySourceAndStatus(a) - rankBySourceAndStatus(b);
  if (rankDiff !== 0) return rankDiff;

  if (query) {
    const relDiff = textRelevanceScore(b, query) - textRelevanceScore(a, query);
    if (relDiff !== 0) return relDiff;
  }

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
