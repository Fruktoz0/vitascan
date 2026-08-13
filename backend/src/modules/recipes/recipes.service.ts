import { Prisma, PrismaClient, RecipeStatus } from '@prisma/client';
import type { CreateRecipeInput, LogRecipeInput, RecipeListQuery, UpdateRecipeInput } from './recipes.schema';
import {
  deleteRecipeFile,
  promoteTempImage,
  savePermanentRecipeImage,
} from './recipes.image.service';
import { matchIngredients, computeNutrition, type NutritionSummary } from './recipes.match.service';
import { createLog } from '../log/log.service';
import { httpError } from './recipes.types';

const recipeInclude = {
  creator: { select: { id: true, username: true } },
  ingredients: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      food: {
        select: {
          id: true,
          name: true,
          nameHu: true,
          nameEn: true,
          kcal: true,
          protein: true,
          carbs: true,
          fat: true,
          fiber: true,
          sugar: true,
        },
      },
    },
  },
  images: { where: { isPrimary: true }, take: 1, select: { id: true } },
} satisfies Prisma.RecipeInclude;

function asStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((s) => String(s ?? '').trim()).filter(Boolean);
}

function canView(recipe: { status: RecipeStatus; createdBy: string }, userId: string, role: string) {
  if (recipe.status === 'PUBLISHED') return true;
  if (recipe.createdBy === userId) return true;
  return role === 'ADMIN';
}

function canMutate(recipe: { createdBy: string }, userId: string, role: string) {
  return recipe.createdBy === userId || role === 'ADMIN';
}

function visibilityWhere(userId: string): Prisma.RecipeWhereInput {
  return {
    OR: [{ status: 'PUBLISHED' }, { createdBy: userId }],
  };
}

export function mapRecipeListItem(
  recipe: Prisma.RecipeGetPayload<{ include: typeof recipeInclude }> & { favorites?: { id: string }[] },
) {
  const nutrition = computeNutrition(
    recipe.ingredients,
    recipe.ingredients.map((i) => i.food).filter((f): f is NonNullable<typeof f> => Boolean(f)),
    recipe.servings,
  );
  return {
    id: recipe.id,
    title: recipe.title,
    servings: recipe.servings,
    category: recipe.category,
    status: recipe.status,
    sourceType: recipe.sourceType,
    createdAt: recipe.createdAt,
    createdBy: recipe.creator,
    hasImage: (recipe.images?.length ?? 0) > 0,
    isFavorite: (recipe.favorites?.length ?? 0) > 0,
    nutrition,
  };
}

export function mapRecipeDetail(
  recipe: {
    id: string;
    title: string;
    description: string | null;
    servings: number;
    category: string | null;
    instructions: Prisma.JsonValue;
    sourceUrl: string | null;
    sourceType: string;
    sourceExternalId?: string | null;
    status: string;
    rejectReason?: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    creator: { id: string; username: string };
    images: { id: string; isPrimary: boolean }[];
    ingredients: Array<{
      id: string;
      name: string;
      amount: number | null;
      unit: string | null;
      amountG: number | null;
      matchConfidence: number | null;
      sortOrder: number;
      foodId: string | null;
      food?: {
        id: string;
        name: string;
        nameHu: string | null;
        nameEn: string | null;
        kcal: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number | null;
        sugar: number | null;
      } | null;
    }>;
    favorites?: { id: string }[];
  },
  userId: string,
) {
  const foods = recipe.ingredients.map((i) => i.food).filter((f): f is NonNullable<typeof f> => Boolean(f));
  const nutrition: NutritionSummary = computeNutrition(recipe.ingredients, foods, recipe.servings);
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    category: recipe.category,
    instructions: asStringArray(recipe.instructions),
    sourceUrl: recipe.sourceUrl,
    sourceType: recipe.sourceType,
    sourceExternalId: recipe.sourceExternalId ?? null,
    status: recipe.status,
    rejectReason: recipe.rejectReason ?? null,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    createdBy: recipe.creator,
    hasImage: recipe.images.some((img) => img.isPrimary) || recipe.images.length > 0,
    isFavorite: (recipe.favorites?.length ?? 0) > 0,
    isOwner: recipe.createdBy === userId,
    nutrition,
    ingredients: recipe.ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      amountG: ing.amountG,
      matchConfidence: ing.matchConfidence,
      sortOrder: ing.sortOrder,
      foodId: ing.foodId,
      matchedFoodName: ing.food ? ing.food.nameHu ?? ing.food.nameEn ?? ing.food.name : null,
    })),
  };
}

