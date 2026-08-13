import { PrismaClient } from '@prisma/client';
import { compareFoodsForSearch, textRelevanceScore } from '../../utils/foodSearch';

const SYNONYMS: Record<string, string[]> = {
  csirkemell: ['chicken breast', 'chickenbreast'],
  'chicken breast': ['csirkemell'],
  csirkecomb: ['chicken thigh'],
  'chicken thigh': ['csirkecomb'],
  tészta: ['pasta', 'teszta'],
  pasta: ['tészta', 'teszta'],
  rizs: ['rice'],
  rice: ['rizs'],
  tojás: ['egg', 'tojas'],
  egg: ['tojás', 'tojas'],
  tej: ['milk'],
  milk: ['tej'],
  tejszín: ['cream', 'tejszin', 'heavy cream'],
  cream: ['tejszín', 'tejszin'],
  hagyma: ['onion'],
  onion: ['hagyma'],
  fokhagyma: ['garlic'],
  garlic: ['fokhagyma'],
  paradicsom: ['tomato'],
  tomato: ['paradicsom'],
  olívaolaj: ['olive oil', 'olivaolaj'],
  'olive oil': ['olívaolaj', 'olivaolaj'],
  vaj: ['butter'],
  butter: ['vaj'],
  liszt: ['flour'],
  flour: ['liszt'],
  cukor: ['sugar'],
  sugar: ['cukor'],
  só: ['salt', 'so'],
  salt: ['só', 'so'],
  bors: ['pepper'],
  pepper: ['bors'],
};

const PREFIX_RE = /^(friss|frissen|kb\.?|kb|mintegy|körülbelül|circa|apróra\s+vágott|felkockázott|reszel(t|ve)|hámozott|opcionális|optional)\s+/i;

export type MatchableIngredient = {
  name: string;
  amount?: number | null;
  unit?: string | null;
  amountG?: number | null;
  foodId?: string | null;
  matchConfidence?: number | null;
  sortOrder?: number;
};

export type MatchedIngredient = MatchableIngredient & {
  foodId: string | null;
  matchConfidence: number | null;
  amountG: number | null;
  matchedFoodName: string | null;
  suggestedFood: { id: string; displayName: string } | null;
};

type FoodRow = {
  id: string;
  name: string;
  nameHu: string | null;
  nameEn: string | null;
  brand: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  source: string;
  status: string;
  createdAt: Date;
};

function normalizeName(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  s = s.replace(PREFIX_RE, '');
  s = s.replace(/[,.]$/g, '').trim();
  return s;
}

function queriesFor(name: string): string[] {
  const n = normalizeName(name);
  if (!n) return [];
  const extra = SYNONYMS[n] ?? [];
  return Array.from(new Set([n, ...extra]));
}

/** Convert amount+unit to grams. Piece units need servingSize from a matched food. */
export function amountToGrams(
  amount: number | null | undefined,
  unit: string | null | undefined,
  servingSize?: number | null,
): number | null {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
  const u = String(unit ?? 'g').trim().toLowerCase();
  const mass: Record<string, number> = {
    g: 1,
    gr: 1,
    gramm: 1,
    gram: 1,
    kg: 1000,
    mg: 0.001,
    ml: 1,
    milliliter: 1,
    l: 1000,
    liter: 1000,
    tk: 5,
    tsp: 5,
    teáskanál: 5,
    teakanal: 5,
    ek: 15,
    tbsp: 15,
    evőkanál: 15,
    evokanal: 15,
    csipet: 0.5,
    pinch: 0.5,
    cup: 240,
    cups: 240,
  };
  if (u in mass) return Math.round(amount * mass[u] * 10) / 10;
  if (['db', 'pc', 'pcs', 'darab', 'adag', 'serving', 'szelet', 'slice'].includes(u)) {
    if (servingSize && servingSize > 0) return Math.round(amount * servingSize * 10) / 10;
    return null;
  }
  return null;
}

function confidenceFromScore(score: number): number {
  return Math.max(0, Math.min(1, Math.round((score / 1000) * 100) / 100));
}

