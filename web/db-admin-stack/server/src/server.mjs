import { createReadStream, promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cron from 'node-cron';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const PORT = parseInt(process.env.PORT ?? '3010', 10);
const SECRET = process.env.DB_TOOLS_SECRET ?? '';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
/** Prisma ?schema=… – pg_dump / pg_restore / psql URI-ben nem engedélyezett */
function postgresCliConnectionUri(raw) {
  if (!raw) return raw;
  const i = raw.indexOf('?');
  return i === -1 ? raw : raw.slice(0, i);
}
const PG_CLI_URL = postgresCliConnectionUri(DATABASE_URL);

const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? '/backups');
const SCHEDULE_FILE = resolve(process.env.SCHEDULE_FILE ?? '/config/schedule.json');

const ConfigSchema = z.object({
  cron: z.string().min(9).max(64),
  enabled: z.boolean(),
  timezone: z.string().optional(),
  manualBackupDir: z.string().optional(),
  scheduledBackupDir: z.string().optional(),
  retentionDays: z.number().min(2).max(30).optional(),
});

const DEFAULT_CONFIG = {
  cron: '0 4 * * *',
  enabled: false,
  timezone: 'Europe/Budapest',
  manualBackupDir: BACKUP_DIR,
  scheduledBackupDir: BACKUP_DIR,
  retentionDays: 7,
};

function assertSecret(req, reply) {
  if (!SECRET) {
    reply.code(500).send({ error: 'DB_TOOLS_SECRET nincs beállítva.' });
    return false;
  }
  const h = req.headers['x-db-tools-secret'];
  if (h !== SECRET) {
    reply.code(401).send({ error: 'Érvénytelen kulcs.' });
    return false;
  }
  return true;
}

function safeBasename(name) {
  if (!name || typeof name !== 'string') return null;
  const base = name.split('/').pop().split('\\').pop();
  if (!base || base === '.' || base === '..') return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) return null;
  return base;
}

function isIgnorablePgRestoreTransactionTimeoutError(stderrText) {
  if (!stderrText) return false;
  return (
    stderrText.includes('unrecognized configuration parameter "transaction_timeout"') &&
    stderrText.includes('Command was: SET transaction_timeout = 0;') &&
    stderrText.includes('errors ignored on restore: 1')
  );
}

let cronTask = null;

async function readConfig() {
  try {
    const raw = await fs.readFile(SCHEDULE_FILE, 'utf8');
    const parsed = ConfigSchema.parse(JSON.parse(raw));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function writeConfig(spec) {
  await fs.mkdir(join(SCHEDULE_FILE, '..'), { recursive: true });
  await fs.writeFile(SCHEDULE_FILE, JSON.stringify(spec, null, 2), 'utf8');
}

function getBackupDirs(config) {
  const dirs = new Set();
  dirs.add(resolve(config.manualBackupDir || BACKUP_DIR));
  dirs.add(resolve(config.scheduledBackupDir || BACKUP_DIR));
  dirs.add(BACKUP_DIR);
  return [...dirs];
}

function detectSource(filename) {
  if (filename.startsWith('manual-')) return 'manual';
  if (filename.startsWith('auto-')) return 'auto';
  return 'legacy';
}

async function resolveBackupFile(name) {
  const safe = safeBasename(name);
  if (!safe) return null;
  const config = await readConfig();
  const dirs = getBackupDirs(config);
  for (const dir of dirs) {
    const abs = resolve(join(dir, safe));
    if (!abs.startsWith(dir + '/') && abs !== dir) continue;
    try {
      await fs.access(abs);
      return abs;
    } catch { continue; }
  }
  return null;
}

async function runBackup(source = 'manual') {
  const config = await readConfig();
  const dir = source === 'auto'
    ? resolve(config.scheduledBackupDir || BACKUP_DIR)
    : resolve(config.manualBackupDir || BACKUP_DIR);
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix = source === 'auto' ? 'auto' : 'manual';
  const filename = `${prefix}-vitascan-${stamp}.dump`;
  const outPath = join(dir, filename);
  await execFileAsync('pg_dump', ['-Fc', '-f', outPath, '-d', PG_CLI_URL], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const st = await fs.stat(outPath);
  return { filename, path: outPath, size: st.size, mtime: st.mtime.toISOString(), source };
}

async function cleanupOldBackups() {
  const config = await readConfig();
  const retentionDays = config.retentionDays || 7;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const dirs = getBackupDirs(config);

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile() || ent.name.startsWith('.')) continue;
        const abs = join(dir, ent.name);
        const st = await fs.stat(abs);
        if (st.mtime < cutoff) {
          await fs.unlink(abs);
          console.log(`[db-tools] Régi mentés törölve: ${ent.name} (${retentionDays} napos limit)`);
        }
      }
    } catch { /* dir might not exist yet */ }
  }
}

