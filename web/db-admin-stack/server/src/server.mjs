import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, dirname, join, resolve, relative, sep } from 'node:path';
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
/** API-val közös volume: receptképek (uuid.webp). Üres, ha a db-tools nem látja a tárat. */
const RECIPE_STORAGE_DIR = process.env.RECIPE_STORAGE_DIR
  ? resolve(process.env.RECIPE_STORAGE_DIR)
  : '';

const RCLONE_UPLOAD_ENABLED = /^(1|true|yes|on)$/i.test(
  String(process.env.RCLONE_UPLOAD_ENABLED ?? '').trim(),
);
const RCLONE_REMOTE = String(process.env.RCLONE_REMOTE ?? '').trim();
const RCLONE_CONFIG = resolve(process.env.RCLONE_CONFIG ?? '/rclone/rclone.conf');

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

/** Csak fájlnév (útvonal-nélkül), pg_dump / kézi mentések neveihez elég laza szabály. */
function safeBasename(name) {
  if (!name || typeof name !== 'string') return null;
  const base = name.split('/').pop().split('\\').pop();
  if (!base || base === '.' || base === '..') return null;
  if (base.includes('\0') || base.length > 240) return null;
  if (/[/\\]/.test(base)) return null;
  return base;
}

/** A fájl ténylegesen a megadott gyökérkönyvtár alatt van-e (path traversal ellen). */
function fileIsInsideDir(dirAbs, fileAbs) {
  const root = resolve(dirAbs);
  const candidate = resolve(fileAbs);
  if (candidate === root) return false;
  const rel = relative(root, candidate);
  if (!rel) return false;
  return !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('..');
}

