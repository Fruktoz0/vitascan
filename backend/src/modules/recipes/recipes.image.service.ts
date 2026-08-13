import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import type { ReadStream } from 'fs';
import sharp from 'sharp';
import { httpError, type StoredRecipeImage } from './recipes.types';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 1600;
const WEBP_QUALITY = 80;
const TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UUID_WEBP_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

function storageRoot(): string {
  const raw = process.env.RECIPE_STORAGE_DIR?.trim() || path.join(process.cwd(), 'data', 'vitascan', 'recipes');
  return path.resolve(raw);
}

function assertInsideRoot(target: string, root: string) {
  const resolved = path.resolve(target);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw httpError(400, 'Érvénytelen tárolási kulcs.');
  }
}

export async function ensureRecipeStorage(): Promise<void> {
  const root = storageRoot();
  await fs.mkdir(path.join(root, 'tmp'), { recursive: true });
}

async function encodeWebp(buf: Buffer): Promise<{ webp: Buffer; width: number; height: number }> {
  if (!buf?.length) throw httpError(400, 'Hiányzik a kép.');
  if (buf.length > MAX_BYTES) throw httpError(413, 'A kép túl nagy. Maximum 8 MB.');

  let decoded: sharp.Sharp;
  try {
    decoded = sharp(buf, { failOn: 'error' }).rotate();
    await decoded.metadata();
  } catch {
    throw httpError(400, 'A fájl nem érvényes kép.');
  }

  const meta = await decoded.metadata();
  if (!meta.format || !['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff'].includes(meta.format)) {
    throw httpError(400, 'Nem támogatott képformátum.');
  }

  const resized =
    (meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE
      ? decoded.resize({
          width: MAX_EDGE,
          height: MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
      : decoded;

  const webp = await resized.webp({ quality: WEBP_QUALITY }).toBuffer();
  const out = await sharp(webp).metadata();
  return { webp, width: out.width ?? 0, height: out.height ?? 0 };
}

export async function saveTempRecipeImage(userId: string, buf: Buffer): Promise<StoredRecipeImage> {
  await ensureRecipeStorage();
  const { webp, width, height } = await encodeWebp(buf);
  const key = `${randomUUID()}.webp`;
  const root = storageRoot();
  const dir = path.join(root, 'tmp', userId);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, key);
  assertInsideRoot(dest, root);
  await fs.writeFile(dest, webp);
  void cleanupOldTempImages();
  return { storageKey: key, mimeType: 'image/webp', width, height, sizeBytes: webp.length };
}

export async function promoteTempImage(
  userId: string,
  tempKey: string,
): Promise<StoredRecipeImage> {
  if (!UUID_WEBP_RE.test(tempKey)) throw httpError(400, 'Érvénytelen képkulcs.');
  const root = storageRoot();
  const src = path.join(root, 'tmp', userId, tempKey);
  const dest = path.join(root, tempKey);
  assertInsideRoot(src, root);
  assertInsideRoot(dest, root);
  try {
    await fs.rename(src, dest);
  } catch {
    throw httpError(400, 'A feltöltött kép már nem elérhető. Töltsd fel újra.');
  }
  const stat = await fs.stat(dest);
  const meta = await sharp(dest).metadata();
  return {
    storageKey: tempKey,
    mimeType: 'image/webp',
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    sizeBytes: stat.size,
  };
}

export async function savePermanentRecipeImage(buf: Buffer): Promise<StoredRecipeImage> {
  await ensureRecipeStorage();
  const { webp, width, height } = await encodeWebp(buf);
  const key = `${randomUUID()}.webp`;
  const root = storageRoot();
  const dest = path.join(root, key);
  assertInsideRoot(dest, root);
  await fs.writeFile(dest, webp);
  return { storageKey: key, mimeType: 'image/webp', width, height, sizeBytes: webp.length };
}

export function resolveRecipeFilePath(storageKey: string): string {
  if (!UUID_WEBP_RE.test(storageKey)) throw httpError(400, 'Érvénytelen képkulcs.');
  const root = storageRoot();
  const dest = path.join(root, storageKey);
  assertInsideRoot(dest, root);
  return dest;
}

export function resolveTempFilePath(userId: string, storageKey: string): string {
  if (!UUID_WEBP_RE.test(storageKey)) throw httpError(400, 'Érvénytelen képkulcs.');
  const root = storageRoot();
  const dest = path.join(root, 'tmp', userId, storageKey);
  assertInsideRoot(dest, root);
  return dest;
}

export async function openRecipeImageStream(storageKey: string): Promise<{ stream: ReadStream; size: number }> {
  const dest = resolveRecipeFilePath(storageKey);
  try {
    const stat = await fs.stat(dest);
    return { stream: createReadStream(dest), size: stat.size };
  } catch {
    throw httpError(404, 'A receptképet nem találjuk.');
  }
}

export async function openTempImageStream(
  userId: string,
  storageKey: string,
): Promise<{ stream: ReadStream; size: number }> {
  const dest = resolveTempFilePath(userId, storageKey);
  try {
    const stat = await fs.stat(dest);
    return { stream: createReadStream(dest), size: stat.size };
  } catch {
    throw httpError(404, 'A feltöltött kép már nem elérhető.');
  }
}

export async function readTempImageBuffer(userId: string, storageKey: string): Promise<Buffer> {
  const dest = resolveTempFilePath(userId, storageKey);
  try {
    return await fs.readFile(dest);
  } catch {
    throw httpError(400, 'A feltöltött kép már nem elérhető.');
  }
}

export async function deleteRecipeFile(storageKey: string): Promise<void> {
  try {
    await fs.unlink(resolveRecipeFilePath(storageKey));
  } catch {
    /* missing file is fine */
  }
}

async function cleanupOldTempImages() {
  const root = storageRoot();
  const tmpRoot = path.join(root, 'tmp');
  const now = Date.now();
  try {
    const users = await fs.readdir(tmpRoot, { withFileTypes: true });
    for (const dir of users) {
      if (!dir.isDirectory()) continue;
      const dirPath = path.join(tmpRoot, dir.name);
      assertInsideRoot(dirPath, root);
      const files = await fs.readdir(dirPath);
      for (const name of files) {
        if (!UUID_WEBP_RE.test(name)) continue;
        const filePath = path.join(dirPath, name);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > TMP_MAX_AGE_MS) await fs.unlink(filePath);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}