function applyCronFromDisk() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  return readConfig().then((config) => {
    if (!config.enabled) return config;
    if (!cron.validate(config.cron)) return config;
    cronTask = cron.schedule(
      config.cron,
      () => {
        runBackup('auto')
          .then(() => cleanupOldBackups())
          .catch((e) => console.error('[db-tools] ütemezett mentés hiba:', e));
      },
      { timezone: config.timezone || 'Europe/Budapest' },
    );
    return config;
  });
}

const app = Fastify({ logger: true });

await app.register(multipart, {
  limits: { fileSize: 512 * 1024 * 1024 },
});

app.addHook('onReady', async () => {
  const config = await readConfig();
  const dirs = getBackupDirs(config);
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.mkdir(join(SCHEDULE_FILE, '..'), { recursive: true });
  try {
    await fs.access(SCHEDULE_FILE);
  } catch {
    await writeConfig(DEFAULT_CONFIG);
  }
  await applyCronFromDisk();
  await cleanupOldBackups().catch((e) => console.error('[db-tools] startup cleanup hiba:', e));
});

app.get('/dirs', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  const rawPath = req.query?.path;
  let dirPath;
  try {
    dirPath = rawPath ? resolve(String(rawPath)) : '/';
  } catch {
    return reply.code(400).send({ error: 'Érvénytelen útvonal.' });
  }
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const dirs = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith('.')) continue;
      dirs.push({ name: ent.name, path: join(dirPath, ent.name) });
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    reply.send({ current: dirPath, parent: dirPath === '/' ? null : resolve(join(dirPath, '..')), dirs });
  } catch (e) {
    reply.code(400).send({ error: `Nem olvasható: ${e?.message ?? dirPath}` });
  }
});

app.get('/health', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  const config = await readConfig();
  reply.send({
    ok: true,
    backupDir: BACKUP_DIR,
    manualBackupDir: config.manualBackupDir || BACKUP_DIR,
    scheduledBackupDir: config.scheduledBackupDir || BACKUP_DIR,
    databaseConfigured: !!DATABASE_URL,
  });
});

app.post('/backup', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  if (!DATABASE_URL) return reply.code(500).send({ error: 'DATABASE_URL hiányzik.' });
  try {
    const result = await runBackup('manual');
    reply.send({ message: 'Mentés kész.', ...result });
  } catch (e) {
    req.log.error(e);
    reply.code(500).send({ error: e?.message ?? 'pg_dump sikertelen.' });
  }
});

app.get('/backups', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  const config = await readConfig();
  const dirs = getBackupDirs(config);
  const files = [];
  const seen = new Set();

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile() || ent.name.startsWith('.') || seen.has(ent.name)) continue;
        seen.add(ent.name);
        const abs = join(dir, ent.name);
        const st = await fs.stat(abs);
        files.push({
          name: ent.name,
          size: st.size,
          mtime: st.mtime.toISOString(),
          source: detectSource(ent.name),
        });
      }
    } catch { /* dir might not exist */ }
  }

  files.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  reply.send({ files });
});