export async function listRecipes(prisma: PrismaClient, userId: string, query: RecipeListQuery) {
  const where: Prisma.RecipeWhereInput = {
    AND: [visibilityWhere(userId)],
  };
  if (query.category) {
    (where.AND as Prisma.RecipeWhereInput[]).push({ category: query.category });
  }
  const search = query.search?.trim();
  if (search) {
    (where.AND as Prisma.RecipeWhereInput[]).push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { ingredients: { some: { name: { contains: search, mode: 'insensitive' } } } },
      ],
    });
  }

  const skip = (query.page - 1) * query.limit;
  const [total, rows] = await Promise.all([
    prisma.recipe.count({ where }),
    prisma.recipe.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        ...recipeInclude,
        favorites: { where: { userId }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  return {
    recipes: rows.map(mapRecipeListItem),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getRecipe(prisma: PrismaClient, id: string, userId: string, role: string) {
  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true } },
      ingredients: {
        orderBy: { sortOrder: 'asc' },
        include: {
          food: {
            select: {
              id: true,
              name: true,
              nameHu: true,
              nameEn: true,
              kcal: true,
              protein: true,
              carbs: true,
              fat: true,
              fiber: true,
              sugar: true,
            },
          },
        },
      },
      images: { select: { id: true, isPrimary: true, storageKey: true } },
      favorites: { where: { userId }, select: { id: true }, take: 1 },
    },
  });
  if (!recipe) throw httpError(404, 'A recept nem található.');
  if (!canView(recipe, userId, role)) throw httpError(404, 'A recept nem található.');
  return recipe;
}

export async function createRecipe(
  prisma: PrismaClient,
  userId: string,
  data: CreateRecipeInput,
) {
  let image: Awaited<ReturnType<typeof promoteTempImage>> | null = null;
  if (data.tempImageKey) {
    image = await promoteTempImage(userId, data.tempImageKey);
  }

  const matched = await matchIngredients(prisma, data.ingredients);

  try {
    const recipe = await prisma.recipe.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        servings: data.servings,
        category: data.category ?? null,
        instructions: data.instructions,
        sourceUrl: data.sourceUrl ?? null,
        sourceType: data.sourceType,
        sourceExternalId: data.sourceExternalId?.trim() || null,
        status: 'PENDING',
        createdBy: userId,
        ingredients: {
          create: matched.map((ing, idx) => ({
            name: ing.name,
            amount: ing.amount ?? null,
            unit: ing.unit ?? null,
            amountG: ing.amountG ?? null,
            matchConfidence: ing.matchConfidence ?? null,
            sortOrder: ing.sortOrder ?? idx,
            foodId: ing.foodId,
          })),
        },
        ...(image
          ? {
              images: {
                create: {
                  storageKey: image.storageKey,
                  mimeType: image.mimeType,
                  width: image.width,
                  height: image.height,
                  sizeBytes: image.sizeBytes,
                  isPrimary: true,
                },
              },
            }
          : {}),
      },
      include: {
        creator: { select: { id: true, username: true } },
        ingredients: recipeInclude.ingredients,
        images: { select: { id: true, isPrimary: true } },
      },
    });
    return mapRecipeDetail({ ...recipe, favorites: [] }, userId);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw httpError(409, 'Ez a recept már megtalálható.');
    }
    throw err;
  }
}

export async function updateRecipe(
  prisma: PrismaClient,
  id: string,
  userId: string,
  role: string,
  data: UpdateRecipeInput,
) {
  const existing = await prisma.recipe.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!existing) throw httpError(404, 'A recept nem található.');
  if (!canMutate(existing, userId, role)) throw httpError(403, 'Nincs jogosultsága szerkeszteni ezt a receptet.');

  if (data.tempImageKey) {
    const image = await promoteTempImage(userId, data.tempImageKey);
    const oldPrimary = existing.images.filter((img) => img.isPrimary);
    await prisma.$transaction([
      prisma.recipeImage.updateMany({ where: { recipeId: id }, data: { isPrimary: false } }),
      prisma.recipeImage.create({
        data: {
          recipeId: id,
          storageKey: image.storageKey,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          sizeBytes: image.sizeBytes,
          isPrimary: true,
        },
      }),
    ]);
    for (const img of oldPrimary) await deleteRecipeFile(img.storageKey);
  }

  const resubmit = existing.status === 'REJECTED' && existing.createdBy === userId;

  const recipe = await prisma.recipe.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.servings !== undefined ? { servings: data.servings } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.instructions !== undefined ? { instructions: data.instructions } : {}),
      ...(data.sourceUrl !== undefined ? { sourceUrl: data.sourceUrl } : {}),
      ...(data.sourceType !== undefined ? { sourceType: data.sourceType } : {}),
      ...(resubmit ? { status: 'PENDING' as const, rejectReason: null } : {}),
      ...(data.ingredients
        ? {
            ingredients: {
              deleteMany: {},
              create: (await matchIngredients(prisma, data.ingredients)).map((ing, idx) => ({
                name: ing.name,
                amount: ing.amount ?? null,
                unit: ing.unit ?? null,
                amountG: ing.amountG ?? null,
                matchConfidence: ing.matchConfidence ?? null,
                sortOrder: ing.sortOrder ?? idx,
                foodId: ing.foodId,
              })),
            },
          }
        : {}),
    },
    include: {
      creator: { select: { id: true, username: true } },
      ingredients: recipeInclude.ingredients,
      images: { select: { id: true, isPrimary: true } },
      favorites: { where: { userId }, select: { id: true }, take: 1 },
    },
  });

  return mapRecipeDetail(recipe, userId);
}

