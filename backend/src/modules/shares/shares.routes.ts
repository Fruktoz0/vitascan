import { FastifyPluginAsync } from 'fastify';
import { ShareCategory, ShareStatus } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { notifyCartUsers } from '../cart/cartEvents';

const CATEGORIES = ['FOOD', 'WEIGHT', 'WATER', 'BODY', 'CART'] as const;

const CreateShareSchema = z.object({
  email: z.string().email(),
  categories: z.array(z.enum(CATEGORIES)).min(1),
});

const PatchShareSchema = z.object({
  categories: z.array(z.enum(CATEGORIES)).min(1),
});

const LiveCategorySchema = z.enum(['FOOD', 'WEIGHT', 'WATER', 'BODY']);

function publicUser(u: { id: string; username: string; email: string }) {
  return { id: u.id, username: u.username, email: u.email };
}

function serializeShare(
  row: {
    id: string;
    ownerId: string;
    partnerId: string;
    categories: ShareCategory[];
    status: ShareStatus;
    createdAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    owner: { id: string; username: string; email: string };
    partner: { id: string; username: string; email: string };
  },
  me: string,
) {
  return {
    id: row.id,
    direction: row.ownerId === me ? 'outgoing' : 'incoming',
    categories: row.categories,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    owner: publicUser(row.owner),
    partner: publicUser(row.partner),
  };
}

const shareInclude = {
  owner: { select: { id: true, username: true, email: true } },
  partner: { select: { id: true, username: true, email: true } },
} as const;

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

const sharesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const rows = await fastify.prisma.dataShare.findMany({
      where: {
        status: { not: ShareStatus.REVOKED },
        OR: [{ ownerId: me }, { partnerId: me }],
      },
      include: shareInclude,
      orderBy: { createdAt: 'desc' },
    });
    const pendingIncomingCount = rows.filter(
      (row) => row.partnerId === me && row.status === ShareStatus.PENDING,
    ).length;
    return reply.send({
      pendingIncomingCount,
      shares: rows.map((row) => serializeShare(row, me)),
    });
  });

  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = CreateShareSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const me = request.user.userId;
    const email = parsed.data.email.trim().toLowerCase();
    const categories = [...new Set(parsed.data.categories)] as ShareCategory[];

    const partner = await fastify.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });
    if (!partner) {
      return reply.status(404).send({ error: 'Nincs VitaScan fiók ezzel az email címmel.' });
    }
    if (partner.id === me) {
      return reply.status(400).send({ error: 'Saját magaddal nem oszthatsz meg adatot.' });
    }

    const existing = await fastify.prisma.dataShare.findUnique({
      where: { ownerId_partnerId: { ownerId: me, partnerId: partner.id } },
    });

    let row;
    if (!existing || existing.status === ShareStatus.REVOKED) {
      row = existing
        ? await fastify.prisma.dataShare.update({
            where: { id: existing.id },
            data: {
              categories,
              status: ShareStatus.PENDING,
              acceptedAt: null,
              revokedAt: null,
            },
            include: shareInclude,
          })
        : await fastify.prisma.dataShare.create({
            data: { ownerId: me, partnerId: partner.id, categories },
            include: shareInclude,
          });
    } else if (existing.status === ShareStatus.PENDING) {
      row = await fastify.prisma.dataShare.update({
        where: { id: existing.id },
        data: { categories },
        include: shareInclude,
      });
    } else {
      row = await fastify.prisma.dataShare.update({
        where: { id: existing.id },
        data: { categories },
        include: shareInclude,
      });
    }

    if (categories.includes(ShareCategory.CART)) {
      notifyCartUsers([me, partner.id]);
    }
    return reply.status(existing && existing.status !== ShareStatus.REVOKED ? 200 : 201).send(serializeShare(row, me));
  });

  fastify.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const parsed = PatchShareSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const row = await fastify.prisma.dataShare.findUnique({ where: { id } });
    if (!row || row.ownerId !== me || row.status === ShareStatus.REVOKED) {
      return reply.status(404).send({ error: 'A megosztás nem található.' });
    }
    const updated = await fastify.prisma.dataShare.update({
      where: { id },
      data: { categories: [...new Set(parsed.data.categories)] as ShareCategory[] },
      include: shareInclude,
    });
    if (updated.status === ShareStatus.ACTIVE) {
      const cartTouched =
        row.categories.includes(ShareCategory.CART) || updated.categories.includes(ShareCategory.CART);
      if (cartTouched) notifyCartUsers([updated.ownerId, updated.partnerId]);
    }
    return reply.send(serializeShare(updated, me));
  });

  fastify.post('/:id/accept', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const row = await fastify.prisma.dataShare.findUnique({ where: { id } });
    if (!row || row.partnerId !== me || row.status !== ShareStatus.PENDING) {
      return reply.status(404).send({ error: 'Nincs elfogadásra váró megosztás.' });
    }
    const updated = await fastify.prisma.dataShare.update({
      where: { id },
      data: { status: ShareStatus.ACTIVE, acceptedAt: new Date(), revokedAt: null },
      include: shareInclude,
    });
    if (updated.categories.includes(ShareCategory.CART)) {
      notifyCartUsers([updated.ownerId, updated.partnerId]);
    }
    return reply.send(serializeShare(updated, me));
  });

  fastify.post('/:id/decline', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const row = await fastify.prisma.dataShare.findUnique({ where: { id } });
    if (!row || row.partnerId !== me || row.status !== ShareStatus.PENDING) {
      return reply.status(404).send({ error: 'Nincs elutasítható megosztás.' });
    }
    const updated = await fastify.prisma.dataShare.update({
      where: { id },
      data: { status: ShareStatus.REVOKED, revokedAt: new Date() },
      include: shareInclude,
    });
    if (row.categories.includes(ShareCategory.CART)) {
      notifyCartUsers([row.ownerId, row.partnerId]);
    }
    return reply.send(serializeShare(updated, me));
  });

  fastify.post('/:id/revoke', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const { id } = request.params as { id: string };
    const row = await fastify.prisma.dataShare.findUnique({ where: { id } });
    if (!row || (row.ownerId !== me && row.partnerId !== me) || row.status === ShareStatus.REVOKED) {
      return reply.status(404).send({ error: 'A megosztás nem található.' });
    }
    const updated = await fastify.prisma.dataShare.update({
      where: { id },
      data: { status: ShareStatus.REVOKED, revokedAt: new Date() },
      include: shareInclude,
    });
    if (row.categories.includes(ShareCategory.CART)) {
      notifyCartUsers([row.ownerId, row.partnerId]);
    }
    return reply.send(serializeShare(updated, me));
  });

  fastify.get('/:id/live/:category', { preHandler: authenticate }, async (request, reply) => {
    const me = request.user.userId;
    const { id, category } = request.params as { id: string; category: string };
    const catParsed = LiveCategorySchema.safeParse(category);
    if (!catParsed.success) {
      return reply.status(400).send({ error: 'Ez a kategória itt nem olvasható.' });
    }
    const cat = catParsed.data as ShareCategory;
    const row = await fastify.prisma.dataShare.findUnique({ where: { id } });
    if (
      !row ||
      row.partnerId !== me ||
      row.status !== ShareStatus.ACTIVE ||
      !row.acceptedAt ||
      !row.categories.includes(cat)
    ) {
      return reply.status(404).send({ error: 'Nincs élő megosztás ebben a kategóriában.' });
    }

    const since = row.acceptedAt;
    const sinceDay = new Date(since);
    sinceDay.setHours(0, 0, 0, 0);
    const ownerId = row.ownerId;

    if (cat === 'FOOD') {
      const logs = await fastify.prisma.dailyLog.findMany({
        where: { userId: ownerId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          foodName: true,
          kcal: true,
          amount: true,
          mealType: true,
          createdAt: true,
        },
      });
      return reply.send({
        category: cat,
        items: logs.map((log) => ({
          id: log.id,
          title: log.foodName,
          meta: `${Math.round(log.kcal)} kcal · ${Math.round(log.amount)} g`,
          at: log.createdAt.toISOString(),
        })),
      });
    }

    if (cat === 'WEIGHT') {
      const logs = await fastify.prisma.weightLog.findMany({
        where: { userId: ownerId, loggedDate: { gte: sinceDay } },
        orderBy: { loggedDate: 'desc' },
        take: 40,
      });
      return reply.send({
        category: cat,
        items: logs.map((log) => ({
          id: log.id,
          title: `${log.weightKg.toFixed(1)} kg`,
          meta: toDateStr(log.loggedDate),
          at: log.updatedAt.toISOString(),
        })),
      });
    }

    if (cat === 'WATER') {
      const logs = await fastify.prisma.waterLog.findMany({
        where: { userId: ownerId, loggedDate: { gte: sinceDay } },
        orderBy: { loggedDate: 'desc' },
        take: 40,
      });
      return reply.send({
        category: cat,
        items: logs.map((log) => ({
          id: log.id,
          title: `${log.totalMl} ml`,
          meta: toDateStr(log.loggedDate),
          at: log.updatedAt.toISOString(),
        })),
      });
    }

    const logs = await fastify.prisma.bodyMeasurementLog.findMany({
      where: { userId: ownerId, loggedDate: { gte: sinceDay } },
      orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
      take: 40,
    });
    return reply.send({
      category: cat,
      items: logs.map((log) => ({
        id: log.id,
        title: `${log.bodyPart} · ${log.valueCm} cm`,
        meta: toDateStr(log.loggedDate),
        at: log.updatedAt.toISOString(),
      })),
    });
  });
};

export default sharesRoutes;
