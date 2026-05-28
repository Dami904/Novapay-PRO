import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../workers/queue', () => ({
  emailQueue:     { add: vi.fn().mockResolvedValue({ id: 'mock-email-job' }) },
  txWatcherQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-tx-job' }) },
  scheduleQueue:  { add: vi.fn().mockResolvedValue({ id: 'mock-sched-job' }) },
}));

import { buildTestApp }              from './helpers/app';
import { seedUserWithOrg }           from './helpers/auth';
import { cleanupUsers, cleanupOrgs } from './helpers/db';
import {
  buildMultipartBody,
  makePayrollCsv,
  WALLETS,
  yesterday,
  tomorrow,
} from './helpers/multipart';
import prisma from '../db/client';

let app:        FastifyInstance;
let ownerToken: string;
let orgId:      string;
let ownerId:    string;

const createdUserIds: string[] = [];
const createdOrgIds:  string[] = [];

// Valid tx hash used for execute tests
const MOCK_TX = '0x' + 'a'.repeat(64);

function payrollBase() { return `/api/v1/orgs/${orgId}/payroll-runs`; }

beforeAll(async () => {
  app = await buildTestApp();
  const owner = await seedUserWithOrg(app);
  ownerToken  = owner.token;
  orgId       = owner.orgId;
  ownerId     = owner.id;
  createdUserIds.push(owner.id);
  createdOrgIds.push(owner.orgId);

  // Link a wallet to the org so tx-data endpoint can build calldata
  await prisma.organization.update({
    where: { id: orgId },
    data:  { walletAddress: WALLETS[0] },
  });
});

afterAll(async () => {
  await cleanupOrgs(createdOrgIds);
  await cleanupUsers(createdUserIds);
});

// ── Helper: create a draft run via multipart ──────────────────────────────────

async function createDraftRun(
  label = 'May 2026 Payroll',
  rows  = [
    { wallet: WALLETS[1], name: 'Alice',   amount: 3000 },
    { wallet: WALLETS[2], name: 'Bob',     amount: 2500 },
  ],
) {
  const csv = makePayrollCsv(rows);
  const { payload, headers } = buildMultipartBody(
    [{ name: 'label', value: label }, { name: 'token', value: 'USDC' }],
    [{ fieldName: 'file', filename: 'payroll.csv', content: csv }],
  );
  return app.inject({
    method:  'POST',
    url:     payrollBase(),
    headers: { authorization: `Bearer ${ownerToken}`, ...headers },
    payload,
  });
}

// ── POST /payroll-runs — create draft ─────────────────────────────────────────

