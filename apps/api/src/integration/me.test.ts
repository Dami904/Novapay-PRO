import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../workers/queue', () => ({
  emailQueue:     { add: vi.fn().mockResolvedValue({ id: 'mock-email-job' }) },
  txWatcherQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-tx-job' }) },
  scheduleQueue:  { add: vi.fn().mockResolvedValue({ id: 'mock-sched-job' }) },
}));

import { buildTestApp }              from './helpers/app';
import { seedUserWithOrg, seedStandaloneUser, makeExpiredToken } from './helpers/auth';
import { cleanupUsers, cleanupOrgs } from './helpers/db';
import prisma from '../db/client';

let app: FastifyInstance;

const createdUserIds: string[] = [];
const createdOrgIds:  string[] = [];

let userToken: string;
let userId:    string;
let orgId:     string;

beforeAll(async () => {
  app = await buildTestApp();
  const u = await seedUserWithOrg(app);
  userToken = u.token;
  userId    = u.id;
  orgId     = u.orgId;
  createdUserIds.push(u.id);
  createdOrgIds.push(u.orgId);
});

afterAll(async () => {
  await cleanupOrgs(createdOrgIds);
  await cleanupUsers(createdUserIds);
});

// ── GET /api/v1/me ────────────────────────────────────────────────────────────

describe('GET /api/v1/me', () => {
  it('returns user profile with correct fields', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/me',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(userId);
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('isSuperAdmin');
    // passwordHash must NOT be exposed
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with expired token', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/me',
      headers: { authorization: `Bearer ${makeExpiredToken(app)}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/v1/me/notifications ──────────────────────────────────────────────

describe('GET /api/v1/me/notifications', () => {
  it('returns empty list for a user with no notifications', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/me/notifications?orgId=${orgId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toBeInstanceOf(Array);
    expect(body.total).toBe(0);
    expect(body).toHaveProperty('unreadCount');
  });

  it('returns 400 when orgId is missing', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/me/notifications',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for an org the user is not in', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/me/notifications?orgId=00000000-0000-0000-0000-000000000000`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns seeded notifications with correct fields', async () => {
    // Seed a notification directly into the DB
    await prisma.notification.create({
      data: {
        orgId,
        userId,
        type:  'payroll_submitted',
        title: 'Payroll Submitted',
        body:  'May payroll is awaiting approval',
      },
    });

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/me/notifications?orgId=${orgId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.unreadCount).toBeGreaterThanOrEqual(1);
    expect(body.notifications[0]).toHaveProperty('title');
    expect(body.notifications[0].read).toBe(false);
  });
});

// ── PATCH /api/v1/me/notifications/:id/read ───────────────────────────────────

describe('PATCH /api/v1/me/notifications/:id/read', () => {
  let notifId: string;

  beforeAll(async () => {
    const n = await prisma.notification.create({
      data: { orgId, userId, type: 'payroll_approved', title: 'Payroll Approved' },
    });
    notifId = n.id;
  });

  it('marks a notification as read → 200', async () => {
    const res = await app.inject({
      method:  'PATCH',
      url:     `/api/v1/me/notifications/${notifId}/read`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toMatch(/marked as read|already read/i);

    // Verify in DB
    const n = await prisma.notification.findUnique({ where: { id: notifId } });
    expect(n?.read).toBe(true);
  });

  it('returns idempotent response for already-read notification', async () => {
    // Already marked read in the previous test
    const res = await app.inject({
      method:  'PATCH',
      url:     `/api/v1/me/notifications/${notifId}/read`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toMatch(/already read/i);
  });

  it('returns 404 for another user\'s notification', async () => {
    const other = await seedStandaloneUser(app);
    createdUserIds.push(other.id);

    // Create a notification belonging to the OTHER user
    const n = await prisma.notification.create({
      data: { orgId, userId: other.id, type: 'payroll_rejected', title: 'Rejected' },
    });

    // Our user tries to mark it read — should be 404
    const res = await app.inject({
      method:  'PATCH',
      url:     `/api/v1/me/notifications/${n.id}/read`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── POST /api/v1/me/notifications/read-all ────────────────────────────────────

describe('POST /api/v1/me/notifications/read-all', () => {
  beforeAll(async () => {
    // Seed 3 unread notifications
    await prisma.notification.createMany({
      data: [
        { orgId, userId, type: 'payroll_submitted', title: 'Run 1' },
        { orgId, userId, type: 'payroll_submitted', title: 'Run 2' },
        { orgId, userId, type: 'payroll_submitted', title: 'Run 3' },
      ],
    });
  });

  it('marks all unread notifications in the org as read → 200', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/me/notifications/read-all',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { orgId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBeGreaterThanOrEqual(3);

    // Verify no unread left
    const unread = await prisma.notification.count({
      where: { userId, orgId, read: false },
    });
    expect(unread).toBe(0);
  });

  it('returns 403 for an org the user is not in', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/me/notifications/read-all',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { orgId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for missing orgId in body', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/me/notifications/read-all',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
