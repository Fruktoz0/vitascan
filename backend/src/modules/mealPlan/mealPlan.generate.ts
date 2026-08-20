import { MealPlanSlotSource, MealType, PrismaClient } from '@prisma/client';
import {
  formatQtyLabel,
  mergeNeeds,
  missingAgainstPantry,
  normalizeQty,
  type PantryUnit,
} from '../pantry/pantry.service';
import { inventMealPlanSlots } from './mealPlan.gemini';
import { bumpGenerateQuota, getGenerateQuota } from './mealPlan.quota';
import type { GeneratePlanInput, MissingCartInput } from './mealPlan.schema';
import { getWeekPlan, startOfIsoWeek, upsertSlot } from './mealPlan.service';
import { parseLocalDate, toDateKey } from '../log/log.service';
import { canAccessMealPlan, canAccessShoppingList } from '../shares/shareAccess';
import { notifyCartListAudience } from '../cart/cartEvents';
import { createRecipe } from '../recipes/recipes.service';

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

function recipeKey(title: string, mealType: string) {
  return `${mealType}::${title.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function categoryFor(meal: MealType): 'BREAKFAST' | 'LUNCH' | 'DINNER' {
  if (meal === 'BREAKFAST' || meal === 'LUNCH' || meal === 'DINNER') return meal;
  if (meal === 'TIZORAI') return 'BREAKFAST';
  if (meal === 'UZSONNA' || meal === 'SNACK') return 'LUNCH';
  return 'DINNER';
}

function effortFor(minutes: number): 'QUICK' | 'NORMAL' | 'PROJECT' {
  if (minutes <= 20) return 'QUICK';
  if (minutes >= 50) return 'PROJECT';
  return 'NORMAL';
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
  const locale = data.locale ?? 'hu';

  const [plan, pantryRows, profile] = await Promise.all([
    prisma.mealPlan.findUnique({
      where: { userId_weekStart: { userId: ownerId, weekStart } },
      include: { slots: true },
    }),
    usePantry ? prisma.pantryItem.findMany({ where: { userId: ownerId } }) : Promise.resolve([]),
    prisma.userProfile.findUnique({
      where: { userId: ownerId },
      select: { dailyKcalGoal: true },
    }),
  ]);

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
        kcalHint: matchKcal || dailyKcal ? kcalSplit[meal] ?? null : kcalSplit[meal] ?? null,
      }));
  });

  if (empty.length === 0) {
    throw httpError(
      400,
      data.scope === 'day'
        ? 'Ezen a napon minden slot ki van töltve.'
        : 'Ezen a héten minden slot ki van töltve.',
    );
  }

  let invented;
  try {
    invented = await inventMealPlanSlots({
      locale,
      weekStart: toDateKey(weekStart),
      dates,
      meals,
      slotCaps: empty,
      diet,
      matchKcal,
      seasonal,
      month,
      usePantry,
      pantry: pantryRows.map((p) => ({
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
      })),
      dailyKcalGoal: dailyKcal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    throw httpError(
      (err as { statusCode?: number })?.statusCode && (err as { statusCode: number }).statusCode >= 400
        ? (err as { statusCode: number }).statusCode
        : 502,
      msg || (locale === 'en' ? 'Could not invent meal plan recipes.' : 'Nem sikerült receptet generálni.'),
    );
  }

  invented = invented.filter((slot) => {
    if (occupied.has(`${slot.date}:${slot.mealType}`)) return false;
    return empty.some((e) => e.date === slot.date && e.mealType === slot.mealType);
  });

  if (invented.length === 0) {
    throw httpError(400, locale === 'en' ? 'AI returned no usable meals.' : 'Az AI nem adott használható étkezést.');
  }

  const recipeIds = new Map<string, string>();
  let filled = 0;

  for (const slot of invented) {
    const key = recipeKey(slot.title, slot.mealType);
    let recipeId = recipeIds.get(key);
    if (!recipeId) {
      const minutes = slot.prepMinutes + slot.cookMinutes;
      try {
        const created = await createRecipe(
          prisma,
          ownerId,
          {
            title: slot.title,
            description: slot.description || null,
            servings: slot.servings,
            category: categoryFor(slot.mealType),
            dietTags: slot.dietTags,
            ingredients: slot.ingredients.map((ing, i) => ({
              name: ing.name,
              amount: ing.amount,
              unit: ing.unit,
              sortOrder: i,
            })),
            instructions: slot.instructions,
            sourceType: 'MANUAL',
            sourceUrl: null,
            sourceExternalId: null,
            prepMinutes: slot.prepMinutes,
            cookMinutes: slot.cookMinutes,
            effort: effortFor(minutes),
            seasonMonths: seasonal ? [month] : [],
            leftoverDays: 0,
          },
          role,
        );
        recipeId = created.id;
        recipeIds.set(key, recipeId);
      } catch (err) {
        // Skip this slot if recipe create fails; continue others.
        console.warn('[meal-plan generate] recipe create failed', err);
        continue;
      }
    }

    await upsertSlot(prisma, actorId, {
      weekStart: toDateKey(weekStart),
      ownerId,
      slotDate: slot.date,
      mealType: slot.mealType,
      source: 'RECIPE' as MealPlanSlotSource,
      recipeId,
      servings: 1,
    });
    occupied.add(`${slot.date}:${slot.mealType}`);
    filled += 1;
  }

  if (filled === 0) {
    throw httpError(
      400,
      locale === 'en'
        ? 'Could not create recipes for the plan.'
        : 'Nem sikerült receptet létrehozni a tervhez.',
    );
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
