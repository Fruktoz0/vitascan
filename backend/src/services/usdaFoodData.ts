// USDA FoodData Central API
// Docs: https://fdc.nal.usda.gov/api-guide.html

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

/** FDC nutrient number → mező */
const NUTRIENT = {
  kcal: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  fiber: 1079,
  sugar: 2000,
} as const;

export interface USDANormalizedFood {
  name: string;
  brand?: string;
  barcode?: string;
  externalId: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  servingSize?: number;
  servingUnit?: string;
  source: 'EXTERNAL_API';
}

interface FdcNutrient {
  nutrientNumber?: string | number;
  nutrientId?: number;
  value?: number;
  amount?: number;
}

interface FdcFood {
  fdcId: number;
  description?: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: FdcNutrient[];
}

function nutrientValue(nutrients: FdcNutrient[], number: number): number | undefined {
  const hit = nutrients.find((n) => {
    const num = n.nutrientNumber != null ? Number(n.nutrientNumber) : undefined;
    return num === number;
  });
  if (!hit) return undefined;
  const v = hit.value ?? hit.amount;
  return v != null && Number.isFinite(v) ? v : undefined;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Normalizálja az FDC találatot 100g-ra.
 * Branded ételeknél a tápérték gyakran adagonként van — ha van servingSize (g),
 * arányosítunk 100g-ra. Foundation / SR Legacy általában már 100g-ra van.
 */
export function normalizeUSDAFood(food: FdcFood): USDANormalizedFood | null {
  const name = food.description?.trim();
  if (!name || !food.fdcId) return null;
  if (/\p{Script=Cyrillic}/u.test(name)) return null;

  const nutrients = food.foodNutrients ?? [];
  let kcal = nutrientValue(nutrients, NUTRIENT.kcal);
  let protein = nutrientValue(nutrients, NUTRIENT.protein);
  let carbs = nutrientValue(nutrients, NUTRIENT.carbs);
  let fat = nutrientValue(nutrients, NUTRIENT.fat);
  let fiber = nutrientValue(nutrients, NUTRIENT.fiber);
  let sugar = nutrientValue(nutrients, NUTRIENT.sugar);

  if (kcal == null || protein == null || carbs == null || fat == null) return null;

  const isBranded = (food.dataType ?? '').toLowerCase() === 'branded';
  const servingG =
    isBranded &&
    food.servingSize != null &&
    food.servingSize > 0 &&
    (!food.servingSizeUnit || /^g(ram)?s?$/i.test(food.servingSizeUnit))
      ? food.servingSize
      : undefined;

  if (servingG != null && Math.abs(servingG - 100) > 0.5) {
    const factor = 100 / servingG;
    kcal *= factor;
    protein *= factor;
    carbs *= factor;
    fat *= factor;
    if (fiber != null) fiber *= factor;
    if (sugar != null) sugar *= factor;
  }

  const brand =
    food.brandName?.trim() ||
    food.brandOwner?.trim() ||
    undefined;

  const barcode = food.gtinUpc?.trim() || undefined;

  return {
    name,
    brand,
    barcode,
    externalId: `usda:${food.fdcId}`,
    kcal: round1(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    fiber: fiber != null ? round1(fiber) : undefined,
    sugar: sugar != null ? round1(sugar) : undefined,
    servingSize: servingG ?? 100,
    servingUnit: 'g',
    source: 'EXTERNAL_API',
  };
}

/**
 * Szöveges keresés az USDA FoodData Central API-n.
 * @returns Max 5 normalizált találat; üres ha nincs API kulcs / hiba
 */
export async function searchUSDA(
  query: string,
  pageSize = 8
): Promise<USDANormalizedFood[]> {
  const apiKey = process.env.USDA_API_KEY?.trim();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    pageSize: String(pageSize),
    pageNumber: '1',
  });

  const url = `${USDA_BASE}/foods/search?${params}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VitaScan/1.0 (https://vitascan.hu)',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const foods: FdcFood[] = data.foods ?? [];

    return foods
      .map(normalizeUSDAFood)
      .filter((p): p is USDANormalizedFood => p !== null)
      .slice(0, 5);
  } catch {
    return [];
  }
}
