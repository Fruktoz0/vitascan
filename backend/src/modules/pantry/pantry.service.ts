import type { PrismaClient } from '@prisma/client';
import { canAccessMealPlan } from '../shares/shareAccess';

export type PantryUnit = 'g' | 'ml' | 'db';

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseQtyLabel(label?: string | null): { quantity: number; unit: PantryUnit } | null {
  const raw = (label ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  const qty = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return normalizeQty(qty, m[2] || 'g');
}

export function normalizeQty(qty: number, unitRaw?: string | null): { quantity: number; unit: PantryUnit } {
  const u = (unitRaw ?? 'g').trim().toLowerCase().replace(/\./g, '');
  if (u === 'kg') return { quantity: qty * 1000, unit: 'g' };
  if (u === 'l' || u === 'liter') return { quantity: qty * 1000, unit: 'ml' };
  if (u === 'ml') return { quantity: qty, unit: 'ml' };
  if (u === 'db' || u === 'pc' || u === 'pcs' || u === 'adag' || u === 'csomag' || u === 'pack') {
    return { quantity: qty, unit: 'db' };
  }
  return { quantity: qty, unit: 'g' };
}

export function formatQtyLabel(quantity: number, unit: PantryUnit) {
  const n = quantity >= 10 ? Math.round(quantity) : Math.round(quantity * 10) / 10;
  return `${n} ${unit}`;
}

async function assertPantryAccess(prisma: PrismaClient, actorId: string, ownerId: string) {
  if (actorId === ownerId) return;
  if (!(await canAccessMealPlan(prisma, actorId, ownerId))) {
    throw httpError(403, 'Nincs jogosultság ehhez a kamrához.');
  }
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function macrosFor(row: {
  quantity: number;
  unit: string;
  food?: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    servingSize: number | null;
  } | null;
}) {
  if (!row.food) return null;
  const grams =
    row.unit === 'g' || row.unit === 'ml'
      ? row.quantity
      : (row.food.servingSize && row.food.servingSize > 0 ? row.food.servingSize : 100) * row.quantity;
  const r = grams / 100;
  return {
    kcal: Math.round(row.food.kcal * r),
    protein: round1(row.food.protein * r),
    carbs: round1(row.food.carbs * r),
    fat: round1(row.food.fat * r),
  };
}

export function serializePantryItem(row: {
  id: string;
  foodId: string | null;
  name: string;
  quantity: number;
  unit: string;
  expiresOn: Date | null;
  source: string;
  food?: {
    name: string;
    nameHu: string | null;
    nameEn: string | null;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    servingSize: number | null;
    servingUnit: string | null;
  } | null;
}) {
  return {
    id: row.id,
    foodId: row.foodId,
    name: row.food?.nameHu ?? row.food?.nameEn ?? row.food?.name ?? row.name,
    quantity: row.quantity,
    unit: row.unit,
    qtyLabel: formatQtyLabel(row.quantity, (row.unit as PantryUnit) || 'g'),
    expiresOn: row.expiresOn ? row.expiresOn.toISOString().slice(0, 10) : null,
    source: row.source,
    macros: macrosFor(row),
  };
}

const pantryInclude = {
  food: {
    select: {
      name: true,
      nameHu: true,
      nameEn: true,
      kcal: true,
      protein: true,
      carbs: true,
      fat: true,
      servingSize: true,
      servingUnit: true,
    },
  },
} as const;

export async function listPantry(prisma: PrismaClient, actorId: string, ownerId: string) {
  await assertPantryAccess(prisma, actorId, ownerId);
  const rows = await prisma.pantryItem.findMany({
    where: { userId: ownerId },
    include: pantryInclude,
    orderBy: [{ expiresOn: 'asc' }, { name: 'asc' }],
  });
  return rows.map(serializePantryItem);
}

async function findMergeTarget(
  prisma: PrismaClient,
  ownerId: string,
  foodId: string | null | undefined,
  name: string,
  unit: PantryUnit,
) {
  if (foodId) {
    const byFood = await prisma.pantryItem.findFirst({
      where: { userId: ownerId, foodId, unit },
    });
    if (byFood) return byFood;
  }
  const key = normalizeName(name);
  const rows = await prisma.pantryItem.findMany({
    where: { userId: ownerId, unit, foodId: foodId ? undefined : null },
  });
  return rows.find((r) => normalizeName(r.name) === key) ?? null;
}

export async function upsertPantryItem(
  prisma: PrismaClient,
  actorId: string,
  ownerId: string,
  data: {
    foodId?: string | null;
    name: string;
    quantity: number;
    unit?: string | null;
    expiresOn?: string | null;
    source?: string;
    merge?: boolean;
  },
) {
  await assertPantryAccess(prisma, actorId, ownerId);
  const name = data.name.trim();
  if (!name) throw httpError(400, 'A név kötelező.');
  const { quantity, unit } = normalizeQty(data.quantity, data.unit);
  if (quantity <= 0) throw httpError(400, 'Érvénytelen mennyiség.');

  let foodId = data.foodId ?? null;
  if (foodId) {
    const food = await prisma.food.findUnique({
      where: { id: foodId },
      select: { id: true, name: true, nameHu: true, nameEn: true },
    });
    if (!food) throw httpError(404, 'Az étel nem található.');
  }

  const expiresOn = data.expiresOn ? new Date(`${data.expiresOn}T00:00:00`) : null;
  const merge = data.merge !== false;
  const existing = merge ? await findMergeTarget(prisma, ownerId, foodId, name, unit) : null;

  const row = existing
    ? await prisma.pantryItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + quantity,
          name,
          foodId: foodId ?? existing.foodId,
          source: data.source ?? existing.source,
          ...(expiresOn ? { expiresOn } : {}),
        },
        include: pantryInclude,
      })
    : await prisma.pantryItem.create({
        data: {
          userId: ownerId,
          foodId,
          name,
          quantity,
          unit,
          expiresOn,
          source: data.source ?? 'MANUAL',
        },
        include: pantryInclude,
      });

  return serializePantryItem(row);
}

