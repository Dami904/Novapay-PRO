import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../workers/queue', () => ({
  emailQueue:     { add: vi.fn().mockResolvedValue({ id: 'mock-email-job' }) },
  txWatcherQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-tx-job' }) },
  scheduleQueue:  { add: vi.fn().mockResolvedValue({ id: 'mock-sched-job' }) },
}));

import { buildTestApp }              from './helpers/app';
import { seedUserWithOrg, seedStandaloneUser, addMemberToOrg } from './helpers/auth';
import { cleanupUsers, cleanupOrgs } from './helpers/db';
import { buildMultipartBody, makeEmployeeCsv, WALLETS } from './helpers/multipart';

let app: FastifyInstance;

const createdUserIds: string[] = [];
const createdOrgIds:  string[] = [];

// Shared owner seeded once for the whole suite
let ownerToken: string;
let orgId: string;

beforeAll(async () => {
  app = await buildTestApp();
  const owner = await seedUserWithOrg(app);
  ownerToken  = owner.token;
  orgId       = owner.orgId;
  createdUserIds.push(owner.id);
  createdOrgIds.push(owner.orgId);
});

afterAll(async () => {
  await cleanupOrgs(createdOrgIds);
  await cleanupUsers(createdUserIds);
});

const base = () => `/api/v1/orgs/${orgId}/employees`;

// ── GET /employees ────────────────────────────────────────────────────────────

