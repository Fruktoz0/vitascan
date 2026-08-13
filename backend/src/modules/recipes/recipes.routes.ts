import { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { authenticate } from '../../middleware/authenticate';
import { dailyLogLimitGuard } from '../../middleware/tierGuard';
import {
  AI_RECIPE_IMAGE_DAILY_LIMIT,
  AI_RECIPE_URL_DAILY_LIMIT,
  AI_RECIPE_VIDEO_DAILY_LIMIT,
  CreateRecipeSchema,
  ImportUrlSchema,
  LogRecipeSchema,
  MatchIngredientsSchema,
  RecipeListQuerySchema,
  UpdateRecipeSchema,
} from './recipes.schema';
import {
  deleteGeminiFile,
  extractRecipeFromFileUri,
  extractRecipeFromImage,
  uploadGeminiFile,
} from './recipes.ai.service';
import {
  ensureRecipeStorage,
  openRecipeImageStream,
  openTempImageStream,
  readTempImageBuffer,
  saveTempRecipeImage,
  deleteTempRecipeImage,
} from './recipes.image.service';
import { importRecipeFromUrl } from './recipes.import.service';
import { matchDraftIngredients } from './recipes.match.service';
import { getRecipeImportUsage, incrementRecipeImportUsage } from './recipes.quota';
import {
  attachRecipeImage,
  createRecipe,
  deleteRecipe,
  favoriteRecipe,
  findDuplicateRecipe,
  getPrimaryStorageKey,
  getRecipe,
  listRecipes,
  logRecipeToDiary,
  mapRecipeDetail,
  unfavoriteRecipe,
  updateRecipe,
} from './recipes.service';
import { httpError } from './recipes.types';

const UUID_WEBP_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

function statusOf(err: unknown, fallback = 500) {
  const code = (err as { statusCode?: number })?.statusCode;
  return typeof code === 'number' && Number.isFinite(code) ? code : fallback;
}

function bearerKey(prefix: string, req: { headers: { authorization?: string }; ip: string }) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return `${prefix}_${auth.slice(7, 30)}`;
  return `${prefix}_ip_${req.ip}`;
}