export async function patchPantryItem(
  prisma: PrismaClient,
  actorId: string,
  id: string,
  data: { quantity?: number; unit?: string | null; name?: string; expiresOn?: string | null },
) {
  const item = await prisma.pantryItem.findUnique({ where: { id } });
  if (!item) throw httpError(404, 'A tétel nem található.');
  await assertPantryAccess(prisma, actorId, item.userId);

  const nextQty =
    data.quantity != null
      ? normalizeQty(data.quantity, data.unit ?? item.unit)
      : data.unit
        ? normalizeQty(item.quantity, data.unit)
        : null;

  if (nextQty && nextQty.quantity <= 0) {
    await prisma.pantryItem.delete({ where: { id } });
    return { deleted: true, item: null };
  }

  const row = await prisma.pantryItem.update({
    where: { id },
    data: {
      ...(data.name?.trim() ? { name: data.name.trim() } : {}),
      ...(nextQty ? { quantity: nextQty.quantity, unit: nextQty.unit } : {}),
      ...(data.expiresOn !== undefined
        ? { expiresOn: data.expiresOn ? new Date(`${data.expiresOn}T00:00:00`) : null }
        : {}),
    },
    include: pantryInclude,
  });
  return { deleted: false, item: serializePantryItem(row) };
}

export async function deletePantryItem(prisma: PrismaClient, actorId: string, id: string) {
  const item = await prisma.pantryItem.findUnique({ where: { id } });
  if (!item) throw httpError(404, 'A tétel nem található.');
  await assertPantryAccess(prisma, actorId, item.userId);
  await prisma.pantryItem.delete({ where: { id } });
  return { ok: true };
}

export async function addFromCartChecked(
  prisma: PrismaClient,
  ownerId: string,
  item: { name: string; qtyLabel?: string | null; foodId?: string | null },
) {
  const parsed = parseQtyLabel(item.qtyLabel) ?? { quantity: 1, unit: 'db' as const };
  await upsertPantryItem(prisma, ownerId, ownerId, {
    foodId: item.foodId,
    name: item.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    source: 'CART_CHECKED',
    merge: true,
  });
}

type NeedLine = { key: string; foodId: string | null; name: string; quantity: number; unit: PantryUnit };

export function pantryCoverage(needs: NeedLine[], stock: Array<{ foodId: string | null; name: string; quantity: number; unit: string }>) {
  if (needs.length === 0) return 1;
  let covered = 0;
  const remaining = stock.map((s) => ({ ...s, quantity: s.quantity }));
  for (const need of needs) {
    let left = need.quantity;
    for (const row of remaining) {
      if (left <= 0) break;
      if (row.unit !== need.unit) continue;
      const same = (need.foodId && row.foodId === need.foodId) || normalizeName(row.name) === normalizeName(need.name);
      if (!same || row.quantity <= 0) continue;
      const take = Math.min(row.quantity, left);
      row.quantity -= take;
      left -= take;
    }
    covered += Math.max(0, need.quantity - left) / Math.max(need.quantity, 0.0001);
  }
  return covered / needs.length;
}

export async function subtractNeeds(
  prisma: PrismaClient,
  ownerId: string,
  needs: NeedLine[],
) {
  const stock = await prisma.pantryItem.findMany({ where: { userId: ownerId } });
  for (const need of needs) {
    let left = need.quantity;
    const matches = stock
      .filter((row) => {
        if (row.unit !== need.unit) return false;
        if (need.foodId && row.foodId === need.foodId) return true;
        return normalizeName(row.name) === normalizeName(need.name);
      })
      .sort((a, b) => a.quantity - b.quantity);

    for (const row of matches) {
      if (left <= 0) break;
      const take = Math.min(row.quantity, left);
      row.quantity -= take;
      left -= take;
      if (row.quantity <= 0.05) {
        await prisma.pantryItem.delete({ where: { id: row.id } });
      } else {
        await prisma.pantryItem.update({
          where: { id: row.id },
          data: { quantity: Math.round(row.quantity * 10) / 10 },
        });
      }
    }
  }
}

export function missingAgainstPantry(
  needs: NeedLine[],
  stock: Array<{ foodId: string | null; name: string; quantity: number; unit: string }>,
): NeedLine[] {
  const remaining = stock.map((s) => ({ ...s, quantity: s.quantity }));
  const out: NeedLine[] = [];
  for (const need of needs) {
    let left = need.quantity;
    for (const row of remaining) {
      if (left <= 0) break;
      if (row.unit !== need.unit) continue;
      const same = (need.foodId && row.foodId === need.foodId) || normalizeName(row.name) === normalizeName(need.name);
      if (!same || row.quantity <= 0) continue;
      const take = Math.min(row.quantity, left);
      row.quantity -= take;
      left -= take;
    }
    if (left > 0.05) {
      out.push({ ...need, quantity: Math.round(left * 10) / 10 });
    }
  }
  return out;
}

export function mergeNeeds(lines: NeedLine[]): NeedLine[] {
  const map = new Map<string, NeedLine>();
  for (const line of lines) {
    const key = `${line.unit}:${line.foodId || normalizeName(line.name)}`;
    const prev = map.get(key);
    if (prev) {
      prev.quantity += line.quantity;
      if (!prev.foodId && line.foodId) prev.foodId = line.foodId;
    } else {
      map.set(key, { ...line, key });
    }
  }
  return [...map.values()];
}