describe('POST /payroll-runs — create draft', () => {
  it('creates a draft from a valid CSV upload → 201', async () => {
    const res = await createDraftRun();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('draft');
    expect(body.recipientCount).toBe(2);
    expect(body).toHaveProperty('id');
  });

  it('excludes rows with past termination date (contract expired)', async () => {
    const csv = makePayrollCsv([
      { wallet: WALLETS[1], name: 'Alice',   amount: 3000, terminationDate: tomorrow() },
      { wallet: WALLETS[2], name: 'Expired', amount: 1000, terminationDate: yesterday() },
    ]);
    const { payload, headers } = buildMultipartBody(
      [{ name: 'label', value: 'Expiry Test' }, { name: 'token', value: 'USDC' }],
      [{ fieldName: 'file', filename: 'payroll.csv', content: csv }],
    );
    const res = await app.inject({
      method:  'POST', url: payrollBase(),
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.recipientCount).toBe(1);
    expect(body.excluded).toHaveLength(1);
    expect(body.excluded[0].wallet).toBe(WALLETS[2]);
  });

  it('returns 422 when ALL rows are expired', async () => {
    const csv = makePayrollCsv([
      { wallet: WALLETS[1], name: 'Expired1', amount: 1000, terminationDate: yesterday() },
      { wallet: WALLETS[2], name: 'Expired2', amount: 2000, terminationDate: yesterday() },
    ]);
    const { payload, headers } = buildMultipartBody(
      [{ name: 'label', value: 'All Expired' }, { name: 'token', value: 'USDC' }],
      [{ fieldName: 'file', filename: 'payroll.csv', content: csv }],
    );
    const res = await app.inject({
      method:  'POST', url: payrollBase(),
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/termination/i);
  });

  it('returns 422 for CSV with invalid wallet address', async () => {
    const csv = 'wallet_address,name,amount\nnot-a-wallet,Bad,100';
    const { payload, headers } = buildMultipartBody(
      [{ name: 'label', value: 'Bad CSV' }, { name: 'token', value: 'USDC' }],
      [{ fieldName: 'file', filename: 'payroll.csv', content: csv }],
    );
    const res = await app.inject({
      method:  'POST', url: payrollBase(),
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 400 when label is missing', async () => {
    const csv = makePayrollCsv([{ wallet: WALLETS[1], name: 'Alice', amount: 100 }]);
    const { payload, headers } = buildMultipartBody(
      [{ name: 'token', value: 'USDC' }],   // no label
      [{ fieldName: 'file', filename: 'payroll.csv', content: csv }],
    );
    const res = await app.inject({
      method:  'POST', url: payrollBase(),
      headers: { authorization: `Bearer ${ownerToken}`, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /payroll-runs ─────────────────────────────────────────────────────────

describe('GET /payroll-runs', () => {
  it('returns list including the created draft', async () => {
    const res = await app.inject({
      method:  'GET', url: payrollBase(),
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('runs');
    expect(body.runs.length).toBeGreaterThan(0);
    expect(body.runs.some((r: any) => r.status === 'draft')).toBe(true);
  });

  it('filters by status query param', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `${payrollBase()}?status=draft`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs.every((r: any) => r.status === 'draft')).toBe(true);
  });
});

// ── GET /payroll-runs/:id ─────────────────────────────────────────────────────

describe('GET /payroll-runs/:id', () => {
  let runId: string;

  beforeAll(async () => {
    const res = await createDraftRun('Detail Test Run');
    runId = res.json().id;
  });

  it('returns run with recipients array', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `${payrollBase()}/${runId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(runId);
    expect(body.recipients).toBeInstanceOf(Array);
    expect(body.recipients.length).toBe(2);
    expect(body.recipients[0]).toHaveProperty('walletAddress');
    expect(body.recipients[0]).toHaveProperty('amount');
  });

  it('returns 404 for unknown run ID', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `${payrollBase()}/00000000-0000-0000-0000-000000000000`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /payroll-runs/:id ──────────────────────────────────────────────────

describe('DELETE /payroll-runs/:id', () => {
  it('deletes a draft run → 204', async () => {
    const create = await createDraftRun('To Delete');
    const runId  = create.json().id;

    const del = await app.inject({
      method:  'DELETE',
      url:     `${payrollBase()}/${runId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(del.statusCode).toBe(204);
  });

  it('cannot delete a non-draft run → 409', async () => {
    // Create and submit a run to move it out of draft
    const create = await createDraftRun('Non-Draft Delete Test');
    const runId  = create.json().id;

    await app.inject({
      method: 'POST', url: `${payrollBase()}/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    const del = await app.inject({
      method:  'DELETE',
      url:     `${payrollBase()}/${runId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error).toMatch(/only draft/i);
  });
});

// ── Full lifecycle: draft → submit → approve → execute ───────────────────────

describe('Payroll run lifecycle', () => {
  let runId: string;

  beforeAll(async () => {
    const res = await createDraftRun('Lifecycle Run');
    runId = res.json().id;
  });

  it('POST /:id/submit → pending_approval', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `${payrollBase()}/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('pending_approval');
  });

  it('double-submit returns 409', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `${payrollBase()}/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /:id/approve → approved', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `${payrollBase()}/${runId}/approve`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('approved');
    expect(res.json().reviewedBy).toBeTruthy();
  });

  it('POST /:id/execute → executing (txWatcherQueue called)', async () => {
    const { txWatcherQueue } = await import('../workers/queue');
    const addSpy = vi.mocked(txWatcherQueue.add);
    addSpy.mockClear();

    const res = await app.inject({
      method:  'POST',
      url:     `${payrollBase()}/${runId}/execute`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { txHash: MOCK_TX },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('executing');
    expect(res.json().txHash).toBe(MOCK_TX);
    expect(addSpy).toHaveBeenCalledOnce();
  });
});

// ── Reject flow ───────────────────────────────────────────────────────────────

describe('Reject flow', () => {
  it('pending_approval → rejected with note', async () => {
    const create = await createDraftRun('Reject Test');
    const runId  = create.json().id;

    await app.inject({
      method: 'POST', url: `${payrollBase()}/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    const res = await app.inject({
      method:  'POST',
      url:     `${payrollBase()}/${runId}/reject`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { note: 'Amounts look wrong' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('rejected');
    expect(res.json().reviewNote).toBe('Amounts look wrong');
  });

  it('reject requires a note — 400 without it', async () => {
    const create = await createDraftRun('Reject No Note');
    const runId  = create.json().id;
    await app.inject({
      method: 'POST', url: `${payrollBase()}/${runId}/submit`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const res = await app.inject({
      method:  'POST', url: `${payrollBase()}/${runId}/reject`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Export ────────────────────────────────────────────────────────────────────

describe('GET /:id/export', () => {
  let runId: string;

  beforeAll(async () => {
    const res = await createDraftRun('Export Test');
    runId = res.json().id;
  });

  it('returns CSV with correct content-type', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `${payrollBase()}/${runId}/export`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('returns 404 for unknown run', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `${payrollBase()}/00000000-0000-0000-0000-000000000000/export`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Proof endpoint ────────────────────────────────────────────────────────────

describe('GET /api/v1/proof/:txHash', () => {
  it('returns 404 for unknown txHash', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/proof/0x${'b'.repeat(64)}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns proof data for a run manually set to status=complete', async () => {
    // Seed a run and force it to complete status with a txHash
    const create = await createDraftRun('Proof Test');
    const runId  = create.json().id;
    const txHash = '0x' + 'c'.repeat(64);

    await prisma.payrollRun.update({
      where: { id: runId },
      data:  {
        status:     'complete',
        txHash,
        explorerUrl: `https://explorer.morphl2.io/tx/${txHash}`,
        executedAt:  new Date(),
      },
    });

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/proof/${txHash}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.verified).toBe(true);
    expect(body.txHash).toBe(txHash);
    expect(body.org.name).toBeTruthy();
  });

  it('returns 404 for a run in executing status (not yet confirmed)', async () => {
    const txHash = '0x' + 'd'.repeat(64);
    await prisma.payrollRun.create({
      data: {
        orgId,
        label:  'Proof Executing',
        token:  'USDC',
        status: 'executing',
        txHash,
      },
    });
    const res = await app.inject({ method: 'GET', url: `/api/v1/proof/${txHash}` });
    expect(res.statusCode).toBe(404);
  });
});
