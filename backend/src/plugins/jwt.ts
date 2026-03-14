import jwt from 'jsonwebtoken';

export interface SignPayload {
  userId: string;
  role: string;
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'vitascan-access-secret-change-me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'vitascan-refresh-secret-change-me';

export function signAccessToken(payload: SignPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: SignPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): SignPayload {
  return jwt.verify(token, ACCESS_SECRET) as SignPayload;
}

export function verifyRefreshToken(token: string): SignPayload {
  try {
    return jwt.verify(token, REFRESH_SECRET) as SignPayload;
  } catch {
    throw new Error('Érvénytelen refresh token.');
  }
}
