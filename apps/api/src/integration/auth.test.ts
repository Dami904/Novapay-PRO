import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock BullMQ queue module BEFORE any route imports (Vitest hoists vi.mock)
vi.mock('../workers/queue', () => ({
  emailQueue:     { add: vi.fn().mockResolvedValue({ id: 'mock-email-job' }) },
  txWatcherQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-tx-job' }) },
  scheduleQueue:  { add: vi.fn().mockResolvedValue({ id: 'mock-sched-job' }) },
}));

import { buildTestApp }     from './helpers/app';
import { cleanupUsers, cleanupOrgs } from './helpers/db';
import { extractRefreshCookie, makeExpiredToken } from './helpers/auth';
import prisma from '../db/client';

const createdUserIds: string[] = [];
const createdOrgIds:  string[] = [];

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupOrgs(createdOrgIds);
  await cleanupUsers(createdUserIds);
});

// ── POST /api/v1/auth/signup ──────────────────────────────────────────────────

describe('POST /api/v1/auth/signup', () => {
  it('creates user + org + token on valid input', async () => {
    const ts  = Date.now();
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/auth/signup',
      payload: {
        email:    `signup-${ts}@test.com`,
        password: 'Password123!',
        fullName: 'Test User',
        orgName:  `TestOrg-${ts}`,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body.user.email).toBe(`signup-${ts}@test.com`);
    expect(body.org).toHaveProperty('id');
    expect(body.org).toHaveProperty('slug');

    // Refresh cookie must be set
    expect(extractRefreshCookie(res.headers['set-cookie'])).toBeTruthy();

    // Verify in DB
    const user = await prisma.user.findUnique({ where: { email: `signup-${ts}@test.com` } });
    expect(user).not.toBeNull();

    createdUserIds.push(user!.id);
    createdOrgIds.push(body.org.id);
  });

  it('rejects duplicate email with 409', async () => {
    const ts = Date.now();
    const payload = {
      email:    `dup-${ts}@test.com`,
      password: 'Password123!',
      orgName:  `DupOrg-${ts}`,
    };

    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/signup', payload });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json();
    createdUserIds.push(firstBody.user.id);
    createdOrgIds.push(firstBody.org.id);

    const second = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/signup',
      payload: { ...payload, orgName: `DupOrg2-${ts}` },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatch(/already registered/i);
  });

  it('rejects short password with 400', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/signup',
      payload: { email: 'short@test.com', password: 'short', orgName: 'SomeOrg' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing orgName with 400', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/signup',
      payload: { email: 'noorg@test.com', password: 'Password123!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('generates a unique slug when org name is already taken', async () => {
    const ts = Date.now();
    const orgName = `SameSlugOrg-${ts}`;

    const r1 = await app.inject({
      method: 'POST', url: '/api/v1/auth/signup',
      payload: { email: `slug1-${ts}@test.com`, password: 'Password123!', orgName },
    });
    const r2 = await app.inject({
      method: 'POST', url: '/api/v1/auth/signup',
      payload: { email: `slug2-${ts}@test.com`, password: 'Password123!', orgName },
    });

    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r1.json().org.slug).not.toBe(r2.json().org.slug);

    createdUserIds.push(r1.json().user.id, r2.json().user.id);
    createdOrgIds.push(r1.json().org.id, r2.json().org.id);
  });
});

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  const ts  = Date.now();
  const email    = `login-${ts}@test.com`;
  const password = 'LoginPass123!';
  let userId: string;
  let orgId:  string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/signup',
      payload: { email, password, orgName: `LoginOrg-${ts}` },
    });
    userId = res.json().user.id;
    orgId  = res.json().org.id;
    createdUserIds.push(userId);
    createdOrgIds.push(orgId);
  });

  it('returns accessToken + refresh cookie on correct credentials', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('accessToken');
    expect(extractRefreshCookie(res.headers['set-cookie'])).toBeTruthy();
  });

  it('returns 401 for wrong password', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email, password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid/i);
  });

  it('returns 401 for non-existent email (same message — no user enumeration)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email: 'nobody@test.com', password: 'Password123!' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid/i);
  });

  it('returns 400 for malformed body (missing email)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { password: 'Password123!' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  const ts  = Date.now();
  const email    = `refresh-${ts}@test.com`;
  const password = 'RefreshPass123!';
  let refreshCookie: string;

  beforeAll(async () => {
    const signup = await app.inject({
      method: 'POST', url: '/api/v1/auth/signup',
      payload: { email, password, orgName: `RefreshOrg-${ts}` },
    });
    createdUserIds.push(signup.json().user.id);
    createdOrgIds.push(signup.json().org.id);

    const login = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email, password },
    });
    refreshCookie = extractRefreshCookie(login.headers['set-cookie'])!;
  });

  it('exchanges a valid refresh cookie for a new accessToken', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      headers: { cookie: `refreshToken=${refreshCookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('accessToken');
    // A new refresh cookie replaces the old one
    expect(extractRefreshCookie(res.headers['set-cookie'])).toBeTruthy();
    // Update for subsequent tests (token has been rotated)
    refreshCookie = extractRefreshCookie(res.headers['set-cookie'])!;
  });

  it('returns 401 when no cookie present', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when refresh token has been revoked (after logout)', async () => {
    // Logout to revoke the current token
    await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/logout',
      headers: { cookie: `refreshToken=${refreshCookie}` },
    });

    // Same cookie now invalid
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      headers: { cookie: `refreshToken=${refreshCookie}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('succeeds and clears the refresh cookie', async () => {
    const ts  = Date.now();
    const signup = await app.inject({
      method: 'POST', url: '/api/v1/auth/signup',
      payload: { email: `logout-${ts}@test.com`, password: 'LogoutPass123!', orgName: `LogoutOrg-${ts}` },
    });
    createdUserIds.push(signup.json().user.id);
    createdOrgIds.push(signup.json().org.id);

    const cookie = extractRefreshCookie(signup.headers['set-cookie'])!;

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/logout',
      headers: { cookie: `refreshToken=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toMatch(/logged out/i);
  });

  it('succeeds even without a cookie present (idempotent)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(res.statusCode).toBe(200);
  });
});

// ── Token validation on protected routes ─────────────────────────────────────

describe('Token validation', () => {
  it('returns 401 on a protected route without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 on a protected route with an expired token', async () => {
    const expired = makeExpiredToken(app);
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/me',
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
