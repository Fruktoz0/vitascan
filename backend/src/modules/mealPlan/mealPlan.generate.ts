import { MealPlanSlotSource, MealType, PrismaClient, type RecipeCategory } from '@prisma/client';
import { computeNutrition } from '../recipes/recipes.match.service';
import {
  formatQtyLabel,
  mergeNeeds,
  missingAgainstPantry,
  normalizeQty,
  pantryCoverage,
  type PantryUnit,
} from '../pantry/pantry.service';
import { assignMealPlanIds, type CatalogItem, type GenerateSlotPick } from './mealPlan.gemini';
import { bumpGenerateQuota, getGenerateQuota } from './mealPlan.quota';
import type { GeneratePlanInput, MissingCartInput } from './mealPlan.schema';
import { getWeekPlan, startOfIsoWeek, upsertSlot } from './mealPlan.service';
import { parseLocalDate, toDateKey } from '../log/log.service';
import { canAccessMealPlan, canAccessShoppingList } from '../shares/shareAccess';
import { notifyCartListAudience } from '../cart/cartEvents';

const PLAN_MEALS: Array<'BREAKFAST' | 'LUNCH' | 'DINNER'> = ['BREAKFAST', 'LUNCH', 'DINNER'];

function httpError(statusCode: number, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

function addDays(date: Date, n: number): Date {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
}

function isWeekend(date: Date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

export function slotMaxMinutes(date: Date, meal: MealType): number {
  const weekend = isWeekend(date);
  if (meal === 'BREAKFAST' || meal === 'TIZORAI') return weekend ? 30 : 10;
  if (meal === 'LUNCH' || meal === 'UZSONNA') return weekend ? 30 : 15;
  if (meal === 'DINNER') return weekend ? 60 : 35;
  return 20;
}

function recipeMinutes(row: { prepMinutes: number | null; cookMinutes: number | null; effort: string | null }) {
  const sum = (row.prepMinutes ?? 0) + (row.cookMinutes ?? 0);
  if (sum > 0) return sum;
  if (row.effort === 'QUICK') return 15;
  if (row.effort === 'PROJECT') return 60;
  return 30;
}

function recipeMeals(category: RecipeCategory | null): Array<'BREAKFAST' | 'LUNCH' | 'DINNER'> {
  if (category === 'BREAKFAST') return ['BREAKFAST'];
  if (category === 'LUNCH') return ['LUNCH'];
  if (category === 'DINNER') return ['DINNER'];
  return ['BREAKFAST', 'LUNCH', 'DINNER'];
}

type NeedLine = { key: string; foodId: string | null; name: string; quantity: number; unit: PantryUnit };

function ingredientNeeds(
  ingredients: Array<{ name: string; foodId: string | null; amountG: number | null; amount: number | null; unit: string | null }>,
  scale: number,
): NeedLine[] {
  const lines: NeedLine[] = [];
  for (const ing of ingredients) {
    if (ing.amountG && ing.amountG > 0) {
      lines.push({
        key: '',
        foodId: ing.foodId,
        name: ing.name,
        quantity: ing.amountG * scale,
        unit: 'g',
      });
      continue;
    }
    if (ing.amount && ing.amount > 0) {
      const q = normalizeQty(ing.amount * scale, ing.unit);
      lines.push({ key: '', foodId: ing.foodId, name: ing.name, quantity: q.quantity, unit: q.unit });
    }
  }
  return mergeNeeds(lines);
}

function greedyFill(
  empty: Array<{ date: string; mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER'; maxMinutes: number; kcalHint: number | null }>,
  catalog: CatalogItem[],
  existing: GenerateSlotPick[],
  matchKcal: boolean,
): GenerateSlotPick[] {
  const assigned = [...existing];
  const used = new Map<string, number>();
  for (const p of assigned) {
    const k = `${p.source}:${p.id}`;
    used.set(k, (used.get(k) ?? 0) + 1);
  }
  const taken = new Set(assigned.map((p) => `${p.date}:${p.mealType}`));

  for (const slot of empty) {
    if (taken.has(`${slot.date}:${slot.mealType}`)) continue;
    const kcalDist = (c: CatalogItem) =>
      matchKcal && slot.kcalHint && c.kcal != null ? Math.abs(c.kcal - slot.kcalHint) : 0;
    const ranked = catalog
      .filter((c) => c.minutes <= slot.maxMinutes)
      .filter((c) => c.meals.includes(slot.mealType) || c.meals.length === 3)
      .sort((a, b) => {
        const ua = used.get(`${a.source}:${a.id}`) ?? 0;
        const ub = used.get(`${b.source}:${b.id}`) ?? 0;
        if (ua !== ub) return ua - ub;
        if (matchKcal) {
          const da = kcalDist(a);
          const db = kcalDist(b);
          if (da !== db) return da - db;
        }
        if (b.pantryScore !== a.pantryScore) return b.pantryScore - a.pantryScore;
        return a.minutes - b.minutes;
      });
    const pick = ranked[0];
    if (!pick) continue;
    assigned.push({ date: slot.date, mealType: slot.mealType, source: pick.source, id: pick.id });
    taken.add(`${slot.date}:${slot.mealType}`);
    used.set(`${pick.source}:${pick.id}`, (used.get(`${pick.source}:${pick.id}`) ?? 0) + 1);

    if (slot.mealType === 'DINNER' && pick.leftoverDays > 0) {
      for (let i = 1; i <= pick.leftoverDays; i += 1) {
        const nextDate = toDateKey(addDays(parseLocalDate(slot.date) ?? new Date(), i));
        const key = `${nextDate}:DINNER`;
        if (taken.has(key)) continue;
        if (!empty.some((e) => e.date === nextDate && e.mealType === 'DINNER')) continue;
        assigned.push({ date: nextDate, mealType: 'DINNER', source: pick.source, id: pick.id });
        taken.add(key);
        used.set(`${pick.source}:${pick.id}`, (used.get(`${pick.source}:${pick.id}`) ?? 0) + 1);
      }
    }
  }
  return assigned;
}

export async function generateWeekPlan(
  prisma: PrismaClient,
  actorId: string,
  role: string,
  data: GeneratePlanInput,
) {
  const ownerId = data.ownerId || actorId;
  if (!(await canAccessMealPlan(prisma, actorId, ownerId))) {
    throw httpError(403, 'Nincs jogosultság ehhez az étkezéstervhez.');
  }
  const weekStart = startOfIsoWeek(data.weekStart ? parseLocalDate(data.weekStart) ?? new Date() : new Date());
  const quota = await getGenerateQuota(prisma, actorId, weekStart, role);
  if (quota.remaining <= 0) {
    throw httpError(403, `Ezen a héten elértéd a ${quota.limit} generálás limitet.`, {
      upgradeRequired: role !== 'ADMIN',
      feature: 'meal_plan_generate',
    });
  }

  const meals = (data.meals?.length ? data.meals : PLAN_MEALS) as Array<'BREAKFAST' | 'LUNCH' | 'DINNER'>;
  const month = weekStart.getMonth() + 1;
  const usePantry = data.usePantry !== false;
  const seasonal = data.seasonal !== false;
  const matchKcal = data.matchKcal === true;
  const diet = data.diet ?? [];
  const SUGAR_FREE_MAX = 5;

  const [plan, pantryRows, recipes, templates, profile] = await Promise.all([
    prisma.mealPlan.findUnique({
      where: { userId_weekStart: { userId: ownerId, weekStart } },
      include: { slots: true },
    }),
    usePantry
      ? prisma.pantryItem.findMany({ where: { userId: ownerId } })
      : Promise.resolve([]),
    prisma.recipe.findMany({
      where: {
        OR: [
          { createdBy: ownerId },
          { createdBy: actorId },
          { favorites: { some: { userId: { in: [ownerId, actorId] } } } },
          { status: 'PUBLISHED' },
        ],
      },
      take: 80,
      orderBy: { createdAt: 'desc' },
      include: {
        ingredients: { select: { name: true, foodId: true, amountG: true, amount: true, unit: true, food: { select: { id: true, kcal: true, protein: true, carbs: true, fat: true, fiber: true, sugar: true } } } },
        favorites: { where: { userId: { in: [ownerId, actorId] } }, select: { id: true }, take: 1 },
      },
    }),
    prisma.mealTemplate.findMany({
      where: { userId: { in: [ownerId, actorId] } },
      take: 40,
      include: { items: { select: { kcal: true, foodName: true, amount: true, foodId: true } } },
    }),
    prisma.userProfile.findUnique({
      where: { userId: ownerId },
      select: { dailyKcalGoal: true },
    }),
  ]);

  const pantryStock = pantryRows.map((p) => ({
    foodId: p.foodId,
    name: p.name,
    quantity: p.quantity,
    unit: p.unit,
  }));

  const tagDiet = diet.filter((d) => d !== 'SUGAR_FREE');
  const sugarFree = diet.includes('SUGAR_FREE');

  const catalog: CatalogItem[] = [];
  for (const recipe of recipes) {
    const foods = recipe.ingredients.map((i) => i.food).filter((f): f is NonNullable<typeof f> => Boolean(f));
    const nutrition = computeNutrition(recipe.ingredients, foods, recipe.servings || 1);
    if (!nutrition || nutrition.matchedCount <= 0) continue;
    if (seasonal && recipe.seasonMonths.length > 0 && !recipe.seasonMonths.includes(month)) continue;
    if (tagDiet.length > 0 && !tagDiet.every((d) => (recipe.dietTags as string[]).includes(d))) continue;
    if (sugarFree && nutrition.sugar > SUGAR_FREE_MAX) continue;
    const needs = ingredientNeeds(recipe.ingredients, 1);
    const minutes = recipeMinutes(recipe);
    catalog.push({
      id: recipe.id,
      source: 'RECIPE',
      title: recipe.title,
      minutes,
      leftoverDays: recipe.leftoverDays ?? 0,
      pantryScore: usePantry ? pantryCoverage(needs, pantryStock) : 0.5,
      kcal: nutrition.kcal,
      meals: recipeMeals(recipe.category),
    });
  }

  for (const tpl of templates) {
    if (tpl.items.length === 0) continue;
    if (diet.length > 0) continue;
    const kcal = tpl.items.reduce((s, i) => s + i.kcal, 0);
    const needs = mergeNeeds(
      tpl.items.map((i) => ({
        key: '',
        foodId: i.foodId,
        name: i.foodName,
        quantity: i.amount || 1,
        unit: 'g' as const,
      })),
    );
    catalog.push({
      id: tpl.id,
      source: 'TEMPLATE',
      title: tpl.name,
      minutes: 20,
      leftoverDays: 0,
      pantryScore: usePantry ? pantryCoverage(needs, pantryStock) : 0.5,
      kcal,
      meals: ['BREAKFAST', 'LUNCH', 'DINNER'],
    });
  }

  catalog.sort((a, b) => b.pantryScore - a.pantryScore);
  const trimmed = catalog.slice(0, 60);
  if (trimmed.length === 0) {
    if (diet.length > 0) {
      throw httpError(400, 'Nincs a kiválasztott diétához illő recept. Jelölj meg recepteket diétacímkével, vagy lazíts a szűrőn.');
    }
    throw httpError(400, 'Nincs elég párosított recept vagy sablon a generáláshoz.');
  }

  const existingSlots = plan?.slots ?? [];
  const occupied = new Set(
    existingSlots
      .filter((s) => s.source !== 'SKIPPED')
      .map((s) => `${toDateKey(s.slotDate)}:${s.mealType}`),
  );

  const weekDates = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i)));
  const dates =
    data.scope === 'day' && data.date && weekDates.includes(data.date)
      ? [data.date]
      : weekDates;
  const dailyKcal = profile?.dailyKcalGoal ?? null;
  const kcalSplit: Record<string, number | null> = {
    BREAKFAST: dailyKcal ? Math.round(dailyKcal * 0.25) : null,
    LUNCH: dailyKcal ? Math.round(dailyKcal * 0.4) : null,
    DINNER: dailyKcal ? Math.round(dailyKcal * 0.35) : null,
  };

  const empty = dates.flatMap((date) => {
    const d = parseLocalDate(date)!;
    return meals
      .filter((meal) => !occupied.has(`${date}:${meal}`))
      .map((meal) => ({
        date,
        mealType: meal,
        maxMinutes: slotMaxMinutes(d, meal),
        kcalHint: kcalSplit[meal] ?? null,
      }));
  });

  if (empty.length === 0) {
    throw httpError(400, 'Ezen a héten minden slot ki van töltve.');
  }

  const valid = new Set(trimmed.map((c) => `${c.source}:${c.id}`));
  let picks: GenerateSlotPick[] = [];
  try {
    picks = await assignMealPlanIds({
      locale: data.locale ?? 'hu',
      weekStart: toDateKey(weekStart),
      dates,
      meals,
      slotCaps: empty,
      catalog: trimmed,
      matchKcal,
    });
  } catch {
    picks = [];
  }

  picks = picks.filter((p) => {
    if (!valid.has(`${p.source}:${p.id}`)) return false;
    if (occupied.has(`${p.date}:${p.mealType}`)) return false;
    const item = trimmed.find((c) => c.id === p.id && c.source === p.source);
    const cap = empty.find((e) => e.date === p.date && e.mealType === p.mealType);
    if (!item || !cap) return false;
    return item.minutes <= cap.maxMinutes + 5;
  });

  picks = greedyFill(
    empty.map((e) => ({ date: e.date, mealType: e.mealType, maxMinutes: e.maxMinutes, kcalHint: e.kcalHint })),
    trimmed,
    picks,
    matchKcal,
  );

  let filled = 0;
  for (const pick of picks) {
    if (occupied.has(`${pick.date}:${pick.mealType}`)) continue;
    await upsertSlot(prisma, actorId, {
      weekStart: toDateKey(weekStart),
      ownerId,
      slotDate: pick.date,
      mealType: pick.mealType,
      source: pick.source as MealPlanSlotSource,
      recipeId: pick.source === 'RECIPE' ? pick.id : null,
      templateId: pick.source === 'TEMPLATE' ? pick.id : null,
    });
    occupied.add(`${pick.date}:${pick.mealType}`);
    filled += 1;
  }

  if (filled === 0) {
    throw httpError(400, 'Nem sikerült étkezést kiosztani a katalógusból.');
  }

  const used = await bumpGenerateQuota(prisma, actorId, weekStart);
  const week = await getWeekPlan(prisma, actorId, { weekStart: toDateKey(weekStart), ownerId });
  return {
    ...week,
    filled,
    generate: { used, limit: quota.limit, remaining: Math.max(0, quota.limit - used) },
  };
}