function isIgnorablePgRestoreTransactionTimeoutError(stderrText) {
  if (!stderrText) return false;
  if (!/unrecognized configuration parameter ["']transaction_timeout["']/i.test(stderrText)) return false;
  if (/duplicate key value violates unique constraint/i.test(stderrText)) return false;
  return true;
}

function parsePgUrl(raw) {
  const s = String(raw).replace(/^postgres(ql)?:/i, 'postgresql:');
  const u = new URL(s);
  const database = decodeURIComponent((u.pathname || '/').replace(/^\//, '') || 'postgres');
  return {
    user: decodeURIComponent(u.username || 'postgres'),
    password: u.password ? decodeURIComponent(u.password) : '',
    host: u.hostname,
    port: u.port || '5432',
    database,
  };
}

function buildPsqlEnv() {
  const p = parsePgUrl(DATABASE_URL);
  return { ...process.env, PGPASSWORD: p.password };
}

/** pg_restore -f kimenetből kiszűrjük a régi szerveren hibázó SET sorokat. */
async function filterPgRestoreSqlFile(srcPath, destPath) {
  const rl = createInterface({ input: createReadStream(srcPath), crlfDelay: Infinity });
  const out = createWriteStream(destPath);
  for await (const line of rl) {
    if (/^\s*SET\s+transaction_timeout\b/i.test(line)) continue;
    if (/^\s*SET\s+idle_in_transaction_session_timeout\b/i.test(line)) continue;
    if (!out.write(`${line}\n`)) {
      await new Promise((r) => out.once('drain', r));
    }
  }
  out.end();
  rl.close();
  await new Promise((res, rej) => out.on('finish', res).on('error', rej));
}

/**
 * Preferált merge sorrend (FK-barát) — igazítva a Prisma schema.prisma modellekhez.
 * Recipe a Food előtt: Food.preparedFromRecipeId → Recipe.id (körkörös 1:1 a Food oldalon).
 * A cél séma egyéb public táblái (kivéve _prisma_migrations) a lista végére kerülnek,
 * ha a dumpban is megvannak.
 */
const MERGE_TABLE_ORDER = [
  'User',
  'UserProfile',
  'NotificationPref',
  'PushSubscription',
  'SystemSetting',
  'RefreshToken',
  'DataShare',
  'ShoppingList',
  'ShoppingListItem',
  'Recipe',
  'Food',
  'FoodComponent',
  'Vote',
  'FoodFavorite',
  'FoodEditLog',
  'RecipeIngredient',
  'RecipeImage',
  'RecipeFavorite',
  'AiRecipeImport',
  'DailyLog',
  'MealTemplate',
  'MealTemplateItem',
  'WaterLog',
  'WeightLog',
  'DayNote',
  'DailyAnalysis',
  'AiFoodRecognition',
  'BodyMeasurementLog',
  'BodyMeasurementGoal',
  'BodyFatLog',
  'BodyFatGoal',
  'AiBodyAnalysis',
  'WorkoutLog',
  'DailyStepLog',
];

/**
 * Régi mentések WaterLog sémája (amountMl event sorok) → napi összesítő (totalMl + loggedDate).
 * Ugyanaz a logika, mint backend/prisma/sql/migrate_water_to_daily.sql — a merge DB-n
 * kell lefuttatni, különben a cél NOT NULL loggedDate miatt a teljes WaterLog kihagyódik.
 */
const NORMALIZE_WATER_LOG_SQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WaterLog'
      AND column_name = 'amountMl'
  ) THEN
    CREATE TABLE "WaterLog_daily" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "totalMl" INTEGER NOT NULL DEFAULT 0,
      "loggedDate" DATE NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "WaterLog_daily_pkey" PRIMARY KEY ("id")
    );

    INSERT INTO "WaterLog_daily" ("id", "userId", "totalMl", "loggedDate", "createdAt", "updatedAt")
    SELECT
      (array_agg(w."id" ORDER BY w."createdAt" ASC))[1],
      w."userId",
      SUM(w."amountMl")::INTEGER,
      (timezone('UTC', w."createdAt"))::date,
      MIN(w."createdAt"),
      MAX(w."createdAt")
    FROM "WaterLog" w
    GROUP BY w."userId", (timezone('UTC', w."createdAt"))::date;

    ALTER TABLE "WaterLog" DROP CONSTRAINT IF EXISTS "WaterLog_userId_fkey";
    DROP TABLE "WaterLog";
    ALTER TABLE "WaterLog_daily" RENAME TO "WaterLog";

    ALTER TABLE "WaterLog"
      ADD CONSTRAINT "WaterLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

    CREATE UNIQUE INDEX "WaterLog_userId_loggedDate_key"
      ON "WaterLog"("userId", "loggedDate");
    CREATE INDEX "WaterLog_userId_loggedDate_idx"
      ON "WaterLog"("userId", "loggedDate");
  END IF;
END $$;
`;

/** Régi dump sémáját a merge DB-n a jelenlegi app-séma felé közelíti (oszlop-metszet előtt). */
async function normalizeLegacySchemaInMergeDb(psql, mergeDb, log) {
  try {
    await psql(mergeDb, ['-v', 'ON_ERROR_STOP=1', '-c', NORMALIZE_WATER_LOG_SQL]);
    log.info('[db-tools] merge DB: WaterLog legacy normalizálás lefutott (ha kellett).');
  } catch (e) {
    const msg = e?.stderr?.toString?.() || e?.message || String(e);
    log.warn({ err: msg }, '[db-tools] merge DB WaterLog normalizálás figyelmeztetés');
    // Ne állítsuk le a merge-t: ha nincs WaterLog / már új séma, a DO blokk no-op.
    // Valódi hiba esetén a későbbi FDW merge WaterLog-ot kihagyhatja.
  }
}

/**
 * Szelektív adatbetöltés: üres ideiglenes DB-be restore, majd FDW-n keresztül
 * oszlop-metszetes INSERT ... ON CONFLICT DO NOTHING (létező sorok megmaradnak).
 * FK-hiányos sorok kimaradnak; séma-drift (eltérő oszlopok) nem bontja el a merge-t.
 */
async function mergeDataFromCustomFormat(dumpPath, log) {
  const p = parsePgUrl(DATABASE_URL);
  const env = buildPsqlEnv();
  const mergeDb = `vitascan_merge_${Date.now()}`;
  const maintenanceDb = 'postgres';
  const stamp = Date.now();
  const sqlRaw = join(BACKUP_DIR, `_merge_raw_${stamp}.sql`);
  const sqlFiltered = join(BACKUP_DIR, `_merge_flt_${stamp}.sql`);
  const mergeSql = join(BACKUP_DIR, `_merge_ins_${stamp}.sql`);

  const psql = (database, args) =>
    execFileAsync('psql', ['-h', p.host, '-p', p.port, '-U', p.user, '-d', database, ...args], {
      env,
      maxBuffer: 512 * 1024 * 1024,
    });

  const dropMergeDb = async () => {
    try {
      await execFileAsync(
        'dropdb',
        ['-h', p.host, '-p', p.port, '-U', p.user, '--if-exists', mergeDb],
        { env, maxBuffer: 16 * 1024 * 1024 },
      );
    } catch {
      /* ignore */
    }
  };

  const cleanupFdwOnMain = async () => {
    try {
      await psql(p.database, [
        '-v',
        'ON_ERROR_STOP=0',
        '-c',
        'DROP SERVER IF EXISTS vitascan_merge_srv CASCADE; DROP SCHEMA IF EXISTS vitascan_merge_fdw CASCADE; DROP TABLE IF EXISTS public._vitascan_merge_stats;',
      ]);
    } catch {
      /* ignore */
    }
  };

  try {
    await psql(maintenanceDb, [
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE DATABASE "${mergeDb.replace(/"/g, '""')}" OWNER "${p.user.replace(/"/g, '""')}";`,
    ]);
  } catch (e) {
    log.error(e);
    throw new Error(
      `Ideiglenes adatbázis létrehozása sikertelen (${mergeDb}). ` +
        `A felhasználónak jog kell a(z) "${maintenanceDb}" adatbázison (pl. CREATEDB / tulajdonos). ` +
        (e?.stderr?.toString() || e?.message || ''),
    );
  }

  try {
    await execFileAsync('pg_restore', ['-f', sqlRaw, dumpPath], {
      env,
      maxBuffer: 512 * 1024 * 1024,
    });
    await filterPgRestoreSqlFile(sqlRaw, sqlFiltered);
    await psql(mergeDb, ['-v', 'ON_ERROR_STOP=1', '-f', sqlFiltered]);
    await normalizeLegacySchemaInMergeDb(psql, mergeDb, log);

    let pgVer = 0;
    try {
      const { stdout } = await execFileAsync(
        'psql',
        ['-h', p.host, '-p', p.port, '-U', p.user, '-d', p.database, '-t', '-A', '-c', 'SHOW server_version_num;'],
        { env, maxBuffer: 1024 * 1024 },
      );
      pgVer = parseInt(String(stdout).trim(), 10) || 0;
    } catch {
      pgVer = 0;
    }
    if (pgVer < 150000) {
      throw new Error(
        `A szelektív összefésüléshez PostgreSQL 15+ kell (server_version_num >= 150000; most: ${pgVer || 'ismeretlen'}). ` +
          'Frissítsd a szervert, vagy importálj egy üres példányra és cseréld le az adatbázist.',
      );
    }

    const esc = (s) => String(s).replace(/'/g, "''");
    const orderSql = MERGE_TABLE_ORDER.map((t) => `'${esc(t)}'`).join(',');
    const fdwSql = `
BEGIN;
CREATE EXTENSION IF NOT EXISTS postgres_fdw;
DROP SCHEMA IF EXISTS vitascan_merge_fdw CASCADE;
CREATE SCHEMA vitascan_merge_fdw;
DROP SERVER IF EXISTS vitascan_merge_srv CASCADE;
CREATE SERVER vitascan_merge_srv FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '${esc(p.host)}', dbname '${esc(mergeDb)}', port '${esc(p.port)}');
DROP USER MAPPING IF EXISTS FOR CURRENT_USER SERVER vitascan_merge_srv;
CREATE USER MAPPING FOR CURRENT_USER SERVER vitascan_merge_srv
  OPTIONS (user '${esc(p.user)}', password '${esc(p.password)}');
IMPORT FOREIGN SCHEMA public EXCEPT (_prisma_migrations) FROM SERVER vitascan_merge_srv INTO vitascan_merge_fdw;

DROP TABLE IF EXISTS public._vitascan_merge_stats;
CREATE TABLE public._vitascan_merge_stats (
  tbl text PRIMARY KEY,
  source_rows bigint NOT NULL DEFAULT 0,
  inserted_rows bigint NOT NULL DEFAULT 0,
  note text
);

SET session_replication_role = replica;
DO $merge$
DECLARE
  preferred text[] := ARRAY[${orderSql}];
  tbl text;
  ordered text[];
  extra text[];
  col_list text;
  missing_required boolean;
  where_parts text[];
  where_sql text;
  fk_rec record;
  src_cols text[];
  ref_cols text[];
  i int;
  pair_parts text[];
  nullable_fk boolean;
  before_c bigint;
  after_c bigint;
  src_c bigint;
  sql text;
BEGIN
  SELECT coalesce(array_agg(t.tbl ORDER BY t.ord, t.tbl), ARRAY[]::text[])
  INTO ordered
  FROM (
    SELECT p.tbl, p.ord
    FROM unnest(preferred) WITH ORDINALITY AS p(tbl, ord)
    WHERE EXISTS (
      SELECT 1 FROM information_schema.tables pt
      WHERE pt.table_schema = 'public' AND pt.table_type = 'BASE TABLE' AND pt.table_name = p.tbl
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.foreign_tables ft
      WHERE ft.foreign_table_schema = 'vitascan_merge_fdw' AND ft.foreign_table_name = p.tbl
    )
  ) t;

  SELECT coalesce(array_agg(pt.table_name ORDER BY pt.table_name), ARRAY[]::text[])
  INTO extra
  FROM information_schema.tables pt
  WHERE pt.table_schema = 'public'
    AND pt.table_type = 'BASE TABLE'
    AND pt.table_name <> '_prisma_migrations'
    AND pt.table_name <> '_vitascan_merge_stats'
    AND NOT (pt.table_name = ANY (preferred))
    AND EXISTS (
      SELECT 1 FROM information_schema.foreign_tables ft
      WHERE ft.foreign_table_schema = 'vitascan_merge_fdw' AND ft.foreign_table_name = pt.table_name
    );

  ordered := ordered || extra;

  FOREACH tbl IN ARRAY ordered
  LOOP
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO col_list
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = tbl
      AND c.is_generated = 'NEVER'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns f
        WHERE f.table_schema = 'vitascan_merge_fdw'
          AND f.table_name = tbl
          AND f.column_name = c.column_name
      );

    IF col_list IS NULL OR col_list = '' THEN
      INSERT INTO public._vitascan_merge_stats(tbl, source_rows, inserted_rows, note)
      VALUES (tbl, 0, 0, 'kihagyva: nincs közös oszlop')
      ON CONFLICT (tbl) DO UPDATE SET note = EXCLUDED.note;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = tbl
        AND c.is_nullable = 'NO'
        AND c.column_default IS NULL
        AND c.is_generated = 'NEVER'
        AND c.is_identity = 'NO'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns f
          WHERE f.table_schema = 'vitascan_merge_fdw'
            AND f.table_name = tbl
            AND f.column_name = c.column_name
        )
    ) INTO missing_required;

    IF missing_required THEN
      INSERT INTO public._vitascan_merge_stats(tbl, source_rows, inserted_rows, note)
      VALUES (tbl, 0, 0, 'kihagyva: kötelező oszlop hiányzik a mentésből')
      ON CONFLICT (tbl) DO UPDATE SET note = EXCLUDED.note;
      CONTINUE;
    END IF;

    where_parts := ARRAY[]::text[];
    FOR fk_rec IN
      SELECT
        c.conname,
        confrelid::regclass::text AS ref_reg,
        (
          SELECT array_agg(a.attname ORDER BY u.ord)
          FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
        ) AS src_atts,
        (
          SELECT array_agg(a.attname ORDER BY u.ord)
          FROM unnest(c.confkey) WITH ORDINALITY AS u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = u.attnum
        ) AS ref_atts
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = format('public.%I', tbl)::regclass
        AND c.confrelid <> format('public.%I', tbl)::regclass
    LOOP
      src_cols := fk_rec.src_atts;
      ref_cols := fk_rec.ref_atts;
      IF src_cols IS NULL OR ref_cols IS NULL OR array_length(src_cols, 1) IS NULL THEN
        CONTINUE;
      END IF;

      -- csak közös forrás-oszlopokra építünk FK szűrőt
      IF EXISTS (
        SELECT 1 FROM unnest(src_cols) s(col)
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns f
          WHERE f.table_schema = 'vitascan_merge_fdw'
            AND f.table_name = tbl
            AND f.column_name = s.col
        )
      ) THEN
        CONTINUE;
      END IF;

      pair_parts := ARRAY[]::text[];
      FOR i IN 1 .. array_length(src_cols, 1) LOOP
        pair_parts := pair_parts || format('r.%I = src.%I', ref_cols[i], src_cols[i]);
      END LOOP;

      SELECT bool_or(c.is_nullable = 'YES')
      INTO nullable_fk
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = tbl
        AND c.column_name = ANY (src_cols);

      IF coalesce(nullable_fk, false) THEN
        where_parts := where_parts || format(
          '((%s) OR EXISTS (SELECT 1 FROM %s r WHERE %s))',
          (SELECT string_agg(format('src.%I IS NULL', s.col), ' AND ') FROM unnest(src_cols) AS s(col)),
          fk_rec.ref_reg,
          array_to_string(pair_parts, ' AND ')
        );
      ELSE
        where_parts := where_parts || format(
          'EXISTS (SELECT 1 FROM %s r WHERE %s)',
          fk_rec.ref_reg,
          array_to_string(pair_parts, ' AND ')
        );
      END IF;
    END LOOP;

    IF array_length(where_parts, 1) IS NULL THEN
      where_sql := 'TRUE';
    ELSE
      where_sql := array_to_string(where_parts, ' AND ');
    END IF;

    EXECUTE format('SELECT count(*) FROM vitascan_merge_fdw.%I', tbl) INTO src_c;
    EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO before_c;

    sql := format(
      'INSERT INTO public.%I (%s) SELECT %s FROM vitascan_merge_fdw.%I src WHERE %s ON CONFLICT DO NOTHING',
      tbl, col_list, col_list, tbl, where_sql
    );
    EXECUTE sql;

    EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO after_c;

    INSERT INTO public._vitascan_merge_stats(tbl, source_rows, inserted_rows, note)
    VALUES (tbl, src_c, greatest(after_c - before_c, 0), NULL)
    ON CONFLICT (tbl) DO UPDATE
      SET source_rows = EXCLUDED.source_rows,
          inserted_rows = EXCLUDED.inserted_rows,
          note = EXCLUDED.note;
  END LOOP;
END $merge$;
SET session_replication_role = DEFAULT;
DROP SERVER IF EXISTS vitascan_merge_srv CASCADE;
DROP SCHEMA IF EXISTS vitascan_merge_fdw CASCADE;
COMMIT;
`;
    await fs.writeFile(mergeSql, fdwSql, 'utf8');
    try {
      await psql(p.database, ['-v', 'ON_ERROR_STOP=1', '-f', mergeSql]);
    } catch (e) {
      await cleanupFdwOnMain();
      const errText = e?.stderr?.toString() || e?.message || '';
      if (/postgres_fdw|permission denied to create extension/i.test(errText)) {
        throw new Error(
          'A postgres_fdw kiterjesztés nem telepíthető vagy nincs jogosultság. ' +
            'A szelektív összefésüléshez a cél adatbázis szuperfelhasználója (vagy megfelelő jog) szükséges. ' +
            errText,
        );
      }
      throw e;
    }

    let statsLines = [];
    try {
      const { stdout } = await psql(p.database, [
        '-v',
        'ON_ERROR_STOP=1',
        '-t',
        '-A',
        '-F',
        '|',
        '-c',
        `SELECT tbl, source_rows, inserted_rows, coalesce(note, '') FROM public._vitascan_merge_stats ORDER BY tbl;`,
      ]);
      statsLines = String(stdout || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    } catch (e) {
      log.warn(e);
    } finally {
      try {
        await psql(p.database, [
          '-v',
          'ON_ERROR_STOP=0',
          '-c',
          'DROP TABLE IF EXISTS public._vitascan_merge_stats;',
        ]);
      } catch {
        /* ignore */
      }
    }

    const parts = [];
    let foodInserted = null;
    let foodSource = null;
    for (const line of statsLines) {
      const [tbl, src, ins, note] = line.split('|');
      if (!tbl) continue;
      if (tbl === 'Food') {
        foodSource = Number(src) || 0;
        foodInserted = Number(ins) || 0;
      }
      if (note) {
        parts.push(`${tbl}: ${note}`);
      } else {
        parts.push(`${tbl}: +${ins}/${src}`);
      }
    }

    let message =
      'Szelektív adatfrissítés kész: csak új sorok (ON CONFLICT DO NOTHING); meglévő PK/unique értékek érintetlenek. ' +
      'Közös oszlopok kerültek át; hiányzó FK-jú sorok kimaradtak. A _prisma_migrations táblát nem módosítjuk.';
    if (foodInserted != null) {
      message += ` Ételek: ${foodInserted} új / ${foodSource} a mentésben.`;
    }
    if (parts.length) {
      message += ` Részletek: ${parts.join('; ')}.`;
    }

    return { message };
  } catch (e) {
    await cleanupFdwOnMain();
    throw e;
  } finally {
    await dropMergeDb();
    await fs.unlink(sqlRaw).catch(() => {});
    await fs.unlink(sqlFiltered).catch(() => {});
    await fs.unlink(mergeSql).catch(() => {});
  }
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

function isArchiveBackupName(name) {
  const l = String(name || '').toLowerCase();
  return l.endsWith('.tar.gz') || l.endsWith('.tgz') || l.endsWith('.tar');
}

function isDumpBackupName(name) {
  const l = String(name || '').toLowerCase();
  return l.endsWith('.dump') || l.endsWith('.backup');
}

function isSqlBackupName(name) {
  return String(name || '').toLowerCase().endsWith('.sql');
}

function tarListArgs(archivePath) {
  return String(archivePath).toLowerCase().endsWith('.tar')
    ? ['-tf', archivePath]
    : ['-tzf', archivePath];
}

function tarExtractArgs(archivePath, dest) {
  return String(archivePath).toLowerCase().endsWith('.tar')
    ? ['-xf', archivePath, '-C', dest]
    : ['-xzf', archivePath, '-C', dest];
}

/** Elutasítjuk a `/` és a túl rövid útvonalakat — ne pakoljuk a teljes fájlrendszert. */
function recipeStorageReady() {
  if (!RECIPE_STORAGE_DIR) return null;
  const root = resolve(RECIPE_STORAGE_DIR);
  if (root === '/' || root === resolve('/') || root.length < 8) return null;
  return root;
}

async function countPermanentRecipeFiles(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && !e.name.startsWith('.')).length;
  } catch {
    return 0;
  }
}

