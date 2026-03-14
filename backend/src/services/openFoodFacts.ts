// Open Food Facts API integráció
// Docs: https://world.openfoodfacts.org/data

const OFF_BASE = 'https://world.openfoodfacts.org';

interface OFFProduct {
  code: string;
  product_name?: string;
  brands?: string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    'proteins_100g'?: number;
    'carbohydrates_100g'?: number;
    'fat_100g'?: number;
    'fiber_100g'?: number;
    'sugars_100g'?: number;
  };
  serving_size?: string;
  serving_quantity?: number;
  image_url?: string;
}

export interface OFFNormalizedFood {
  name: string;
  brand?: string;
  barcode?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  servingSize?: number;
  servingUnit?: string;
  source: 'OFF';
}

/**
 * Átalakítja az OFF product objektumot a saját Food formátumra.
 * Visszaad null-t, ha az alapvető tápértékek hiányoznak.
 */
export function normalizeOFFProduct(
  product: OFFProduct
): OFFNormalizedFood | null {
  const n = product.nutriments ?? {};

  const kcal = n['energy-kcal_100g'];
  const protein = n['proteins_100g'];
  const carbs = n['carbohydrates_100g'];
  const fat = n['fat_100g'];

  // Alapvető mezők nélkül nem mentjük
  if (
    kcal == null || protein == null ||
    carbs == null || fat == null
  ) return null;

  const name = product.product_name?.trim();
  if (!name) return null;

  // Adag felismerése (pl. "30 g" → 30)
  let servingSize: number | undefined;
  let servingUnit: string | undefined;
  if (product.serving_quantity) {
    servingSize = product.serving_quantity;
    servingUnit = 'adag';
  } else if (product.serving_size) {
    const match = product.serving_size.match(/^([\d.,]+)\s*(\w*)/);
    if (match) {
      servingSize = parseFloat(match[1].replace(',', '.'));
      servingUnit = match[2] || 'adag';
    }
  }

  return {
    name,
    brand: product.brands?.split(',')[0].trim() || undefined,
    barcode: product.code || undefined,
    kcal: Math.round(kcal * 10) / 10,
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fiber: n['fiber_100g'] != null ? Math.round(n['fiber_100g'] * 10) / 10 : undefined,
    sugar: n['sugars_100g'] != null ? Math.round(n['sugars_100g'] * 10) / 10 : undefined,
    servingSize,
    servingUnit,
    source: 'OFF',
  };
}

/**
 * Vonalkód-keresés az OFF API-n.
 * @returns Normalizált étel vagy null ha nem található / hiányos adat
 */
export async function fetchOFFByBarcode(
  barcode: string
): Promise<OFFNormalizedFood | null> {
  const url = `${OFF_BASE}/api/v2/product/${barcode}?fields=code,product_name,brands,nutriments,serving_size,serving_quantity`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'VitaScan/1.0 (https://vitascan.hu)' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return null;

  const data = await res.json();

  if (data.status !== 1 || !data.product) return null;

  return normalizeOFFProduct(data.product);
}

/**
 * Szöveges keresés az OFF API-n.
 * @returns Max 5 normalizált találat
 */
export async function searchOFF(
  query: string,
  page = 1
): Promise<OFFNormalizedFood[]> {
  const params = new URLSearchParams({
    action: 'process',
    search_terms: query,
    search_simple: '1',
    json: '1',
    page_size: '10',
    page: page.toString(),
    fields: 'code,product_name,brands,nutriments,serving_size,serving_quantity',
  });

  const url = `${OFF_BASE}/cgi/search.pl?${params}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'VitaScan/1.0 (https://vitascan.hu)' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const products: OFFProduct[] = data.products ?? [];

  return products
    .map(normalizeOFFProduct)
    .filter((p): p is OFFNormalizedFood => p !== null)
    .slice(0, 5);
}
