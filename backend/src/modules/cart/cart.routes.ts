import { FastifyPluginAsync } from 'fastify';
import { ShareCategory, ShareStatus } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { canAccessShoppingList } from '../shares/shareAccess';
import { notifyCartListAudience, subscribeCartUser } from './cartEvents';

const MAX_LISTS = 20;

const CreateListSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

const RenameListSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

const ItemInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  qtyLabel: z.string().trim().max(40).optional().nullable(),
  foodId: z.string().min(1).max(80).optional().nullable(),
  recipeId: z.string().min(1).max(80).optional().nullable(),
  checked: z.boolean().optional(),
  addedAt: z.number().optional(),
});

const AddItemSchema = ItemInputSchema;

const PatchItemSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    qtyLabel: z.string().trim().max(40).optional().nullable(),
    checked: z.boolean().optional(),
  })
  .refine((d) => d.name != null || d.qtyLabel !== undefined || d.checked != null, {
    message: 'Legalább egy mezőt meg kell adni.',
  });

const RecipeSchema = z.object({
  recipeId: z.string().min(1),
  lines: z.array(ItemInputSchema).min(1).max(80),
});

const MigrateSchema = z.object({
  lists: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        items: z.array(ItemInputSchema).max(200),
      }),
    )
    .max(MAX_LISTS),
});

function serializeItem(item: {
  id: string;
  name: string;
  qtyLabel: string | null;
  foodId: string | null;
  recipeId: string | null;
  checked: boolean;
  addedAt: Date;
}) {
  return {
    id: item.id,
    name: item.name,
    qtyLabel: item.qtyLabel ?? undefined,
    foodId: item.foodId ?? undefined,
    recipeId: item.recipeId ?? undefined,
    checked: item.checked,
    addedAt: item.addedAt.getTime(),
  };
}

function serializeList(
  list: {
    id: string;
    ownerId: string;
    name: string;
    createdAt: Date;
    items: Array<{
      id: string;
      name: string;
      qtyLabel: string | null;
      foodId: string | null;
      recipeId: string | null;
      checked: boolean;
      addedAt: Date;
    }>;
    owner?: { username: string };
  },
  me: string,
  sharedWith: string[] = [],
) {
  const shared = list.ownerId !== me;
  return {
    id: list.id,
    ownerId: list.ownerId,
    name: list.name,
    createdAt: list.createdAt.getTime(),
    shared,
    ownerLabel: shared ? list.owner?.username ?? undefined : undefined,
    sharedWith: shared || sharedWith.length === 0 ? undefined : sharedWith,
    items: [...list.items]
      .sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return b.addedAt.getTime() - a.addedAt.getTime();
      })
      .map(serializeItem),
  };
}

const listInclude = {
  items: true,
  owner: { select: { username: true } },
} as const;

