import Fastify from 'fastify';

const fastify = Fastify({
  logger: true
});

// Alap útvonal teszteléshez
fastify.get('/', async (request, reply) => {
  return { status: 'VitaScan API fut!', memory: '16GB RAM ready' };
});

const start = async () => {
  try {
    // Fontos a 0.0.0.0, különben Dockerben nem éred el kívülről!
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 Szerver száguld a 3000-es porton (kívül 3005)!');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();