const recipeRoutes: FastifyPluginAsync = async (fastify) => {
  await ensureRecipeStorage();

  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = RecipeListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const result = await listRecipes(fastify.prisma, request.user.userId, parsed.data);
    return reply.send(result);
  });

  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = CreateRecipeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const recipe = await createRecipe(fastify.prisma, request.user.userId, parsed.data, request.user.role);
      return reply.status(201).send(recipe);
    } catch (err: unknown) {
      return reply.status(statusOf(err, 400)).send({
        error: err instanceof Error ? err.message : 'A mentés sikertelen.',
      });
    }
  });

  fastify.post('/match', { preHandler: authenticate }, async (request, reply) => {
    const parsed = MatchIngredientsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const servings = parsed.data.servings || 1;
    const result = await matchDraftIngredients(fastify.prisma, parsed.data.ingredients, servings);
    return reply.send(result);
  });

  fastify.post('/import/image', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const { usage, today } = await getRecipeImportUsage(fastify.prisma, userId, 'IMAGE');
    if (usage.count >= AI_RECIPE_IMAGE_DAILY_LIMIT) {
      return reply.status(429).send({
        error: `Elérted a napi AI receptimport limitet (${AI_RECIPE_IMAGE_DAILY_LIMIT}). Próbáld holnap.`,
        remaining: 0,
        limit: AI_RECIPE_IMAGE_DAILY_LIMIT,
      });
    }

    const file = await request.file({ limits: { fileSize: 8 * 1024 * 1024 } });
    if (!file) return reply.status(400).send({ error: 'Nincs kép (file mező).' });

    const buf = await file.toBuffer();
    const stored = await saveTempRecipeImage(userId, buf);

    const q = request.query as { locale?: string };
    const locale = q?.locale === 'en' ? 'en' : 'hu';

    try {
      const webpBuf = await readTempImageBuffer(userId, stored.storageKey);
      const draft = await extractRecipeFromImage({
        imageBase64: webpBuf.toString('base64'),
        mimeType: 'image/webp',
        locale,
      });
      const matched = await matchDraftIngredients(fastify.prisma, draft.ingredients, draft.servings);
      const updated = await incrementRecipeImportUsage(fastify.prisma, userId, 'IMAGE', today);
      return reply.send({
        draft: {
          ...draft,
          sourceType: 'IMAGE' as const,
          ingredients: matched.ingredients,
        },
        nutrition: matched.nutrition,
        tempImageKey: stored.storageKey,
        remaining: Math.max(0, AI_RECIPE_IMAGE_DAILY_LIMIT - updated.count),
        limit: AI_RECIPE_IMAGE_DAILY_LIMIT,
      });
    } catch (err: unknown) {
      const status = statusOf(err, 502);
      return reply.status(status).send({
        error: err instanceof Error ? err.message : 'A felismerés sikertelen.',
        tempImageKey: stored.storageKey,
        remaining: Math.max(0, AI_RECIPE_IMAGE_DAILY_LIMIT - usage.count),
        limit: AI_RECIPE_IMAGE_DAILY_LIMIT,
      });
    }
  });

  await fastify.register(async (instance) => {
    await instance.register(rateLimit, {
      global: false,
      max: 10,
      timeWindow: '10 minutes',
      keyGenerator: (req) => bearerKey('recipe_url', req),
      errorResponseBuilder: () => ({
        error: 'Túl sok URL-import (10 / 10 perc). Kérjük várjon.',
      }),
    });

    instance.post(
      '/import/url',
      {
        preHandler: authenticate,
        config: {
          rateLimit: {
            max: 10,
            timeWindow: '10 minutes',
            keyGenerator: (req) => bearerKey('recipe_url', req),
          },
        },
      },
      async (request, reply) => {
      const parsed = ImportUrlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.errors[0].message });
      }
      const userId = request.user.userId;
      const locale = parsed.data.locale === 'en' ? 'en' : 'hu';
      const { usage, today } = await getRecipeImportUsage(fastify.prisma, userId, 'URL');
      if (usage.count >= AI_RECIPE_URL_DAILY_LIMIT) {
        return reply.status(429).send({
          error: `Elérted a napi URL-import limitet (${AI_RECIPE_URL_DAILY_LIMIT}). Próbáld holnap.`,
          remaining: 0,
          limit: AI_RECIPE_URL_DAILY_LIMIT,
        });
      }

      try {
        const imported = await importRecipeFromUrl(userId, parsed.data.url, locale);
        const dup = await findDuplicateRecipe(
          fastify.prisma,
          imported.sourceType,
          imported.sourceExternalId,
          imported.sourceUrl,
          userId,
        );
        if (dup) {
          return reply.status(409).send({
            error: 'Ez a recept már megtalálható.',
            recipeId: dup.id,
            title: dup.title,
          });
        }

        const matched = await matchDraftIngredients(
          fastify.prisma,
          imported.draft.ingredients,
          imported.draft.servings,
        );
        let remaining = Math.max(0, AI_RECIPE_URL_DAILY_LIMIT - usage.count);
        if (imported.usedAi) {
          const updated = await incrementRecipeImportUsage(fastify.prisma, userId, 'URL', today);
          remaining = Math.max(0, AI_RECIPE_URL_DAILY_LIMIT - updated.count);
        }
        return reply.send({
          draft: {
            ...imported.draft,
            ingredients: matched.ingredients,
            sourceExternalId: imported.sourceExternalId,
          },
          nutrition: matched.nutrition,
          tempImageKey: imported.tempImageKey,
          needsFallback: imported.needsFallback,
          remaining,
          limit: AI_RECIPE_URL_DAILY_LIMIT,
        });
      } catch (err: unknown) {
        return reply.status(statusOf(err, 502)).send({
          error: err instanceof Error ? err.message : 'A linkből nem sikerült receptet kinyerni.',
        });
      }
    });
  });

  await fastify.register(async (instance) => {
    await instance.register(rateLimit, {
      global: false,
      max: 3,
      timeWindow: '10 minutes',
      keyGenerator: (req) => bearerKey('recipe_video', req),
      errorResponseBuilder: () => ({
        error: 'Túl sok videóimport (3 / 10 perc). Kérjük várjon.',
      }),
    });

    instance.post(
      '/import/video',
      {
        preHandler: authenticate,
        config: {
          rateLimit: {
            max: 3,
            timeWindow: '10 minutes',
            keyGenerator: (req) => bearerKey('recipe_video', req),
          },
        },
      },
      async (request, reply) => {
      const userId = request.user.userId;
      const { usage, today } = await getRecipeImportUsage(fastify.prisma, userId, 'VIDEO');
      if (usage.count >= AI_RECIPE_VIDEO_DAILY_LIMIT) {
        return reply.status(429).send({
          error: `Elérted a napi videóimport limitet (${AI_RECIPE_VIDEO_DAILY_LIMIT}). Próbáld holnap.`,
          remaining: 0,
          limit: AI_RECIPE_VIDEO_DAILY_LIMIT,
        });
      }

      const file = await request.file({ limits: { fileSize: VIDEO_MAX_BYTES } });
      if (!file) return reply.status(400).send({ error: 'Nincs videó (file mező).' });
      const mime = (file.mimetype || '').toLowerCase();
      if (!VIDEO_MIME.has(mime)) {
        return reply.status(400).send({ error: 'Csak mp4, webm vagy mov videó engedélyezett.' });
      }

      const buf = await file.toBuffer();
      if (buf.length > VIDEO_MAX_BYTES) {
        return reply.status(413).send({ error: 'A videó túl nagy. Maximum 50 MB.' });
      }

      const q = request.query as { locale?: string };
      const locale = q?.locale === 'en' ? 'en' : 'hu';
      let uploadedName: string | null = null;
      try {
        const uploaded = await uploadGeminiFile(buf, mime, file.filename || 'recipe.mp4');
        uploadedName = uploaded.name;
        const draft = await extractRecipeFromFileUri({
          fileUri: uploaded.uri,
          mimeType: mime,
          locale,
        });
        const matched = await matchDraftIngredients(fastify.prisma, draft.ingredients, draft.servings);
        const updated = await incrementRecipeImportUsage(fastify.prisma, userId, 'VIDEO', today);
        return reply.send({
          draft: { ...draft, sourceType: 'VIDEO' as const, ingredients: matched.ingredients },
          nutrition: matched.nutrition,
          remaining: Math.max(0, AI_RECIPE_VIDEO_DAILY_LIMIT - updated.count),
          limit: AI_RECIPE_VIDEO_DAILY_LIMIT,
        });
      } catch (err: unknown) {
        return reply.status(statusOf(err, 502)).send({
          error: err instanceof Error ? err.message : 'A videóból nem sikerült receptet kinyerni.',
        });
      } finally {
        if (uploadedName) await deleteGeminiFile(uploadedName);
      }
    });
  });

  fastify.get('/tmp/:key/image', { preHandler: authenticate }, async (request, reply) => {
    const { key } = request.params as { key: string };
    if (!UUID_WEBP_RE.test(key)) return reply.status(400).send({ error: 'Érvénytelen képkulcs.' });
    try {
      const { stream, size } = await openTempImageStream(request.user.userId, key);
      return reply
        .header('Content-Type', 'image/webp')
        .header('Content-Length', size)
        .header('Cache-Control', 'private, max-age=300')
        .send(stream);
    } catch (err: unknown) {
      return reply.status(statusOf(err, 404)).send({
        error: err instanceof Error ? err.message : 'A kép nem található.',
      });
    }
  });

  fastify.post('/tmp/image', { preHandler: authenticate }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: 8 * 1024 * 1024 } });
    if (!file) return reply.status(400).send({ error: 'Nincs kép (file mező).' });
    const buf = await file.toBuffer();
    const replace = typeof request.query === 'object' && request.query && 'replace' in request.query
      ? String((request.query as { replace?: string }).replace ?? '')
      : '';
    try {
      const stored = await saveTempRecipeImage(request.user.userId, buf);
      if (replace && UUID_WEBP_RE.test(replace) && replace !== stored.storageKey) {
        await deleteTempRecipeImage(request.user.userId, replace);
      }
      return reply.status(201).send({ tempImageKey: stored.storageKey });
    } catch (err: unknown) {
      return reply.status(statusOf(err, 400)).send({
        error: err instanceof Error ? err.message : 'A kép feltöltése sikertelen.',
      });
    }
  });

  fastify.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const recipe = await getRecipe(fastify.prisma, id, request.user.userId, request.user.role);
      return reply.send(mapRecipeDetail(recipe, request.user.userId));
    } catch (err: unknown) {
      return reply.status(statusOf(err, 404)).send({
        error: err instanceof Error ? err.message : 'A recept nem található.',
      });
    }
  });

  fastify.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateRecipeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const recipe = await updateRecipe(
        fastify.prisma,
        id,
        request.user.userId,
        request.user.role,
        parsed.data,
      );
      return reply.send(recipe);
    } catch (err: unknown) {
      return reply.status(statusOf(err, 400)).send({
        error: err instanceof Error ? err.message : 'A módosítás sikertelen.',
      });
    }
  });

  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteRecipe(fastify.prisma, id, request.user.userId, request.user.role);
      return reply.send({ message: 'Törölve.' });
    } catch (err: unknown) {
      return reply.status(statusOf(err, 403)).send({
        error: err instanceof Error ? err.message : 'A törlés sikertelen.',
      });
    }
  });

  fastify.post('/:id/log', { preHandler: [authenticate, dailyLogLimitGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = LogRecipeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const log = await logRecipeToDiary(
        fastify.prisma,
        id,
        request.user.userId,
        request.user.role,
        parsed.data,
      );
      return reply.status(201).send(log);
    } catch (err: unknown) {
      return reply.status(statusOf(err, 400)).send({
        error: err instanceof Error ? err.message : 'A naplózás sikertelen.',
      });
    }
  });

  fastify.get('/:id/image', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await getRecipe(fastify.prisma, id, request.user.userId, request.user.role);
      const img = await getPrimaryStorageKey(fastify.prisma, id);
      if (!img) throw httpError(404, 'A receptképet nem találjuk.');
      const { stream, size } = await openRecipeImageStream(img.storageKey);
      return reply
        .header('Content-Type', img.mimeType || 'image/webp')
        .header('Content-Length', size)
        .header('Cache-Control', 'private, max-age=3600')
        .send(stream);
    } catch (err: unknown) {
      return reply.status(statusOf(err, 404)).send({
        error: err instanceof Error ? err.message : 'A kép nem található.',
      });
    }
  });

  fastify.post('/:id/images', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = await request.file({ limits: { fileSize: 8 * 1024 * 1024 } });
    if (!file) return reply.status(400).send({ error: 'Nincs kép (file mező).' });
    const buf = await file.toBuffer();
    try {
      await attachRecipeImage(fastify.prisma, id, request.user.userId, request.user.role, buf);
      return reply.status(201).send({ ok: true });
    } catch (err: unknown) {
      return reply.status(statusOf(err, 400)).send({
        error: err instanceof Error ? err.message : 'A kép feltöltése sikertelen.',
      });
    }
  });

  fastify.post('/:id/favorite', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await favoriteRecipe(fastify.prisma, id, request.user.userId, request.user.role);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(statusOf(err, 404)).send({
        error: err instanceof Error ? err.message : 'A művelet sikertelen.',
      });
    }
  });

  fastify.delete('/:id/favorite', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await unfavoriteRecipe(fastify.prisma, id, request.user.userId);
    return reply.send(result);
  });
};

export default recipeRoutes;