app.get('/file/:name', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  const name = safeBasename(req.params.name);
  if (!name) return reply.code(400).send({ error: 'Érvénytelen fájlnév.' });
  const abs = await resolveBackupFile(name);
  if (!abs) return reply.code(404).send({ error: 'Fájl nem található.' });
  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Content-Disposition', `attachment; filename="${name}"`);
  return reply.send(createReadStream(abs));
});

app.delete('/file/:name', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  const name = safeBasename(req.params.name);
  if (!name) return reply.code(400).send({ error: 'Érvénytelen fájlnév.' });
  const abs = await resolveBackupFile(name);
  if (!abs) return reply.code(404).send({ error: 'Fájl nem található.' });
  await fs.unlink(abs);
  reply.send({ message: `${name} törölve.` });
});

app.post('/data-update', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  if (!DATABASE_URL) return reply.code(500).send({ error: 'DATABASE_URL hiányzik.' });
  const part = await req.file();
  if (!part) return reply.code(400).send({ error: 'Nincs fájl.' });
  const safe = safeBasename(part.filename || 'update.sql');
  if (!safe) return reply.code(400).send({ error: 'Érvénytelen fájlnév.' });
  const lower = safe.toLowerCase();
  if (!lower.endsWith('.dump') && !lower.endsWith('.backup') && !lower.endsWith('.sql')) {
    return reply.code(400).send({ error: 'Csak .dump, .backup vagy .sql engedélyezett.' });
  }
  const target = join(BACKUP_DIR, `update-${Date.now()}-${safe}`);

  const buf = await part.toBuffer();
  await fs.writeFile(target, buf);

  try {
    if (lower.endsWith('.sql')) {
      await execFileAsync('psql', [PG_CLI_URL, '-v', 'ON_ERROR_STOP=1', '-f', target], {
        maxBuffer: 64 * 1024 * 1024,
      });
    } else {
      await execFileAsync(
        'pg_restore',
        ['--no-owner', '--no-privileges', '--data-only', '-d', PG_CLI_URL, target],
        { maxBuffer: 64 * 1024 * 1024 },
      );
    }
    reply.send({ message: 'Adatfrissítés sikeres. A meglévő adatok megmaradtak.' });
  } catch (e) {
    const stderr = e?.stderr?.toString?.() || '';
    if (isIgnorablePgRestoreTransactionTimeoutError(stderr)) {
      return reply.send({
        message: 'Adatfrissítés lefutott (transaction_timeout figyelmen kívül hagyva).',
      });
    }
    req.log.error(e);
    reply.code(500).send({ error: stderr || e?.message || 'Adatfrissítés hiba.' });
  } finally {
    await fs.unlink(target).catch(() => {});
  }
});

app.get('/schedule', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  const config = await readConfig();
  reply.send(config);
});

app.put('/schedule', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  const body = ConfigSchema.parse(req.body);
  if (body.enabled && !cron.validate(body.cron)) {
    return reply.code(400).send({ error: 'Érvénytelen cron kifejezés.' });
  }
  if (body.manualBackupDir) {
    await fs.mkdir(resolve(body.manualBackupDir), { recursive: true });
  }
  if (body.scheduledBackupDir) {
    await fs.mkdir(resolve(body.scheduledBackupDir), { recursive: true });
  }
  await writeConfig(body);
  await applyCronFromDisk();
  reply.send({ message: 'Beállítások mentve.', ...body });
});