export async function missingIngredientsForWeek(
  prisma: PrismaClient,
  actorId: string,
  data: MissingCartInput,
) {
  const ownerId = data.ownerId || actorId;
  if (!(await canAccessMealPlan(prisma, actorId, ownerId))) {
    throw httpError(403, 'Nincs jogosultság ehhez az étkezéstervhez.');
  }
  const weekStart = startOfIsoWeek(data.weekStart ? parseLocalDate(data.weekStart) ?? new Date() : new Date());
  const plan = await prisma.mealPlan.findUnique({
    where: { userId_weekStart: { userId: ownerId, weekStart } },
    include: {
      slots: {
        where: { source: { in: ['RECIPE', 'FOOD'] } },
        include: {
          recipe: {
            select: {
              id: true,
              title: true,
              servings: true,
              ingredients: { select: { name: true, foodId: true, amountG: true, amount: true, unit: true } },
            },
          },
          food: { select: { id: true, name: true, nameHu: true, nameEn: true, servingSize: true } },
        },
      },
    },
  });

  const needs: NeedLine[] = [];
  for (const slot of plan?.slots ?? []) {
    if (slot.source === 'RECIPE' && slot.recipe) {
      const scale = (slot.servings || 1) / (slot.recipe.servings || 1);
      needs.push(...ingredientNeeds(slot.recipe.ingredients, scale));
    } else if (slot.source === 'FOOD' && slot.food) {
      const grams =
        slot.amountG && slot.amountG > 0
          ? slot.amountG
          : (slot.food.servingSize && slot.food.servingSize > 0 ? slot.food.servingSize : 100) * (slot.servings || 1);
      needs.push({
        key: '',
        foodId: slot.food.id,
        name: slot.food.nameHu ?? slot.food.nameEn ?? slot.food.name,
        quantity: grams,
        unit: 'g',
      });
    }
  }

  const merged = mergeNeeds(needs);
  const pantry = await prisma.pantryItem.findMany({ where: { userId: ownerId } });
  const missing = missingAgainstPantry(
    merged,
    pantry.map((p) => ({ foodId: p.foodId, name: p.name, quantity: p.quantity, unit: p.unit })),
  );

  return {
    recipeId: plan ? `meal-plan:${plan.id}` : `meal-plan:${toDateKey(weekStart)}`,
    recipeTitle: `Étkezésterv ${toDateKey(weekStart)}`,
    lines: missing.map((line) => ({
      name: line.name,
      qtyLabel: formatQtyLabel(line.quantity, line.unit),
      foodId: line.foodId ?? undefined,
    })),
  };
}