async function findCandidates(prisma: PrismaClient, queries: string[]): Promise<FoodRow[]> {
  const or = queries.flatMap((q) => [
    { name: { contains: q, mode: 'insensitive' as const } },
    { nameHu: { contains: q, mode: 'insensitive' as const } },
    { nameEn: { contains: q, mode: 'insensitive' as const } },
  ]);
  if (!or.length) return [];
  return prisma.food.findMany({
    where: {
      status: { not: 'BANNED' },
      preparedFromRecipeId: null,
      isPrepared: false,
      OR: or,
    },
    take: 40,
    select: {
      id: true,
      name: true,
      nameHu: true,
      nameEn: true,
      brand: true,
      servingSize: true,
      servingUnit: true,
      source: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function matchIngredients(
  prisma: PrismaClient,
  ingredients: MatchableIngredient[],
): Promise<MatchedIngredient[]> {
  const out: MatchedIngredient[] = [];
  for (const [idx, ing] of ingredients.entries()) {
    const queries = queriesFor(ing.name);
    const primary = queries[0] ?? normalizeName(ing.name);
    let foodId: string | null = ing.foodId ?? null;
    let matchConfidence: number | null = ing.matchConfidence ?? null;
    let matchedFoodName: string | null = null;
    let suggestedFood: { id: string; displayName: string } | null = null;
    let servingSize: number | null = null;

    if (foodId) {
      const existing = await prisma.food.findUnique({
        where: { id: foodId },
        select: { id: true, name: true, nameHu: true, nameEn: true, servingSize: true },
      });
      if (existing) {
        matchedFoodName = existing.nameHu ?? existing.nameEn ?? existing.name;
        servingSize = existing.servingSize;
        if (matchConfidence == null) matchConfidence = 1;
      } else {
        foodId = null;
      }
    }

    if (!foodId && primary) {
      const candidates = await findCandidates(prisma, queries);
      const sorted = candidates.slice().sort((a, b) => compareFoodsForSearch(a, b, primary));
      const best = sorted[0];
      if (best) {
        const score = Math.max(...queries.map((q) => textRelevanceScore(best, q)));
        const conf = confidenceFromScore(score);
        const display = best.nameHu ?? best.nameEn ?? best.name;
        servingSize = best.servingSize;
        if (conf >= 0.85) {
          foodId = best.id;
          matchConfidence = conf;
          matchedFoodName = display;
        } else if (conf >= 0.5) {
          matchConfidence = conf;
          suggestedFood = { id: best.id, displayName: display };
        } else {
          matchConfidence = conf;
        }
      }
    }

    let amountG = amountToGrams(ing.amount, ing.unit, servingSize);
    if (amountG == null && ing.amountG != null && Number.isFinite(ing.amountG)) {
      amountG = ing.amountG;
    }

    out.push({
      name: ing.name,
      amount: ing.amount ?? null,
      unit: ing.unit ?? null,
      amountG,
      foodId,
      matchConfidence,
      matchedFoodName,
      suggestedFood,
      sortOrder: ing.sortOrder ?? idx,
    });
  }
  return out;
}

export type NutritionSummary = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  gramsPerServing: number;
  incomplete: boolean;
  matchedCount: number;
  totalCount: number;
} | null;

export function computeNutrition(
  ingredients: Array<{ foodId?: string | null; amountG?: number | null }>,
  foods: Array<{
    id: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
    sugar: number | null;
  }>,
  servings: number,
): NutritionSummary {
  const map = new Map(foods.map((f) => [f.id, f]));
  const totalCount = ingredients.length;
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let sugar = 0;
  let matchedCount = 0;
  let matchedGrams = 0;
  for (const ing of ingredients) {
    if (!ing.foodId || ing.amountG == null || !(ing.amountG > 0)) continue;
    const food = map.get(ing.foodId);
    if (!food) continue;
    const r = ing.amountG / 100;
    kcal += food.kcal * r;
    protein += food.protein * r;
    carbs += food.carbs * r;
    fat += food.fat * r;
    fiber += (food.fiber ?? 0) * r;
    sugar += (food.sugar ?? 0) * r;
    matchedCount += 1;
    matchedGrams += ing.amountG;
  }
  if (matchedCount === 0) return null;
  const n = Math.max(1, servings || 1);
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    kcal: Math.round(kcal / n),
    protein: round1(protein / n),
    carbs: round1(carbs / n),
    fat: round1(fat / n),
    fiber: round1(fiber / n),
    sugar: round1(sugar / n),
    gramsPerServing: round1(matchedGrams / n),
    incomplete: matchedCount < totalCount,
    matchedCount,
    totalCount,
  };
}

export async function nutritionForIngredients(
  prisma: PrismaClient,
  ingredients: Array<{ foodId?: string | null; amountG?: number | null }>,
  servings: number,
): Promise<NutritionSummary> {
  const ids = Array.from(new Set(ingredients.map((i) => i.foodId).filter((id): id is string => Boolean(id))));
  if (!ids.length) return null;
  const foods = await prisma.food.findMany({
    where: { id: { in: ids } },
    select: { id: true, kcal: true, protein: true, carbs: true, fat: true, fiber: true, sugar: true },
  });
  return computeNutrition(ingredients, foods, servings);
}

export async function matchDraftIngredients(
  prisma: PrismaClient,
  ingredients: MatchableIngredient[],
  servings: number,
) {
  const matched = await matchIngredients(prisma, ingredients);
  const nutrition = await nutritionForIngredients(prisma, matched, servings);
  return { ingredients: matched, nutrition };
}