async function assertSafeTarMembers(archivePath) {
  const { stdout } = await execFileAsync('tar', tarListArgs(archivePath), {
    maxBuffer: 32 * 1024 * 1024,
  });
  const lines = String(stdout)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const n = line.replace(/^\.\//, '');
    if (!n || n.includes('\0') || n.startsWith('/') || n.includes('..')) {
      throw new Error('A csomag érvénytelen útvonalat tartalmaz.');
    }
  }
  return lines;
}

async function findExtractedDump(dir) {
  const preferred = ['database.dump', 'database.backup'];
  for (const name of preferred) {
    const abs = join(dir, name);
    try {
      await fs.access(abs);
      return abs;
    } catch {
      /* next */
    }
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.isFile() && isDumpBackupName(ent.name)) return join(dir, ent.name);
  }
  throw new Error('A csomagban nincs database.dump.');
}

async function findExtractedRecipesDir(dir) {
  const abs = join(dir, 'recipes');
  try {
    const st = await fs.stat(abs);
    if (st.isDirectory()) return abs;
  } catch {
    /* absent */
  }
  return null;
}

async function copyRecipeImagesFromDir(recipesDir, log) {
  const dest = recipeStorageReady();
  if (!dest) {
    log?.warn?.('[db-tools] receptképek kihagyva: RECIPE_STORAGE_DIR nincs beállítva.');
    return { recipeImages: 'skipped', recipeImageCount: 0 };
  }
  if (!recipesDir) {
    return { recipeImages: 'absent', recipeImageCount: 0 };
  }
  await fs.mkdir(dest, { recursive: true });
  let count = 0;
  const entries = await fs.readdir(recipesDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile() || ent.name.startsWith('.') || ent.name === 'tmp') continue;
    const from = join(recipesDir, ent.name);
    const to = join(dest, ent.name);
    if (!fileIsInsideDir(dest, to)) continue;
    await fs.copyFile(from, to);
    count += 1;
  }
  log?.info?.(`[db-tools] receptképek: ${count} fájl → ${dest}`);
  return { recipeImages: count > 0 ? 'ok' : 'absent', recipeImageCount: count };
}

