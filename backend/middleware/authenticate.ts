import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, SignPayload } from '../plugins/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    user: SignPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Hitelesítés szükséges.' });
  }

  const token = authHeader.slice(7);
  try {
    request.user = verifyAccessToken(token);
  } catch {
    return reply.status(401).send({ error: 'Érvénytelen vagy lejárt token.' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user?.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Nincs jogosultsága ehhez a művelethez.' });
  }
}
