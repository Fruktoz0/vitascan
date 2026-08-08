import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';

const DateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD'),
});

const UpsertDayNoteSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD'),
  content: z.string().max(2000),
});

function parseDay(date: string) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function serializeNote(note: {
  id: string;
  content: string;
  loggedDate: Date;
  updatedAt: Date;
}) {
  return {
    id: note.id,
    content: note.content,
    loggedDate: toDateStr(note.loggedDate),
    updatedAt: note.updatedAt,
  };
}

const dayNoteRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /day-notes?date=YYYY-MM-DD
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = DateQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const day = parseDay(parsed.data.date);
    const note = await fastify.prisma.dayNote.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: day } },
    });

    return reply.send({ note: note ? serializeNote(note) : null });
  });

  // PUT /day-notes — upsert; üres content → törlés
  fastify.put('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertDayNoteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const day = parseDay(parsed.data.date);
    const content = parsed.data.content.trim();

    const existing = await fastify.prisma.dayNote.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: day } },
    });

    if (!content) {
      if (existing) {
        await fastify.prisma.dayNote.delete({ where: { id: existing.id } });
      }
      return reply.send({ note: null });
    }

    const note = await fastify.prisma.dayNote.upsert({
      where: { userId_loggedDate: { userId, loggedDate: day } },
      create: { userId, loggedDate: day, content },
      update: { content },
    });

    return reply.send({ note: serializeNote(note) });
  });
};

export default dayNoteRoutes;