export async function deleteRecipe(prisma: PrismaClient, id: string, userId: string, role: string) {
  const existing = await prisma.recipe.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!existing) throw httpError(404, 'A recept nem található.');
  if (!canMutate(existing, userId, role)) throw httpError(403, 'Nincs jogosultsága törölni ezt a receptet.');

  await prisma.recipe.delete({ where: { id } });
  for (const img of existing.images) await deleteRecipeFile(img.storageKey);
}

export async function attachRecipeImage(
  prisma: PrismaClient,
  recipeId: string,
  userId: string,
  role: string,
  buf: Buffer,
) {
  const existing = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { images: true },
  });
  if (!existing) throw httpError(404, 'A recept nem található.');
  if (!canMutate(existing, userId, role)) throw httpError(403, 'Nincs jogosultsága módosítani ezt a receptet.');

  const image = await savePermanentRecipeImage(buf);
  const oldPrimary = existing.images.filter((img) => img.isPrimary);
  await prisma.$transaction([
    prisma.recipeImage.updateMany({ where: { recipeId }, data: { isPrimary: false } }),
    prisma.recipeImage.create({
      data: {
        recipeId,
        storageKey: image.storageKey,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sizeBytes: image.sizeBytes,
        isPrimary: true,
      },
    }),
  ]);
  for (const img of oldPrimary) await deleteRecipeFile(img.storageKey);
  return { ok: true };
}

export async function getPrimaryStorageKey(prisma: PrismaClient, recipeId: string) {
  const img = await prisma.recipeImage.findFirst({
    where: { recipeId, isPrimary: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!img) {
    return prisma.recipeImage.findFirst({
      where: { recipeId },
      orderBy: { createdAt: 'asc' },
    });
  }
  return img;
}

export async function favoriteRecipe(prisma: PrismaClient, recipeId: string, userId: string, role: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) throw httpError(404, 'A recept nem található.');
  if (!canView(recipe, userId, role)) throw httpError(404, 'A recept nem található.');
  await prisma.recipeFavorite.upsert({
    where: { userId_recipeId: { userId, recipeId } },
    create: { userId, recipeId },
    update: {},
  });
  return { isFavorite: true };
}

export async function unfavoriteRecipe(prisma: PrismaClient, recipeId: string, userId: string) {
  await prisma.recipeFavorite.deleteMany({ where: { userId, recipeId } });
  return { isFavorite: false };
}

export { canView };

function isDuplicateForViewer(
  hit: { id: string; title: string; status: RecipeStatus; createdBy: string },
  viewerId?: string,
) {
  if (hit.status === 'PUBLISHED' || hit.status === 'PENDING') return true;
  return Boolean(viewerId && hit.createdBy === viewerId);
}

export async function findDuplicateRecipe(
  prisma: PrismaClient,
  sourceType: string,
  sourceExternalId?: string | null,
  sourceUrl?: string | null,
  viewerId?: string,
) {
  const select = { id: true, title: true, status: true, createdBy: true } as const;
  if (sourceExternalId) {
    const hit = await prisma.recipe.findFirst({
      where: { sourceType: sourceType as never, sourceExternalId },
      select,
    });
    if (hit && isDuplicateForViewer(hit, viewerId)) return hit;
  }
  if (sourceUrl) {
    const hit = await prisma.recipe.findFirst({
      where: { sourceUrl, status: { not: 'REJECTED' } },
      select,
    });
    if (hit && isDuplicateForViewer(hit, viewerId)) return hit;
  }
  return null;
}

export async function listAdminRecipes(
  prisma: PrismaClient,
  query: { status?: RecipeStatus; page?: number; limit?: number },
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const where: Prisma.RecipeWhereInput = query.status ? { status: query.status } : {};
  const [total, rows] = await Promise.all([
    prisma.recipe.count({ where }),
    prisma.recipe.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        creator: { select: { id: true, username: true } },
        images: { where: { isPrimary: true }, take: 1, select: { id: true } },
        _count: { select: { ingredients: true } },
      },
    }),
  ]);
  return {
    recipes: rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      sourceType: r.sourceType,
      sourceUrl: r.sourceUrl,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
      createdBy: r.creator,
      hasImage: r.images.length > 0,
      ingredientCount: r._count.ingredients,
    })),
    page,
    limit,
    total,
  };
}