const cartRoutes: FastifyPluginAsync = async (fastify) => {
  const pingOwner = (ownerId: string) => {
    void notifyCartListAudience(fastify.prisma, ownerId);
  };

  async function loadVisibleLists(me: string) {
    const shares = await fastify.prisma.dataShare.findMany({
      where: {
        partnerId: me,
        status: ShareStatus.ACTIVE,
        categories: { has: ShareCategory.CART },
      },
      select: { ownerId: true },
    });
    const ownerIds = [me, ...shares.map((s) => s.ownerId)];
    return fastify.prisma.shoppingList.findMany({
      where: { ownerId: { in: ownerIds } },
      include: listInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async function outgoingCartPartners(me: string): Promise<string[]> {
    const shares = await fastify.prisma.dataShare.findMany({
      where: {
        ownerId: me,
        status: { in: [ShareStatus.ACTIVE, ShareStatus.PENDING] },
      },
      select: { categories: true, partner: { select: { username: true } } },
    });
    return [
      ...new Set(
        shares
          .filter((row) => row.categories.includes(ShareCategory.CART))
          .map((row) => row.partner.username)
          .filter(Boolean),
      ),
    ];
  }

  async function packList(
    list: Parameters<typeof serializeList>[0],
    me: string,
  ) {
    return serializeList(list, me, await outgoingCartPartners(me));
  }

  async function packLists(
    lists: Array<Parameters<typeof serializeList>[0]>,
    me: string,
  ) {
    const sharedWith = await outgoingCartPartners(me);
    return lists.map((list) => serializeList(list, me, sharedWith));
  }

  fastify.get('/lists', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const lists = await loadVisibleLists(me);
    return reply.send({ lists: await packLists(lists, me) });
  });

  fastify.get(
    '/events',
    { preHandler: authenticate, config: { rateLimit: false } },
    async (request, reply) => {
      reply.hijack();
      request.raw.setTimeout(0);
      reply.raw.setTimeout(0);
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(':ok\n\n');
      const unsub = subscribeCartUser(request.user.userId, (chunk) => {
        try {
          reply.raw.write(chunk);
        } catch {
          unsub();
        }
      });
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(':hb\n\n');
        } catch {
          clearInterval(heartbeat);
          unsub();
        }
      }, 15000);
      const cleanup = () => {
        clearInterval(heartbeat);
        unsub();
      };
      request.raw.on('close', cleanup);
      request.raw.on('end', cleanup);
    },
  );

  fastify.post('/migrate', { preHandler: authenticate }, async (request, reply) => {
    const parsed = MigrateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const me = request.user.userId;
    const existing = await fastify.prisma.shoppingList.count({ where: { ownerId: me } });
    if (existing > 0) {
      const lists = await loadVisibleLists(me);
      return reply.send({ lists: await packLists(lists, me) });
    }
    await fastify.prisma.$transaction(
      parsed.data.lists.map((list) =>
        fastify.prisma.shoppingList.create({
          data: {
            ownerId: me,
            name: list.name,
            items: {
              create: list.items.map((item) => ({
                name: item.name,
                qtyLabel: item.qtyLabel || null,
                foodId: item.foodId || null,
                recipeId: item.recipeId || null,
                checked: item.checked === true,
                addedAt: item.addedAt ? new Date(item.addedAt) : new Date(),
              })),
            },
          },
        }),
      ),
    );
    const lists = await loadVisibleLists(me);
    pingOwner(me);
    return reply.status(201).send({ lists: await packLists(lists, me) });
  });

  fastify.post('/lists', { preHandler: authenticate }, async (request, reply) => {
    const parsed = CreateListSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const me = request.user.userId;
    const count = await fastify.prisma.shoppingList.count({ where: { ownerId: me } });
    if (count >= MAX_LISTS) {
      return reply.status(400).send({ error: 'Elérted a listák maximális számát.' });
    }
    const list = await fastify.prisma.shoppingList.create({
      data: { ownerId: me, name: parsed.data.name },
      include: listInclude,
    });
    pingOwner(me);
    return reply.status(201).send(await packList(list, me));
  });

  fastify.patch('/lists/:id', { preHandler: authenticate }, async (request, reply) => {
    const parsed = RenameListSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const list = await fastify.prisma.shoppingList.findUnique({ where: { id } });
    if (!list || !(await canAccessShoppingList(fastify.prisma, me, list.ownerId))) {
      return reply.status(404).send({ error: 'A lista nem található.' });
    }
    const updated = await fastify.prisma.shoppingList.update({
      where: { id },
      data: { name: parsed.data.name },
      include: listInclude,
    });
    pingOwner(list.ownerId);
    return reply.send(await packList(updated, me));
  });

  fastify.delete('/lists/:id', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const list = await fastify.prisma.shoppingList.findUnique({ where: { id } });
    if (!list || list.ownerId !== me) {
      return reply.status(404).send({ error: 'Csak a saját listádat törölheted.' });
    }
    await fastify.prisma.shoppingList.delete({ where: { id } });
    pingOwner(list.ownerId);
    return reply.send({ ok: true });
  });

  fastify.post('/lists/:id/items', { preHandler: authenticate }, async (request, reply) => {
    const parsed = AddItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const list = await fastify.prisma.shoppingList.findUnique({ where: { id }, include: listInclude });
    if (!list || !(await canAccessShoppingList(fastify.prisma, me, list.ownerId))) {
      return reply.status(404).send({ error: 'A lista nem található.' });
    }
    const qtyLabel = parsed.data.qtyLabel?.trim() || null;
    const foodId = parsed.data.foodId || null;
    const existing = list.items.find((item) => {
      if (foodId && item.foodId && item.foodId === foodId) return true;
      if (foodId || item.foodId) return false;
      return item.name.trim().toLowerCase() === parsed.data.name.trim().toLowerCase() && (item.qtyLabel ?? '') === (qtyLabel ?? '');
    });
    if (existing) {
      const updatedItem = await fastify.prisma.shoppingListItem.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          qtyLabel: qtyLabel ?? existing.qtyLabel,
          foodId: foodId ?? existing.foodId,
          checked: false,
          addedAt: new Date(),
        },
      });
      const updated = await fastify.prisma.shoppingList.findUniqueOrThrow({
        where: { id },
        include: listInclude,
      });
      pingOwner(list.ownerId);
      return reply.send({ list: await packList(updated, me), item: serializeItem(updatedItem) });
    }
    await fastify.prisma.shoppingListItem.create({
      data: {
        listId: id,
        name: parsed.data.name,
        qtyLabel,
        foodId,
        recipeId: parsed.data.recipeId || null,
      },
    });
    const updated = await fastify.prisma.shoppingList.findUniqueOrThrow({
      where: { id },
      include: listInclude,
    });
    pingOwner(list.ownerId);
    return reply.status(201).send({ list: await packList(updated, me) });
  });

  fastify.post('/lists/:id/recipe', { preHandler: authenticate }, async (request, reply) => {
    const parsed = RecipeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const list = await fastify.prisma.shoppingList.findUnique({ where: { id } });
    if (!list || !(await canAccessShoppingList(fastify.prisma, me, list.ownerId))) {
      return reply.status(404).send({ error: 'A lista nem található.' });
    }
    await fastify.prisma.$transaction([
      fastify.prisma.shoppingListItem.deleteMany({
        where: { listId: id, recipeId: parsed.data.recipeId },
      }),
      fastify.prisma.shoppingListItem.createMany({
        data: parsed.data.lines.map((line, i) => ({
          listId: id,
          name: line.name,
          qtyLabel: line.qtyLabel || null,
          foodId: line.foodId || null,
          recipeId: parsed.data.recipeId,
          addedAt: new Date(Date.now() - i),
        })),
      }),
    ]);
    const updated = await fastify.prisma.shoppingList.findUniqueOrThrow({
      where: { id },
      include: listInclude,
    });
    pingOwner(list.ownerId);
    return reply.send({ list: await packList(updated, me) });
  });

  fastify.post('/lists/:id/clear-checked', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const list = await fastify.prisma.shoppingList.findUnique({ where: { id } });
    if (!list || !(await canAccessShoppingList(fastify.prisma, me, list.ownerId))) {
      return reply.status(404).send({ error: 'A lista nem található.' });
    }
    await fastify.prisma.shoppingListItem.deleteMany({ where: { listId: id, checked: true } });
    const updated = await fastify.prisma.shoppingList.findUniqueOrThrow({
      where: { id },
      include: listInclude,
    });
    pingOwner(list.ownerId);
    return reply.send({ list: await packList(updated, me) });
  });

  fastify.patch('/items/:id', { preHandler: authenticate }, async (request, reply) => {
    const parsed = PatchItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const item = await fastify.prisma.shoppingListItem.findUnique({
      where: { id },
      include: { list: true },
    });
    if (!item || !(await canAccessShoppingList(fastify.prisma, me, item.list.ownerId))) {
      return reply.status(404).send({ error: 'A tétel nem található.' });
    }
    await fastify.prisma.shoppingListItem.update({
      where: { id },
      data: {
        name: parsed.data.name ?? undefined,
        qtyLabel: parsed.data.qtyLabel === undefined ? undefined : parsed.data.qtyLabel || null,
        checked: parsed.data.checked,
      },
    });
    const updated = await fastify.prisma.shoppingList.findUniqueOrThrow({
      where: { id: item.listId },
      include: listInclude,
    });
    pingOwner(item.list.ownerId);
    return reply.send({ list: await packList(updated, me) });
  });

  fastify.delete('/items/:id', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const item = await fastify.prisma.shoppingListItem.findUnique({
      where: { id },
      include: { list: true },
    });
    if (!item || !(await canAccessShoppingList(fastify.prisma, me, item.list.ownerId))) {
      return reply.status(404).send({ error: 'A tétel nem található.' });
    }
    await fastify.prisma.shoppingListItem.delete({ where: { id } });
    const updated = await fastify.prisma.shoppingList.findUniqueOrThrow({
      where: { id: item.listId },
      include: listInclude,
    });
    pingOwner(item.list.ownerId);
    return reply.send({ list: await packList(updated, me) });
  });
};

export default cartRoutes;
