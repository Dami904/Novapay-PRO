/**
 * Role guard integration tests.
 *
 * Verifies that every role-protected endpoint enforces the correct permissions.
 * One shared org, five members — each with their own signed token.
 *
 * Roles tested:
 *   owner   → ALL permissions
 *   admin   → almost all (blocked from CAN_DELETE_ORG only)
 *   finance → approve, reject, create/submit (blocked from execute, manage-employees)
 *   hr      → manage-employees, create/submit (blocked from approve, reject, execute)
 *   viewer  → read-only (blocked from all write actions)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../workers/queue', () => ({
  emailQueue:     { add: vi.fn().mockResolvedValue({ id: 'mock-email-job' }) },
  txWatcherQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-tx-job' }) },
  scheduleQueue:  { add: vi.fn().mockResolvedValue({ id: 'mock-sched-job' }) },
}));

import { buildTestApp }             from './helpers/app';
import { seedUserWithOrg, seedStandaloneUser, addMemberToOrg } from './helpers/auth';
import { cleanupUsers, cleanupOrgs } from './helpers/db';
import { buildMultipartBody, makePayrollCsv, WALLETS } from './helpers/multipart';

let app: FastifyInstance;

const createdUserIds: string[] = [];
const createdOrgIds:  string[] = [];

let orgId:        string;
let ownerToken:   string;
let adminToken:   string;
let financeToken: string;
let hrToken:      string;
let viewerToken:  string;

// IDs for members we'll use in member-management tests
let adminUserId:  string;
let viewerUserId: string;
let hrUserId:     string;
let financeUserId: string;

const MOCK_TX = '0x' + 'f'.repeat(64);

// ── Create a fresh draft run ──────────────────────────────────────────────────
async function freshDraft(token: string) {
  const csv = makePayrollCsv([
    { wallet: WALLETS[1], name: 'Worker', amount: 1000 },
  ]);
  const { payload, headers } = buildMultipartBody(
    [{ name: 'label', value: `Role Test ${Date.now()}` }, { name: 'token', value: 'USDC' }],
    [{ fieldName: 'file', filename: 'payroll.csv', content: csv }],
  );
  const res = await app.inject({
    method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs`,
    headers: { authorization: `Bearer ${token}`, ...headers },
    payload,
  });
  return res.json().id as string;
}

// ── Setup: one org, five members ─────────────────────────────────────────────

beforeAll(async () => {
  app = await buildTestApp();

  const owner = await seedUserWithOrg(app);
  ownerToken  = owner.token;
  orgId       = owner.orgId;
  createdUserIds.push(owner.id);
  createdOrgIds.push(owner.orgId);

  // Seed 4 more users and add them to the org
  const admin   = await seedStandaloneUser(app);
  const finance = await seedStandaloneUser(app);
  const hr      = await seedStandaloneUser(app);
  const viewer  = await seedStandaloneUser(app);

  createdUserIds.push(admin.id, finance.id, hr.id, viewer.id);
  adminUserId   = admin.id;
  financeUserId = finance.id;
  hrUserId      = hr.id;
  viewerUserId  = viewer.id;

  adminToken   = await addMemberToOrg(app, admin.id,   admin.email,   orgId, 'admin');
  financeToken = await addMemberToOrg(app, finance.id, finance.email, orgId, 'finance');
  hrToken      = await addMemberToOrg(app, hr.id,      hr.email,      orgId, 'hr');
  viewerToken  = await addMemberToOrg(app, viewer.id,  viewer.email,  orgId, 'viewer');
});

afterAll(async () => {
  await cleanupOrgs(createdOrgIds);
  await cleanupUsers(createdUserIds);
});

// ── CAN_CREATE_DRAFT (owner, admin, finance, hr — NOT viewer) ─────────────────

describe('CAN_CREATE_DRAFT', () => {
  it('hr can create a draft → 201', async () => {
    const csv = makePayrollCsv([{ wallet: WALLETS[1], name: 'W', amount: 100 }]);
    const { payload, headers } = buildMultipartBody(
      [{ name: 'label', value: `HR Draft ${Date.now()}` }, { name: 'token', value: 'USDC' }],
      [{ fieldName: 'file', filename: 'p.csv', content: csv }],
    );
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs`,
      headers: { authorization: `Bearer ${hrToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(201);
  });

  it('viewer cannot create a draft → 403', async () => {
    const csv = makePayrollCsv([{ wallet: WALLETS[1], name: 'W', amount: 100 }]);
    const { payload, headers } = buildMultipartBody(
      [{ name: 'label', value: 'Viewer Draft' }, { name: 'token', value: 'USDC' }],
      [{ fieldName: 'file', filename: 'p.csv', content: csv }],
    );
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs`,
      headers: { authorization: `Bearer ${viewerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── CAN_SUBMIT ────────────────────────────────────────────────────────────────

describe('CAN_SUBMIT', () => {
  it('hr can submit a draft → 200', async () => {
    const runId = await freshDraft(hrToken);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`,
      headers: { authorization: `Bearer ${hrToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('pending_approval');
  });

  it('viewer cannot submit → 403', async () => {
    const runId = await freshDraft(ownerToken);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── CAN_APPROVE ───────────────────────────────────────────────────────────────

describe('CAN_APPROVE', () => {
  it('finance can approve a pending run → 200', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/approve`,
      headers: { authorization: `Bearer ${financeToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('approved');
  });

  it('hr cannot approve → 403', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/approve`,
      headers: { authorization: `Bearer ${hrToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('viewer cannot approve → 403', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/approve`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── CAN_REJECT ────────────────────────────────────────────────────────────────

describe('CAN_REJECT', () => {
  it('finance can reject a pending run → 200', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/reject`,
      headers: { authorization: `Bearer ${financeToken}` },
      payload: { note: 'Wrong amounts' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('rejected');
  });

  it('hr cannot reject → 403', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/reject`,
      headers: { authorization: `Bearer ${hrToken}` },
      payload: { note: 'No' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── CAN_EXECUTE ───────────────────────────────────────────────────────────────

describe('CAN_EXECUTE', () => {
  it('owner can execute an approved run → 200', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({ method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`, headers: { authorization: `Bearer ${ownerToken}` } });
    await app.inject({ method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/approve`, headers: { authorization: `Bearer ${ownerToken}` } });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/execute`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { txHash: '0x' + 'e'.repeat(64) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('executing');
  });

  it('admin can execute an approved run → 200', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({ method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`, headers: { authorization: `Bearer ${ownerToken}` } });
    await app.inject({ method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/approve`, headers: { authorization: `Bearer ${ownerToken}` } });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/execute`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { txHash: '0x' + '4'.repeat(64) },
    });
    expect(res.statusCode).toBe(200);
  });

  it('finance cannot execute → 403', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({ method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`, headers: { authorization: `Bearer ${ownerToken}` } });
    await app.inject({ method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/approve`, headers: { authorization: `Bearer ${ownerToken}` } });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/execute`,
      headers: { authorization: `Bearer ${financeToken}` },
      payload: { txHash: MOCK_TX },
    });
    expect(res.statusCode).toBe(403);
  });

  it('hr cannot execute → 403', async () => {
    const runId = await freshDraft(ownerToken);
    await app.inject({ method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/submit`, headers: { authorization: `Bearer ${ownerToken}` } });
    await app.inject({ method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/approve`, headers: { authorization: `Bearer ${ownerToken}` } });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/payroll-runs/${runId}/execute`,
      headers: { authorization: `Bearer ${hrToken}` },
      payload: { txHash: MOCK_TX },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── CAN_MANAGE_EMPLOYEES ──────────────────────────────────────────────────────

describe('CAN_MANAGE_EMPLOYEES', () => {
  it('hr can add an employee → 201', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/employees`,
      headers: { authorization: `Bearer ${hrToken}` },
      payload: { fullName: 'HR Added', walletAddress: WALLETS[3] },
    });
    expect(res.statusCode).toBe(201);
  });

  it('finance cannot add an employee → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/employees`,
      headers: { authorization: `Bearer ${financeToken}` },
      payload: { fullName: 'Finance Added', walletAddress: WALLETS[4] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('viewer cannot add an employee → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/employees`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { fullName: 'Viewer Added', walletAddress: WALLETS[5] },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── CAN_VIEW_AUDIT_LOG ────────────────────────────────────────────────────────

describe('CAN_VIEW_AUDIT_LOG', () => {
  it('owner can GET /audit-logs → 200', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/audit-logs`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('admin can GET /audit-logs → 200', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/audit-logs`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('finance cannot GET /audit-logs → 403', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/audit-logs`,
      headers: { authorization: `Bearer ${financeToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('hr cannot GET /audit-logs → 403', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/audit-logs`,
      headers: { authorization: `Bearer ${hrToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── CAN_MANAGE_MEMBERS ────────────────────────────────────────────────────────

describe('CAN_MANAGE_MEMBERS', () => {
  it('admin can send an invitation → 201', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/invitations`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: `invite-${Date.now()}@test.com`, role: 'viewer' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('finance cannot send an invitation → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/invitations`,
      headers: { authorization: `Bearer ${financeToken}` },
      payload: { email: `finance-invite-${Date.now()}@test.com`, role: 'viewer' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin can change a viewer role to hr → 200', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${viewerUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'hr' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('hr');
    // Restore to viewer for other tests
    await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${viewerUserId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { role: 'viewer' },
    });
  });

  it('cannot change the owner role → 403', async () => {
    // Get owner's userId from the org members list
    const members = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const ownerMember = members.json().find((m: any) => m.role === 'owner');

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${ownerMember.userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── CAN_DELETE_ORG (owner removes a member — uses DELETE /members/:userId) ───

describe('CAN_DELETE_ORG — remove members', () => {
  it('admin cannot remove a member → 403', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${orgId}/members/${hrUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('owner can remove a member → 204', async () => {
    // Add a temporary member to remove
    const tmp = await seedStandaloneUser(app);
    createdUserIds.push(tmp.id);
    await addMemberToOrg(app, tmp.id, tmp.email, orgId, 'viewer');

    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${orgId}/members/${tmp.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('owner cannot remove themselves → 400', async () => {
    const members = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const ownerMember = members.json().find((m: any) => m.role === 'owner');

    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${orgId}/members/${ownerMember.userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    // Owner removing themselves → 400 (You cannot remove yourself)
    expect(res.statusCode).toBe(400);
  });
});