app.post('/restore', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  if (!DATABASE_URL) return reply.code(500).send({ error: 'DATABASE_URL hiányzik.' });
  const { filename } = z.object({ filename: z.string() }).parse(req.body);
  const name = safeBasename(filename);
  if (!name) return reply.code(400).send({ error: 'Érvénytelen fájlnév.' });
  const abs = await resolveBackupFile(name);
  if (!abs) return reply.code(404).send({ error: 'Fájl nem található.' });

  const lower = name.toLowerCase();
  try {
    if (lower.endsWith('.dump') || lower.endsWith('.backup')) {
      await execFileAsync(
        'pg_restore',
        ['--clean', '--if-exists', '--no-owner', '-d', PG_CLI_URL, abs],
        { maxBuffer: 64 * 1024 * 1024 },
      );
    } else if (lower.endsWith('.sql')) {
      await execFileAsync('psql', [PG_CLI_URL, '-v', 'ON_ERROR_STOP=1', '-f', abs], {
        maxBuffer: 64 * 1024 * 1024,
      });
    } else {
      return reply
        .code(400)
        .send({ error: 'Csak .dump / .backup (pg_restore) vagy .sql (psql) támogatott.' });
    }
    reply.send({ message: 'Visszaállítás lefutott.' });
  } catch (e) {
    const stderr = e?.stderr?.toString?.() || '';
    if (isIgnorablePgRestoreTransactionTimeoutError(stderr)) {
      req.log.warn(
        '[db-tools] pg_restore transaction_timeout SET figyelmen kívül hagyva (PG dump/client ujabb, mint a szerver).',
      );
      return reply.send({
        message:
          'Visszaállítás lefutott. Megjegyzés: a transaction_timeout beállítást a szerver nem ismeri, ez figyelmen kívül lett hagyva.',
      });
    }
    req.log.error(e);
    reply.code(500).send({ error: stderr || e?.message || 'pg_restore/psql hiba.' });
  }
});

app.post('/restore-upload', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  if (!DATABASE_URL) return reply.code(500).send({ error: 'DATABASE_URL hiányzik.' });
  const part = await req.file();
  if (!part) return reply.code(400).send({ error: 'Nincs fájl.' });
  const safe = safeBasename(part.filename || 'upload.dump');
  if (!safe) return reply.code(400).send({ error: 'Érvénytelen fájlnév.' });
  const lower = safe.toLowerCase();
  if (!lower.endsWith('.dump') && !lower.endsWith('.backup') && !lower.endsWith('.sql')) {
    return reply.code(400).send({ error: 'Csak .dump, .backup vagy .sql engedélyezett.' });
  }
  const target = join(BACKUP_DIR, `upload-${Date.now()}-${safe}`);

  const buf = await part.toBuffer();
  await fs.writeFile(target, buf);

  try {
    if (lower.endsWith('.sql')) {
      await execFileAsync('psql', [PG_CLI_URL, '-v', 'ON_ERROR_STOP=1', '-f', target], {
        maxBuffer: 64 * 1024 * 1024,
      });
    } else {
      await execFileAsync(
        'pg_restore',
        ['--clean', '--if-exists', '--no-owner', '-d', PG_CLI_URL, target],
        { maxBuffer: 64 * 1024 * 1024 },
      );
    }
    reply.send({ message: 'Feltöltött mentés visszaállítva.', tempFile: target });
  } catch (e) {
    const stderr = e?.stderr?.toString?.() || '';
    if (isIgnorablePgRestoreTransactionTimeoutError(stderr)) {
      req.log.warn(
        '[db-tools] pg_restore transaction_timeout SET figyelmen kívül hagyva (PG dump/client ujabb, mint a szerver).',
      );
      return reply.send({
        message:
          'Feltöltött mentés visszaállítva. Megjegyzés: a transaction_timeout beállítást a szerver nem ismeri, ez figyelmen kívül lett hagyva.',
        tempFile: target,
      });
    }
    req.log.error(e);
    reply.code(500).send({ error: stderr || e?.message || 'Visszaállítás hiba.' });
  } finally {
    await fs.unlink(target).catch(() => {});
  }
});

if (!SECRET || !DATABASE_URL) {
  console.error('[db-tools] Induláshoz szükséges: DB_TOOLS_SECRET és DATABASE_URL');
  process.exit(1);
}

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