describe('GET /employees', () => {
  it('returns empty list for a fresh org', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     base(),
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.employees).toBeInstanceOf(Array);
    expect(body.total).toBe(0);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: base() });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for a user not in the org', async () => {
    const stranger = await seedStandaloneUser(app);
    createdUserIds.push(stranger.id);
    const res = await app.inject({
      method:  'GET',
      url:     base(),
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── POST /employees ───────────────────────────────────────────────────────────

describe('POST /employees', () => {
  it('owner creates an employee → 201', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     base(),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        fullName:      'Alice Test',
        walletAddress: WALLETS[0],
        email:         'alice@test.com',
        department:    'Engineering',
      },
    });
    expect(res.statusCode).toBe(201);
    const emp = res.json();
    expect(emp.fullName).toBe('Alice Test');
    expect(emp.walletAddress).toBe(WALLETS[0]);
    expect(emp).toHaveProperty('id');
  });

  it('rejects duplicate wallet address in same org → 409', async () => {
    // WALLETS[0] was already created above
    const res = await app.inject({
      method:  'POST',
      url:     base(),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { fullName: 'Dup Alice', walletAddress: WALLETS[0] },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects invalid wallet address → 400', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     base(),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { fullName: 'Bad Wallet', walletAddress: 'not-a-wallet' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('viewer role is blocked → 403', async () => {
    const viewer = await seedStandaloneUser(app);
    createdUserIds.push(viewer.id);
    const viewerToken = await addMemberToOrg(app, viewer.id, viewer.email, orgId, 'viewer');
    const res = await app.inject({
      method:  'POST',
      url:     base(),
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { fullName: 'Viewer Employee', walletAddress: WALLETS[1] },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── GET /employees/:id ────────────────────────────────────────────────────────

describe('GET /employees/:id', () => {
  let employeeId: string;

  beforeAll(async () => {
    // Create a fresh employee to read
    const res = await app.inject({
      method:  'POST', url: base(),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { fullName: 'Bob Read', walletAddress: WALLETS[2] },
    });
    employeeId = res.json().id;
  });

  it('returns employee data for org member', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `${base()}/${employeeId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(employeeId);
  });

  it('returns 404 for unknown employee ID', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `${base()}/00000000-0000-0000-0000-000000000000`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('cross-org isolation — org A owner cannot read org B employee', async () => {
    // Create a second org with its own employee
    const orgB   = await seedUserWithOrg(app);
    createdUserIds.push(orgB.id);
    createdOrgIds.push(orgB.orgId);

    const emp = await app.inject({
      method:  'POST',
      url:     `/api/v1/orgs/${orgB.orgId}/employees`,
      headers: { authorization: `Bearer ${orgB.token}` },
      payload: { fullName: 'OrgB Employee', walletAddress: WALLETS[3] },
    });
    const orgBEmpId = emp.json().id;

    // Org A owner tries to read org B employee via org A URL → 404
    const res = await app.inject({
      method:  'GET',
      url:     `${base()}/${orgBEmpId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── PATCH /employees/:id ──────────────────────────────────────────────────────

describe('PATCH /employees/:id', () => {
  let employeeId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method:  'POST', url: base(),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { fullName: 'Carol Patch', walletAddress: WALLETS[4] },
    });
    employeeId = res.json().id;
  });

  it('updates fullName and department → 200', async () => {
    const res = await app.inject({
      method:  'PATCH',
      url:     `${base()}/${employeeId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { fullName: 'Carol Updated', department: 'Finance' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().fullName).toBe('Carol Updated');
    expect(res.json().department).toBe('Finance');
  });

  it('rejects wallet change to an address already taken → 409', async () => {
    // WALLETS[0] belongs to Alice Test (created earlier in this suite)
    const res = await app.inject({
      method:  'PATCH',
      url:     `${base()}/${employeeId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { walletAddress: WALLETS[0] },
    });
    expect(res.statusCode).toBe(409);
  });

  it('viewer is blocked → 403', async () => {
    const viewer = await seedStandaloneUser(app);
    createdUserIds.push(viewer.id);
    const viewerToken = await addMemberToOrg(app, viewer.id, viewer.email, orgId, 'viewer');
    const res = await app.inject({
      method:  'PATCH',
      url:     `${base()}/${employeeId}`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { fullName: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── DELETE /employees/:id ─────────────────────────────────────────────────────

describe('DELETE /employees/:id', () => {
  it('deletes employee → 204, then 404 on re-read', async () => {
    const create = await app.inject({
      method:  'POST', url: base(),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { fullName: 'Delete Me', walletAddress: WALLETS[5] },
    });
    const id = create.json().id;

    const del = await app.inject({
      method:  'DELETE',
      url:     `${base()}/${id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(del.statusCode).toBe(204);

    const read = await app.inject({
      method:  'GET',
      url:     `${base()}/${id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(read.statusCode).toBe(404);
  });
});

// ── POST /employees/import ────────────────────────────────────────────────────

describe('POST /employees/import', () => {
  it('imports 2 new employees → { created: 2, updated: 0 }', async () => {
    const csv = makeEmployeeCsv([
      { wallet: WALLETS[6], name: 'Import Alice' },
      { wallet: WALLETS[7], name: 'Import Bob' },
    ]);
    const { payload, headers } = buildMultipartBody(
      [],
      [{ fieldName: 'file', filename: 'employees.csv', content: csv }],
    );

    const res = await app.inject({
      method:  'POST',
      url:     `${base()}/import`,
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBe(2);
    expect(res.json().updated).toBe(0);
  });

  it('re-import with one existing wallet → { created: 0, updated: 1 }', async () => {
    // WALLETS[6] is already imported above
    const csv = makeEmployeeCsv([{ wallet: WALLETS[6], name: 'Alice Renamed' }]);
    const { payload, headers } = buildMultipartBody(
      [],
      [{ fieldName: 'file', filename: 'employees.csv', content: csv }],
    );

    const res = await app.inject({
      method:  'POST',
      url:     `${base()}/import`,
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBe(0);
    expect(res.json().updated).toBe(1);
  });

  it('rejects CSV with invalid wallet address → 422', async () => {
    const csv     = 'wallet_address,full_name\nnot-a-wallet,Bad Employee';
    const { payload, headers } = buildMultipartBody(
      [],
      [{ fieldName: 'file', filename: 'employees.csv', content: csv }],
    );

    const res = await app.inject({
      method:  'POST',
      url:     `${base()}/import`,
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(422);
  });

  it('rejects empty file → 400', async () => {
    const { payload, headers } = buildMultipartBody(
      [],
      [{ fieldName: 'file', filename: 'empty.csv', content: '' }],
    );

    const res = await app.inject({
      method:  'POST',
      url:     `${base()}/import`,
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects CSV missing required columns → 400', async () => {
    const csv     = 'department,notes\nEngineering,foo\nSales,bar';
    const { payload, headers } = buildMultipartBody(
      [],
      [{ fieldName: 'file', filename: 'bad.csv', content: csv }],
    );

    const res = await app.inject({
      method:  'POST',
      url:     `${base()}/import`,
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('viewer role is blocked → 403', async () => {
    const viewer = await seedStandaloneUser(app);
    createdUserIds.push(viewer.id);
    const viewerToken = await addMemberToOrg(app, viewer.id, viewer.email, orgId, 'viewer');
    const csv = makeEmployeeCsv([{ wallet: WALLETS[0], name: 'Viewer Import' }]);
    const { payload, headers } = buildMultipartBody(
      [],
      [{ fieldName: 'file', filename: 'employees.csv', content: csv }],
    );

    const res = await app.inject({
      method:  'POST',
      url:     `${base()}/import`,
      headers: { authorization: `Bearer ${viewerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(403);
  });
});
