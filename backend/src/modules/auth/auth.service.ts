import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { SignPayload, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../plugins/jwt';
import { RegisterInput, LoginInput } from './auth.schema';

const REFRESH_TOKEN_TTL_DAYS = 30;

export async function registerUser(prisma: PrismaClient, input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.email }, { username: input.username }],
    },
  });

  if (existing) {
    if (existing.email === input.email) throw new Error('Ez az email cím már foglalt.');
    throw new Error('Ez a felhasználónév már foglalt.');
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      passwordHash,
    },
    select: { id: true, username: true, email: true, role: true, createdAt: true },
  });

  return user;
}

export async function loginUser(prisma: PrismaClient, input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user || user.deletedAt) {
    throw new Error('Hibás email vagy jelszó.');
  }

  const valid = await argon2.verify(user.passwordHash, input.password);
  if (!valid) throw new Error('Hibás email vagy jelszó.');

  const payload: SignPayload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  };
}

export async function refreshTokens(prisma: PrismaClient, rawToken: string) {
  // Verify JWT signature first
  const payload = verifyRefreshToken(rawToken);

  // Check DB — token must exist, not revoked, not expired
  const stored = await prisma.refreshToken.findUnique({
    where: { token: rawToken },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new Error('Érvénytelen vagy lejárt refresh token.');
  }

  // Token rotation: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const newAccessToken = signAccessToken({ userId: payload.userId, role: payload.role });
  const newRefreshToken = signRefreshToken({ userId: payload.userId, role: payload.role });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await prisma.refreshToken.create({
    data: { token: newRefreshToken, userId: stored.userId, expiresAt },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logoutUser(prisma: PrismaClient, rawToken: string) {
  await prisma.refreshToken.updateMany({
    where: { token: rawToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
