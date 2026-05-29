import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ethers } from 'ethers';
import prisma from '../../db/client';
import { ROLES } from '../../config/constants';
import redis from '../../lib/redis';
import {
  hashPassword,
  verifyPassword,
  buildOrgClaims,
  signAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  REFRESH_COOKIE_OPTIONS,
} from '../../services/authService';
import { writeAudit } from '../../services/auditService';
import { slugify, uniqueSlug } from '../../utils/slugify';
import { generateNonce } from '../../utils/token';
import { authenticate } from '../../middleware/authenticate';

// ── Validation schemas ────────────────────────────────────────────────────────

const signupSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2).optional(),
  orgName:  z.string().min(2, 'Organisation name must be at least 2 characters'),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ── Plugin ────────────────────────────────────────────────────────────────────

export default async function authRoutes(app: FastifyInstance) {

  // ── POST /auth/signup ──────────────────────────────────────────────────────
  // Creates user + org + owner membership in one atomic transaction
  app.post('/signup', async (request, reply) => {
    const body = signupSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const { email: rawEmail, password, fullName, orgName } = body.data;
    const email = rawEmail.toLowerCase().trim();

    // Check email not taken
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    // Build a unique slug
    let slug = slugify(orgName);
    const slugExists = await prisma.organization.findUnique({ where: { slug } });
    if (slugExists) slug = uniqueSlug(slug);

    const passwordHash = await hashPassword(password);

    // Atomic: create user + org + membership + free subscription
    const { user, org } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, fullName },
      });

      const org = await tx.organization.create({
        data: { name: orgName, slug, plan: 'free' },
      });

      await tx.orgMember.create({
        data: { orgId: org.id, userId: user.id, role: 'owner' },
      });

      await tx.subscriptionPlan.create({
        data: { orgId: org.id, plan: 'free' },
      });

      return { user, org };
    });

    // Audit log
    await writeAudit({
      orgId:        org.id,
      actorId:      user.id,
      action:       'org.created',
      resourceType: 'organization',
      resourceId:   org.id,
      ipAddress:    request.ip,
    });

    // Issue tokens
    const orgs         = await buildOrgClaims(user.id);
    const accessToken  = signAccessToken(app, { sub: user.id, email: user.email, orgs });
    const refreshToken = await createRefreshToken(user.id);

    reply.setCookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    return reply.code(201).send({
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, isSuperAdmin: user.isSuperAdmin },
      org:  { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
    });
  });


  // ── POST /auth/login ───────────────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const { email: rawEmail, password } = body.data;
    const email = rawEmail.toLowerCase().trim();

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user) {
      // Same message for wrong email or wrong password — prevents user enumeration
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const orgs         = await buildOrgClaims(user.id);
    const accessToken  = signAccessToken(app, { sub: user.id, email: user.email, orgs });
    const refreshToken = await createRefreshToken(user.id);

    reply.setCookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    return reply.send({
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, isSuperAdmin: user.isSuperAdmin },
      orgs,
    });
  });


  // ── POST /auth/refresh ─────────────────────────────────────────────────────
  // Rotates refresh token and issues a new access token
  app.post('/refresh', async (request, reply) => {
    const oldToken = request.cookies?.refreshToken;
    if (!oldToken) {
      return reply.code(401).send({ error: 'No refresh token provided' });
    }

    const result = await rotateRefreshToken(oldToken);
    if (!result) {
      reply.clearCookie('refreshToken', { path: '/api/v1/auth' });
      return reply.code(401).send({ error: 'Refresh token expired or invalid. Please log in again.' });
    }

    const user = await prisma.user.findUnique({
      where:  { id: result.userId },
      select: { id: true, email: true, fullName: true, isSuperAdmin: true },
    });

    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }

    const orgs        = await buildOrgClaims(user.id);
    const accessToken = signAccessToken(app, { sub: user.id, email: user.email, orgs });

    reply.setCookie('refreshToken', result.newToken, REFRESH_COOKIE_OPTIONS);

    return reply.send({
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, isSuperAdmin: user.isSuperAdmin },
      orgs,
    });
  });


  // ── POST /auth/logout ──────────────────────────────────────────────────────
  app.post('/logout', async (request, reply) => {
    const token = request.cookies?.refreshToken;
    if (token) await revokeRefreshToken(token);

    reply.clearCookie('refreshToken', { path: '/api/v1/auth' });
    return reply.send({ message: 'Logged out successfully' });
  });


  // ── POST /auth/wallet/challenge ────────────────────────────────────────────
  // Returns a nonce the frontend wallet must sign
  // Requires the user to be logged in (links wallet to their org)
  app.post(
    '/wallet/challenge',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const nonce = generateNonce();

      // Store nonce in Redis for 5 minutes keyed by user id
      await redis.set(`wallet_nonce:${request.user.sub}`, nonce, 'EX', 300);

      return reply.send({ nonce });
    },
  );


  // ── POST /auth/wallet/verify ───────────────────────────────────────────────
  // Verifies wallet signature, stores wallet address on the org
  app.post(
    '/wallet/verify',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          signature: z.string().min(1),
          orgId:     z.string().uuid(),
        })
        .safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
      }

      const { signature, orgId } = body.data;

      // Retrieve stored nonce
      const nonce = await redis.get(`wallet_nonce:${request.user.sub}`);
      if (!nonce) {
        return reply.code(400).send({ error: 'Nonce expired. Request a new challenge.' });
      }

      // Verify user is owner/admin of the org
      const membership = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: request.user.sub } },
      });

      if (!membership || ![ROLES.OWNER, ROLES.ADMIN].includes(membership.role as typeof ROLES.OWNER)) {
        return reply.code(403).send({ error: 'Only owners and admins can link a wallet' });
      }

      // Recover wallet address from signature
      let walletAddress: string;
      try {
        walletAddress = ethers.verifyMessage(nonce, signature);
      } catch {
        return reply.code(400).send({ error: 'Invalid signature' });
      }

      // Save wallet address to org
      await prisma.organization.update({
        where: { id: orgId },
        data:  { walletAddress },
      });

      // Delete used nonce
      await redis.del(`wallet_nonce:${request.user.sub}`);

      await writeAudit({
        orgId,
        actorId:      request.user.sub,
        action:       'org.wallet_linked',
        resourceType: 'organization',
        resourceId:   orgId,
        metadata:     { walletAddress },
        ipAddress:    request.ip,
      });

      return reply.send({ walletAddress, message: 'Wallet linked successfully' });
    },
  );
}
