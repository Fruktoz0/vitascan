/** Cirill betűk — ilyen nevű ételeket nem jelenítünk meg. */
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;

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
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const scoreField = (value: string | null | undefined, weight: number): number => {
    if (!value) return 0;
    const v = value.trim().toLowerCase();
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
