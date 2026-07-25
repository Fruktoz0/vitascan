import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { AnalysisQuerySchema, GenerateAnalysisSchema } from './analysis.schema';
import { getDailyAnalysis, createOrRefreshDailyAnalysis } from './analysis.service';

const analysisRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /analysis?date=YYYY-MM-DD
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = AnalysisQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const result = await getDailyAnalysis(
      fastify.prisma,
      request.user.userId,
      parsed.data.date,
    );
    return reply.send(result);
  });

  // POST /analysis — max 2×/nap, felülír
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = GenerateAnalysisSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const result = await createOrRefreshDailyAnalysis(
        fastify.prisma,
        request.user.userId,
        parsed.data,
      );
      return reply.send(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ error: err.message || 'Elemzés sikertelen.' });
    }
  });
};

export default analysisRoutes;
