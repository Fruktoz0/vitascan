import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { z } from 'zod';

function dbToolsBase(): string {
  return (process.env.DB_TOOLS_URL ?? '').replace(/\/$/, '');
}

export function isDatabaseToolsConfigured(): boolean {
  const secret = (process.env.DB_TOOLS_SECRET ?? '').trim();
  return !!(dbToolsBase() && secret);
}

async function dbToolsFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = dbToolsBase();
  const secret = (process.env.DB_TOOLS_SECRET ?? '').trim();
  if (!base || !secret) {
    throw new Error('NOT_CONFIGURED');
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  headers.set('x-db-tools-secret', secret);
  return fetch(url, { ...init, headers });
}

function safeBackupName(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const base = raw.split('/').pop()?.split('\\').pop();
  if (!base || base === '.' || base === '..') return null;
  if (base.includes('\0') || base.length > 240) return null;
  if (/[/\\]/.test(base)) return null;
  return base;
}

const ScheduleBody = z.object({
  cron: z.string().min(9).max(64),
  enabled: z.boolean(),
  timezone: z.string().optional(),
  manualBackupDir: z.string().optional(),
  scheduledBackupDir: z.string().optional(),
  retentionDays: z.number().min(2).max(30).optional(),
});

export async function registerAdminDatabaseRoutes(fastify: FastifyInstance) {
  fastify.get('/database/dirs', async (request, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    const q = request.query as { path?: string | string[] };
    const rawPath = Array.isArray(q.path) ? q.path[0] : q.path;
    const qs = rawPath != null && rawPath !== '' ? `?path=${encodeURIComponent(rawPath)}` : '';
    try {
      const res = await dbToolsFetch(`/dirs${qs}`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return reply.status(400).send(data);
      return reply.send(data);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });

  // Mindig 200 + JSON: így a SPA meg tudja jeleníteni a configured / ok / error mezőket (nem dob ApiError-t).
  fastify.get('/database/status', async (_req, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.send({
        configured: false,
        ok: false,
        error:
          'Az API-ban nincs beállítva a DB_TOOLS_URL vagy a DB_TOOLS_SECRET (üres sem lehet). Állítsd a gyökér .env-ben és indítsd újra az api konténert.',
      });
    }
    try {
      const res = await dbToolsFetch('/health', { method: 'GET' });
      const text = await res.text();
      let data: unknown = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (!res.ok) {
        const upstreamErr =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error: unknown }).error)
            : 'Szolgáltatás hiba.';
        return reply.send({
          configured: true,
          ok: false,
          error:
            res.status === 401
              ? `db-tools elutasította a kulcsot (401). Ellenőrizd, hogy az api és a db-tools konténer ugyanazt a DB_TOOLS_SECRET értéket kapja. (${upstreamErr})`
              : upstreamErr,
        });
      }
      return reply.send({ configured: true, ok: true, ...((data as object) ?? {}) });
    } catch {
      return reply.send({
        configured: true,
        ok: false,
        error:
          'A db-tools nem érhető el az API konténerből (DNS / hálózat / nem fut). Ellenőrizd: docker compose ps, és hogy mindkettő a global-net-en van. Belső URL: http://db-tools:3010',
      });
    }
  });

  fastify.post('/database/backup', async (_req, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    try {
      const res = await dbToolsFetch('/backup', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return reply.status(res.status === 401 ? 502 : 500).send(data);
      }
      return reply.send(data);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });

  fastify.get('/database/backups/download', async (request, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    const q = request.query as { name?: string };
    const name = safeBackupName(q.name);
    if (!name) return reply.status(400).send({ error: 'Érvénytelen fájlnév.' });
    try {
      const upstream = await dbToolsFetch(`/file?name=${encodeURIComponent(name)}`, { method: 'GET' });
      if (!upstream.ok) {
        const err = await upstream.json().catch(() => ({}));
        return reply.status(upstream.status).send(err);
      }
      const cd = upstream.headers.get('content-disposition');
      const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
      if (cd) reply.header('content-disposition', cd);
      reply.header('content-type', ct);
      if (!upstream.body) return reply.status(502).send({ error: 'Üres válasz.' });
      return reply.send(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]));
    } catch {
      return reply.status(502).send({ error: 'Letöltés sikertelen.' });
    }
  });

  fastify.get('/database/backups', async (_req, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    try {
      const res = await dbToolsFetch('/backups', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return reply.status(502).send(data);
      return reply.send(data);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });

  fastify.get('/database/schedule', async (_req, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    try {
      const res = await dbToolsFetch('/schedule', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return reply.status(502).send(data);
      return reply.send(data);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });

  fastify.put('/database/schedule', async (request, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    const body = ScheduleBody.parse(request.body);
    try {
      const res = await dbToolsFetch('/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return reply.status(400).send(data);
      return reply.send(data);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });

  fastify.delete('/database/backups', async (request, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    const q = request.query as { name?: string | string[] };
    const raw = Array.isArray(q.name) ? q.name[0] : q.name;
    const safe = safeBackupName(raw);
    if (!safe) return reply.status(400).send({ error: 'Érvénytelen fájlnév.' });
    try {
      const res = await dbToolsFetch(`/file?name=${encodeURIComponent(safe)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return reply.status(res.status).send(data);
      return reply.send(data);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });

  fastify.post('/database/data-update', async (request, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'Nincs fájl (file mező).' });
    const buf = await data.toBuffer();
    const filename = data.filename || 'update.sql';
    const form = new FormData();
    const parts: BlobPart[] = [buf.subarray(0) as unknown as BlobPart];
    form.append(
      'file',
      new Blob(parts, { type: data.mimetype || 'application/octet-stream' }),
      filename,
    );
    try {
      const res = await dbToolsFetch('/data-update', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return reply.status(500).send(json);
      return reply.send(json);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });

  fastify.post('/database/restore', async (request, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    const { filename } = z.object({ filename: z.string() }).parse(request.body);
    const name = safeBackupName(filename);
    if (!name) return reply.status(400).send({ error: 'Érvénytelen fájlnév.' });
    try {
      const res = await dbToolsFetch('/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return reply.status(500).send(data);
      return reply.send(data);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });

  fastify.post('/database/restore-upload', async (request, reply) => {
    if (!isDatabaseToolsConfigured()) {
      return reply.status(503).send({ error: 'Mentő szolgáltatás nincs konfigurálva.' });
    }
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'Nincs fájl (file mező).' });
    const buf = await data.toBuffer();
    const filename = data.filename || 'upload.dump';
    const form = new FormData();
    const parts: BlobPart[] = [buf.subarray(0) as unknown as BlobPart];
    form.append(
      'file',
      new Blob(parts, { type: data.mimetype || 'application/octet-stream' }),
      filename,
    );
    try {
      const res = await dbToolsFetch('/restore-upload', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return reply.status(500).send(json);
      return reply.send(json);
    } catch {
      return reply.status(502).send({ error: 'db-tools nem válaszol.' });
    }
  });
}
