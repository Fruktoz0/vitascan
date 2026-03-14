import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Típus kiterjesztés a Fastify-hoz
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// 1. Adatbázis kapcsolat (Pool) létrehozása
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

// 2. Driver Adapter létrehozása
const adapter = new PrismaPg(pool);

// 3. A PrismaClient példányosítása az adapterrel
// Itt az 'as any' azért kell néha, mert a Prisma 6 típusai hajlamosak összeakadni,
// ha a kliens nem lett 'driverAdapters' preview feature-rel generálva.
export const prisma = new PrismaClient({ adapter: adapter as any });

const prismaPlugin: FastifyPluginAsync = fp(async (fastify) => {
  try {
    // Kapcsolódás tesztelése
    await prisma.$connect();

    // Dekorálás, hogy elérd: fastify.prisma
    fastify.decorate('prisma', prisma);

    // Takarítás a szerver leállásakor
    fastify.addHook('onClose', async () => {
      await prisma.$disconnect();
      await pool.end();
    });
  } catch (error) {
    fastify.log.error('Prisma kapcsolódási hiba:');
  }
});

export default prismaPlugin;