import argon2 from 'argon2';
import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { generateToken } from '../utils/token';
import { env } from '../config/env';

// ── Password ──────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// ── JWT ───────────────────────────────────────────────────────────────────────

interface OrgClaim {
  org_id: string;
  role:   string;
  slug:   string;
}

export interface TokenPayload {
  sub:   string;
  email: string;
  orgs:  OrgClaim[];
}

/**
 * Build the list of org claims for a user to embed in their JWT.
 * Called on login, signup, and token refresh.
 */
export async function buildOrgClaims(userId: string): Promise<OrgClaim[]> {
  const memberships = await prisma.orgMember.findMany({
    where:   { userId },
    include: { org: { select: { id: true, slug: true, plan: true } } },
  });

  return memberships.map((m) => ({
    org_id: m.orgId,
    role:   m.role,
    slug:   m.org.slug,
  }));
}

/**
 * Sign a short-lived access JWT (15 min).
 */
export function signAccessToken(app: FastifyInstance, payload: TokenPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (app.jwt as any).sign(
    { sub: payload.sub, email: payload.email, orgs: payload.orgs },
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

// ── Refresh Tokens ────────────────────────────────────────────────────────────

const REFRESH_TTL_DAYS = 30;

/**
 * Create and persist a refresh token for a user.
 * Returns the raw token string (to be set as an HttpOnly cookie).
 */
export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateToken(40);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);

  await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });

  return token;
}

/**
 * Rotate a refresh token — delete the old one, issue a new one.
 * Returns null if the token is invalid or expired.
 */
export async function rotateRefreshToken(
  oldToken: string,
): Promise<{ userId: string; newToken: string } | null> {
  const record = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
  });

  if (!record || record.expiresAt < new Date()) {
    // Invalid or expired — delete it if it exists
    if (record) {
      await prisma.refreshToken.delete({ where: { token: oldToken } });
    }
    return null;
  }

  // Delete old token and create new one atomically
  await prisma.refreshToken.delete({ where: { token: oldToken } });
  const newToken = await createRefreshToken(record.userId);

  return { userId: record.userId, newToken };
}

/**
 * Revoke a specific refresh token (logout).
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

/**
 * Cookie config for the refresh token — HttpOnly, Secure in prod.
 */
export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   env.NODE_ENV === 'production',
  sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  path:     '/api/v1/auth',
  maxAge:   60 * 60 * 24 * REFRESH_TTL_DAYS, // seconds
};