export async function addMissingToCart(prisma: PrismaClient, actorId: string, data: MissingCartInput) {
  const packed = await missingIngredientsForWeek(prisma, actorId, data);
  if (packed.lines.length === 0) {
    return { added: 0, ...packed, listId: data.listId ?? null };
  }

  let list = data.listId
    ? await prisma.shoppingList.findUnique({ where: { id: data.listId } })
    : await prisma.shoppingList.findFirst({ where: { ownerId: actorId }, orderBy: { createdAt: 'asc' } });

  if (data.listId && list && !(await canAccessShoppingList(prisma, actorId, list.ownerId))) {
    throw httpError(404, 'A lista nem található.');
  }

  if (!list) {
    list = await prisma.shoppingList.create({
      data: { ownerId: actorId, name: 'Bevásárlás' },
    });
  } else if (!(await canAccessShoppingList(prisma, actorId, list.ownerId))) {
    throw httpError(403, 'Nincs jogosultság ehhez a listához.');
  }

  await prisma.$transaction([
    prisma.shoppingListItem.deleteMany({
      where: { listId: list.id, recipeId: packed.recipeId },
    }),
    prisma.shoppingListItem.createMany({
      data: packed.lines.map((line, i) => ({
        listId: list!.id,
        name: line.name,
        qtyLabel: line.qtyLabel || null,
        foodId: line.foodId || null,
        recipeId: packed.recipeId,
        addedAt: new Date(Date.now() - i),
      })),
    }),
  ]);

  await notifyCartListAudience(prisma, list.ownerId);
  return { added: packed.lines.length, listId: list.id, ...packed };
}
