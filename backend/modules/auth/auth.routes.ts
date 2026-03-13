import { FastifyPluginAsync } from 'fastify';
import { RegisterSchema, LoginSchema, RefreshSchema } from './auth.schema';
import { registerUser, loginUser, refreshTokens, logoutUser } from './auth.service';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register
  fastify.post('/register', async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const user = await registerUser(fastify.prisma, parsed.data);
      return reply.status(201).send({ user });
    } catch (err: any) {
      return reply.status(409).send({ error: err.message });
    }
  });

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Érvénytelen bemenet.' });
    }
    try {
      const result = await loginUser(fastify.prisma, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const parsed = RefreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'refreshToken mező szükséges.' });
    }
    try {
      const tokens = await refreshTokens(fastify.prisma, parsed.data.refreshToken);
      return reply.send(tokens);
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  // POST /auth/logout
  fastify.post('/logout', async (request, reply) => {
    const parsed = RefreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'refreshToken mező szükséges.' });
    }
    await logoutUser(fastify.prisma, parsed.data.refreshToken);
    return reply.send({ message: 'Sikeres kijelentkezés.' });
  });
};

export default authRoutes;
