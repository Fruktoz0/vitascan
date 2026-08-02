import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.FITNESS_CREDENTIALS_KEY?.trim();
  if (!raw) {
    throw Object.assign(
      new Error('FITNESS_CREDENTIALS_KEY nincs beállítva.'),
      { statusCode: 503 },
    );
  }
  // Accept 64-char hex or arbitrary string (hashed to 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return createHash('sha256').update(raw).digest();
}

/** Encrypt plaintext → base64(iv|tag|ciphertext) */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 28) {
    throw Object.assign(new Error('Érvénytelen titkosított adat.'), { statusCode: 500 });
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function hasCredentialsKey(): boolean {
  return !!process.env.FITNESS_CREDENTIALS_KEY?.trim();
}