export async function moderateRecipe(
  prisma: PrismaClient,
  id: string,
  action: 'approve' | 'reject',
  reason?: string | null,
) {
  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'A recept nem található.');
  const recipe = await prisma.recipe.update({
    where: { id },
    data:
      action === 'approve'
        ? { status: 'PUBLISHED', rejectReason: null }
        : { status: 'REJECTED', rejectReason: reason?.trim() || null },
    include: {
      creator: { select: { id: true, username: true } },
      ingredients: recipeInclude.ingredients,
      images: { select: { id: true, isPrimary: true } },
    },
  });
  return mapRecipeDetail(recipe, existing.createdBy);
}

async function upsertPreparedFood(prisma: PrismaClient, recipeId: string) {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      ingredients: {
        orderBy: { sortOrder: 'asc' },
        include: {
          food: {
            select: { id: true, kcal: true, protein: true, carbs: true, fat: true, fiber: true, sugar: true },
          },
        },
      },
    },
  });
  if (!recipe) throw httpError(404, 'A recept nem található.');

  const components = recipe.ingredients.flatMap((ing, idx) => {
    if (!ing.foodId || !ing.food || ing.amountG == null || ing.amountG <= 0) return [];
    const r = ing.amountG / 100;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    return [
      {
        name: ing.name,
        amountG: ing.amountG,
        kcal: round1(ing.food.kcal * r),
        protein: round1(ing.food.protein * r),
        carbs: round1(ing.food.carbs * r),
        fat: round1(ing.food.fat * r),
        fiber: ing.food.fiber != null ? round1(ing.food.fiber * r) : null,
        sugar: ing.food.sugar != null ? round1(ing.food.sugar * r) : null,
        sortOrder: idx,
      },
    ];
  });
  if (!components.length) {
    throw httpError(400, 'Nincs elég párosított hozzávaló a naplózáshoz.');
  }

  const totalG = components.reduce((s, c) => s + c.amountG, 0) || 100;
  const sum = components.reduce(
    (acc, c) => ({
      kcal: acc.kcal + c.kcal,
      protein: acc.protein + c.protein,
      carbs: acc.carbs + c.carbs,
      fat: acc.fat + c.fat,
      fiber: acc.fiber + (c.fiber ?? 0),
      sugar: acc.sugar + (c.sugar ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
  );
  const per100 = (n: number) => Math.round((n / totalG) * 100 * 10) / 10;

  const existing = await prisma.food.findUnique({ where: { preparedFromRecipeId: recipe.id } });
  const data = {
    name: recipe.title,
    nameHu: recipe.title,
    kcal: per100(sum.kcal),
    protein: per100(sum.protein),
    carbs: per100(sum.carbs),
    fat: per100(sum.fat),
    fiber: per100(sum.fiber),
    sugar: per100(sum.sugar),
    servingSize: totalG / Math.max(1, recipe.servings),
    servingUnit: 'adag',
    isPrepared: true,
    source: 'INTERNAL' as const,
    status: 'UNVERIFIED' as const,
    creatorId: recipe.createdBy,
    preparedFromRecipeId: recipe.id,
  };

  if (existing) {
    await prisma.foodComponent.deleteMany({ where: { foodId: existing.id } });
    return prisma.food.update({
      where: { id: existing.id },
      data: {
        ...data,
        components: { create: components },
      },
    });
  }

  return prisma.food.create({
    data: {
      ...data,
      components: { create: components },
    },
  });
}

export async function logRecipeToDiary(
  prisma: PrismaClient,
  recipeId: string,
  userId: string,
  role: string,
  input: LogRecipeInput,
) {
  const recipe = await getRecipe(prisma, recipeId, userId, role);
  if (recipe.status === 'REJECTED') {
    throw httpError(400, 'Elutasított receptet nem lehet naplózni.');
  }
  if (recipe.status !== 'PUBLISHED' && recipe.createdBy !== userId && role !== 'ADMIN') {
    throw httpError(403, 'Ez a recept még nem elérhető a naplóhoz.');
  }
  const prepared = await upsertPreparedFood(prisma, recipeId);
  const requested = input.servings;
  const recipeServings = Math.max(1, recipe.servings);
  const servingG = prepared.servingSize && prepared.servingSize > 0 ? prepared.servingSize : 100;
  const amountG = Math.max(1, Math.round(servingG * requested * 10) / 10);

  const log = await createLog(prisma, userId, {
    foodId: prepared.id,
    foodName: recipe.title,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    amount: amountG,
    mealType: input.mealType,
    source: 'RECIPE',
    date: input.date,
    sourcePreparedFoodId: prepared.id,
  });
  return log;
}
