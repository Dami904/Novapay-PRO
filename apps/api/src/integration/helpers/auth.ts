import { createHmac }   from 'crypto';
import { FastifyInstance } from 'fastify';
import prisma from '../../db/client';
import { hashPassword, buildOrgClaims, signAccessToken } from '../../services/authService';
import { env } from '../../config/env';

export interface TestUser {
  id:     string;
  email:  string;
  token:  string;   // signed access JWT — pass as Bearer in Authorization header
  orgId:  string;
  role:   string;
}

/**
 * Seed a new user + org + membership directly in the DB, then return a signed
 * access token. Uses timestamp in email/slug to guarantee uniqueness per call.
 *
 * @example
 * const owner = await seedUserWithOrg(app);
 * const res   = await app.inject({ headers: { authorization: `Bearer ${owner.token}` }, ... });
 */
export async function seedUserWithOrg(
  app:     FastifyInstance,
  options: {
    role?:         string;
    email?:        string;
    orgName?:      string;
    isSuperAdmin?: boolean;
  } = {},
): Promise<TestUser> {
  const ts      = Date.now();
  const email   = options.email   ?? `test-${ts}@integration.test`;
  const orgName = options.orgName ?? `TestOrg-${ts}`;
  const role    = options.role    ?? 'owner';

  const passwordHash = await hashPassword('Test@Pass123!');

  const { user, org } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, passwordHash, isSuperAdmin: options.isSuperAdmin ?? false },
    });
    const slug = orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + `-${ts}`;
    const org  = await tx.organization.create({
      data: { name: orgName, slug, plan: 'free' },
    });
    await tx.orgMember.create({
      data: { orgId: org.id, userId: user.id, role },
    });
    await tx.subscriptionPlan.create({
      data: { orgId: org.id, plan: 'free' },
    });
    return { user, org };
  });

  const orgs  = await buildOrgClaims(user.id);
  const token = signAccessToken(app, { sub: user.id, email: user.email, orgs });

  return { id: user.id, email: user.email, token, orgId: org.id, role };
}

/**
 * Add an existing user to an existing org with a given role.
 * Returns a freshly-signed access token with the updated org claims.
 */
export async function addMemberToOrg(
  app:    FastifyInstance,
  userId: string,
  email:  string,
  orgId:  string,
  role:   string,
): Promise<string> {
  await prisma.orgMember.upsert({
    where:  { orgId_userId: { orgId, userId } },
    update: { role },
    create: { orgId, userId, role },
  });
  const orgs  = await buildOrgClaims(userId);
  return signAccessToken(app, { sub: userId, email, orgs });
}

/**
 * Seed a standalone user with no org — used for testing cross-org isolation.
 */
export async function seedStandaloneUser(
  app:     FastifyInstance,
  options: { email?: string; isSuperAdmin?: boolean } = {},
): Promise<{ id: string; email: string; token: string }> {
  const ts           = Date.now();
  const email        = options.email ?? `lone-${ts}@integration.test`;
  const passwordHash = await hashPassword('Test@Pass123!');
  const user         = await prisma.user.create({
    data: { email, passwordHash, isSuperAdmin: options.isSuperAdmin ?? false },
  });
  // Token with empty orgs — will pass authenticate but fail requireOrgMember
  const token = signAccessToken(app, { sub: user.id, email: user.email, orgs: [] });
  return { id: user.id, email: user.email, token };
}

/**
 * Craft a JWT that has already expired — useful for testing 401 responses.
 * fast-jwt (used by @fastify/jwt) rejects negative expiresIn values, so we
 * build the token manually: valid HS256 signature but exp set to the past.
 * Does NOT create any DB records.
 */
export function makeExpiredToken(_app: FastifyInstance): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub:   'fake-user-id',
    email: 'expired@test.com',
    orgs:  [],
    iat:   1_000_000,   // 1970 — always in the past
    exp:   1_000_001,   // expired 50+ years ago
  })).toString('base64url');
  const sig = createHmac('sha256', env.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/** Parse the Set-Cookie header and extract the refreshToken cookie value. */
export function extractRefreshCookie(setCookieHeader: string | string[] | undefined): string | null {
  if (!setCookieHeader) return null;
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const h of headers) {
    const match = h.match(/^refreshToken=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}