/**
 * Csomag (.tar.gz) vagy nyers dump megnyitása. A fn dumpPath + opcionális recipesDir-t kap.
 * Archívum esetén a kicsomagolás temp könyvtára a fn után törlődik.
 */
async function withBackupPayload(filePath, originalName, fn) {
  const lower = String(originalName || filePath).toLowerCase();
  if (isArchiveBackupName(lower)) {
    const extractDir = join(
      BACKUP_DIR,
      `_extract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    );
    await fs.mkdir(extractDir, { recursive: true });
    try {
      await assertSafeTarMembers(filePath);
      await execFileAsync('tar', tarExtractArgs(filePath, extractDir), {
        maxBuffer: 512 * 1024 * 1024,
      });
      const dumpPath = await findExtractedDump(extractDir);
      const recipesDir = await findExtractedRecipesDir(extractDir);
      return await fn({ dumpPath, recipesDir, kind: 'archive' });
    } finally {
      await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  if (isDumpBackupName(lower)) {
    return await fn({ dumpPath: filePath, recipesDir: null, kind: 'dump' });
  }
  throw new Error('Csak .tar.gz (teljes mentés), .dump / .backup vagy .sql támogatott.');
}

async function pgRestoreDump(dumpPath) {
  await execFileAsync(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '-d', PG_CLI_URL, dumpPath],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

async function pgRestoreDumpAllowTimeout(dumpPath, log) {
  try {
    await pgRestoreDump(dumpPath);
    return { timeoutIgnored: false };
  } catch (e) {
    const stderr = e?.stderr?.toString?.() || '';
    if (isIgnorablePgRestoreTransactionTimeoutError(stderr)) {
      log?.warn?.(
        '[db-tools] pg_restore transaction_timeout SET figyelmen kívül hagyva (PG dump/client ujabb, mint a szerver).',
      );
      return { timeoutIgnored: true };
    }
    throw e;
  }
}

function restoreMessage(base, media, timeoutIgnored) {
  const parts = [base];
  if (media?.recipeImages === 'ok' && media.recipeImageCount > 0) {
    parts.push(`${media.recipeImageCount} receptkép visszaállítva.`);
  } else if (media?.recipeImages === 'skipped') {
    parts.push('A receptképek kimaradtak (RECIPE_STORAGE_DIR nincs a db-tools konténerben).');
  }
  if (timeoutIgnored) {
    parts.push(
      'Megjegyzés: a transaction_timeout beállítást a szerver nem ismeri, ez figyelmen kívül lett hagyva.',
    );
  }
  return parts.join(' ');
}

async function restoreDumpAndMedia(filePath, originalName, log) {
  const lower = String(originalName).toLowerCase();
  if (isSqlBackupName(lower)) {
    await execFileAsync('psql', [PG_CLI_URL, '-v', 'ON_ERROR_STOP=1', '-f', filePath], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return { media: { recipeImages: 'absent', recipeImageCount: 0 }, timeoutIgnored: false };
  }
  return await withBackupPayload(filePath, originalName, async ({ dumpPath, recipesDir }) => {
    const { timeoutIgnored } = await pgRestoreDumpAllowTimeout(dumpPath, log);
    const media = await copyRecipeImagesFromDir(recipesDir, log);
    return { media, timeoutIgnored };
  });
}

async function resolveBackupFile(name) {
  const safe = safeBasename(name);
  if (!safe) return null;
  const config = await readConfig();
  const dirs = getBackupDirs(config);
  for (const dir of dirs) {
    const abs = resolve(join(dir, safe));
    if (!fileIsInsideDir(dir, abs)) continue;
    try {
      await fs.access(abs);
      return abs;
    } catch {
      continue;
    }
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
  const filename = `${prefix}-vitascan-${stamp}.tar.gz`;
  const outPath = join(dir, filename);
  const staging = join(dir, `_staging_${stamp}_${process.pid}`);
  await fs.mkdir(staging, { recursive: true });
  const dumpPath = join(staging, 'database.dump');
  let containsMedia = false;
  let recipeFileCount = 0;
  try {
    await execFileAsync('pg_dump', ['-Fc', '-f', dumpPath, '-d', PG_CLI_URL], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const tarArgs = ['-czf', outPath, '-C', staging, 'database.dump'];
    const recipeRoot = recipeStorageReady();
    if (recipeRoot) {
      try {
        const st = await fs.stat(recipeRoot);
        if (st.isDirectory()) {
          recipeFileCount = await countPermanentRecipeFiles(recipeRoot);
          if (recipeFileCount > 0) {
            tarArgs.push(
              '--exclude=tmp',
              '--exclude=recipes/tmp',
              '-C',
              dirname(recipeRoot),
              basename(recipeRoot),
            );
            containsMedia = true;
          }
        }
      } catch {
        /* recepttár nem olvasható — csak DB kerül a csomagba */
      }
    }
    await execFileAsync('tar', tarArgs, { maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    await fs.unlink(outPath).catch(() => {});
    throw e;
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
  const st = await fs.stat(outPath);
  return {
    filename,
    path: outPath,
    size: st.size,
    mtime: st.mtime.toISOString(),
    source,
    containsMedia,
    recipeFileCount,
  };
}

/**
 * Mentés feltöltése rclone-nal (Google Drive stb.).
 * Hibánál nem dob — a lokális dump megmarad; a visszatérés státuszt jelez.
 * @returns {{ driveUpload: 'ok' | 'skipped' | 'failed', driveUploadError?: string }}
 */
async function uploadBackupToRemote(absPath) {
  if (!RCLONE_UPLOAD_ENABLED) {
    return { driveUpload: 'skipped' };
  }
  if (!RCLONE_REMOTE) {
    console.warn('[db-tools] rclone: RCLONE_UPLOAD_ENABLED=true, de RCLONE_REMOTE üres — feltöltés kihagyva.');
    return { driveUpload: 'skipped', driveUploadError: 'RCLONE_REMOTE nincs beállítva.' };
  }
  try {
    await fs.access(RCLONE_CONFIG);
  } catch {
    const msg = `rclone config nem található: ${RCLONE_CONFIG}`;
    console.error(`[db-tools] ${msg}`);
    return { driveUpload: 'failed', driveUploadError: msg };
  }
  try {
    await execFileAsync(
      'rclone',
      ['copy', absPath, RCLONE_REMOTE, '--config', RCLONE_CONFIG, '--retries', '3'],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    console.log(`[db-tools] rclone feltöltés OK → ${RCLONE_REMOTE} (${absPath})`);
    return { driveUpload: 'ok' };
  } catch (e) {
    const stderr = e?.stderr?.toString?.()?.trim() || '';
    const msg = stderr || e?.message || 'rclone hiba';
    console.error('[db-tools] rclone feltöltés sikertelen:', msg);
    return { driveUpload: 'failed', driveUploadError: msg };
  }
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
        if (ent.isDirectory() && (ent.name.startsWith('_staging_') || ent.name.startsWith('_extract_'))) {
          await fs.rm(join(dir, ent.name), { recursive: true, force: true }).catch(() => {});
          continue;
        }
        if (!ent.isFile() || ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
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
          .then(async (result) => {
            await uploadBackupToRemote(result.path);
            await cleanupOldBackups();
          })
          .catch((e) => console.error('[db-tools] ütemezett mentés hiba:', e));
      },
      { timezone: config.timezone || 'Europe/Budapest' },
    );
    return config;
  });
}

const app = Fastify({ logger: true });

/** Könyvtár tallózás: a multipart előtt kell regisztrálni, különben egyes verziókban a GET /dirs 404-et adhat. */
app.get('/dirs', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  let rawPath = req.query?.path;
  if (Array.isArray(rawPath)) rawPath = rawPath[0];
  let dirPath;
  try {
    if (rawPath == null || rawPath === '') {
      dirPath = BACKUP_DIR;
    } else {
      let s = String(rawPath);
      try {
        s = decodeURIComponent(s);
      } catch {
        /* marad s */
      }
      dirPath = resolve(s);
    }
  } catch {
    return reply.code(400).send({ error: 'Érvénytelen útvonal.' });
  }

  async function sendListing(pathAbs, parentAbs) {
    const entries = await fs.readdir(pathAbs, { withFileTypes: true });
    const dirs = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith('.')) continue;
      dirs.push({ name: ent.name, path: join(pathAbs, ent.name) });
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    reply.send({ current: pathAbs, parent: parentAbs, dirs });
  }

  try {
    const parent =
      dirPath === '/' || dirPath === resolve('/') ? null : resolve(join(dirPath, '..'));
    await sendListing(dirPath, parent);
    return;
  } catch (e) {
    if (dirPath === '/' || dirPath === resolve('/')) {
      const fallback = [];
      for (const name of ['backups', 'mnt', 'var', 'app', 'tmp', 'home']) {
        const p = join('/', name);
        try {
          const st = await fs.stat(p);
          if (st.isDirectory()) fallback.push({ name, path: p });
        } catch {
          /* skip */
        }
      }
      fallback.sort((a, b) => a.name.localeCompare(b.name));
      if (fallback.length) {
        return reply.send({ current: '/', parent: null, dirs: fallback });
      }
    }
    reply.code(400).send({ error: `Nem olvasható: ${e?.message ?? dirPath}` });
  }
});

await app.register(multipart, {
  limits: { fileSize: 1024 * 1024 * 1024 },
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

app.get('/health', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  const config = await readConfig();
  reply.send({
    ok: true,
    backupDir: BACKUP_DIR,
    manualBackupDir: config.manualBackupDir || BACKUP_DIR,
    scheduledBackupDir: config.scheduledBackupDir || BACKUP_DIR,
    databaseConfigured: !!DATABASE_URL,
    rcloneUploadEnabled: RCLONE_UPLOAD_ENABLED,
    rcloneRemote: RCLONE_UPLOAD_ENABLED ? RCLONE_REMOTE || null : null,
    recipeStorageDir: recipeStorageReady() || null,
  });
});

app.post('/backup', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  if (!DATABASE_URL) return reply.code(500).send({ error: 'DATABASE_URL hiányzik.' });
  try {
    const result = await runBackup('manual');
    const upload = await uploadBackupToRemote(result.path);
    reply.send({ message: 'Mentés kész.', ...result, ...upload });
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
        if (!ent.isFile() || ent.name.startsWith('.') || ent.name.startsWith('_') || seen.has(ent.name)) continue;
        seen.add(ent.name);
        const abs = join(dir, ent.name);
        const st = await fs.stat(abs);
        files.push({
          name: ent.name,
          size: st.size,
          mtime: st.mtime.toISOString(),
          source: detectSource(ent.name),
          containsMedia: isArchiveBackupName(ent.name),
        });
      }
    } catch { /* dir might not exist */ }
  }

  files.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  reply.send({ files });
});

app.get('/file', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  let raw = req.query?.name;
  if (Array.isArray(raw)) raw = raw[0];
  const name = safeBasename(raw ? String(raw) : '');
  if (!name) return reply.code(400).send({ error: 'Érvénytelen fájlnév.' });
  const abs = await resolveBackupFile(name);
  if (!abs) return reply.code(404).send({ error: 'Fájl nem található.' });
  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Content-Disposition', `attachment; filename="${name}"`);
  return reply.send(createReadStream(abs));
});

app.delete('/file', async (req, reply) => {
  if (!assertSecret(req, reply)) return;
  let raw = req.query?.name;
  if (Array.isArray(raw)) raw = raw[0];
  const name = safeBasename(raw ? String(raw) : '');
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
  if (!isDumpBackupName(lower) && !isSqlBackupName(lower) && !isArchiveBackupName(lower)) {
    return reply.code(400).send({ error: 'Csak .tar.gz, .dump, .backup vagy .sql engedélyezett.' });
  }
  const target = join(BACKUP_DIR, `update-${Date.now()}-${safe}`);

  const buf = await part.toBuffer();
  await fs.writeFile(target, buf);

  try {
    if (isSqlBackupName(lower)) {
      await execFileAsync('psql', [PG_CLI_URL, '-v', 'ON_ERROR_STOP=1', '-f', target], {
        maxBuffer: 64 * 1024 * 1024,
      });
      return reply.send({ message: 'SQL fájl lefuttatva.' });
    }
    const result = await withBackupPayload(target, safe, async ({ dumpPath, recipesDir }) => {
      const merge = await mergeDataFromCustomFormat(dumpPath, req.log);
      const media = await copyRecipeImagesFromDir(recipesDir, req.log);
      let message = merge.message;
      if (media.recipeImageCount > 0) {
        message += ` Receptképek: ${media.recipeImageCount} fájl bemásolva.`;
      }
      return { message };
    });
    return reply.send(result);
  } catch (e) {
    const stderr = e?.stderr?.toString?.() || '';
    if (isIgnorablePgRestoreTransactionTimeoutError(stderr)) {
      return reply.send({
        message: 'Adatfrissítés lefutott (transaction_timeout figyelmen kívül hagyva).',
      });
    }
    req.log.error(e);
    reply.code(500).send({ error: stderr || e?.message || String(e) || 'Adatfrissítés hiba.' });
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
  if (!isDumpBackupName(lower) && !isSqlBackupName(lower) && !isArchiveBackupName(lower)) {
    return reply
      .code(400)
      .send({ error: 'Csak .tar.gz (teljes mentés), .dump / .backup vagy .sql támogatott.' });
  }
  try {
    const { media, timeoutIgnored } = await restoreDumpAndMedia(abs, name, req.log);
    reply.send({
      message: restoreMessage('Visszaállítás lefutott.', media, timeoutIgnored),
      ...media,
    });
  } catch (e) {
    const stderr = e?.stderr?.toString?.() || '';
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
  if (!isDumpBackupName(lower) && !isSqlBackupName(lower) && !isArchiveBackupName(lower)) {
    return reply.code(400).send({ error: 'Csak .tar.gz, .dump, .backup vagy .sql engedélyezett.' });
  }
  const target = join(BACKUP_DIR, `upload-${Date.now()}-${safe}`);

  const buf = await part.toBuffer();
  await fs.writeFile(target, buf);

  try {
    const { media, timeoutIgnored } = await restoreDumpAndMedia(target, safe, req.log);
    reply.send({
      message: restoreMessage('Feltöltött mentés visszaállítva.', media, timeoutIgnored),
      ...media,
    });
  } catch (e) {
    const stderr = e?.stderr?.toString?.() || '';
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
