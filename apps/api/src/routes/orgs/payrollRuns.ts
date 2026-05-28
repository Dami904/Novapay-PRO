import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/client';
import { authenticate } from '../../middleware/authenticate';
import { requireOrgMember } from '../../middleware/requireOrgMember';
import { requireRole } from '../../middleware/requireRole';
import { parsePayrollBuffer } from '../../utils/csvParser';
import {
  createDraft,
  submitRun,
  approveRun,
  rejectRun,
  buildTxData,
  recordExecution,
} from '../../services/payrollService';
import { writeAudit } from '../../services/auditService';
import {
  CAN_CREATE_DRAFT,
  CAN_SUBMIT,
  CAN_APPROVE,
  CAN_REJECT,
  CAN_EXECUTE,
  PAYROLL_STATUS,
} from '../../config/constants';

export default async function payrollRunRoutes(app: FastifyInstance) {

  const preHandler = [authenticate, requireOrgMember];

  // ── GET /payroll-runs — list all runs ───────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const query = z.object({
      status:   z.string().optional(),
      page:     z.coerce.number().default(1),
      pageSize: z.coerce.number().default(20),
    }).parse(request.query);

    const where: Record<string, unknown> = { orgId: request.currentOrgId };
    if (query.status) where.status = query.status;

    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where,
        orderBy:  { createdAt: 'desc' },
        skip:     (query.page - 1) * query.pageSize,
        take:     query.pageSize,
        select: {
          id: true, label: true, token: true, status: true,
          recipientCount: true, totalAmount: true, txHash: true,
          explorerUrl: true, createdAt: true, submittedAt: true,
          reviewedAt: true, executedAt: true, reviewNote: true,
          submitter: { select: { id: true, fullName: true, email: true } },
          reviewer:  { select: { id: true, fullName: true, email: true } },
          executor:  { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.payrollRun.count({ where }),
    ]);

    return reply.send({ runs, total, page: query.page, pageSize: query.pageSize });
  });

  // ── POST /payroll-runs — create draft (multipart CSV upload) ────────────────
  app.post('/', {
    preHandler: [...preHandler, requireRole(CAN_CREATE_DRAFT)],
  }, async (request, reply) => {
    // Parse multipart form: fields + file
    const parts = request.parts();
    let label   = '';
    let token   = 'USDC';
    let fileBuffer: Buffer | null = null;
    let filename = '';

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        filename   = part.filename;
      } else {
        if (part.fieldname === 'label') label = (part as any).value as string;
        if (part.fieldname === 'token') token = (part as any).value as string;
      }
    }

    if (!label) return reply.code(400).send({ error: 'Payroll label is required' });
    if (!fileBuffer || !filename) return reply.code(400).send({ error: 'CSV or Excel file is required' });
    if (!['USDC', 'USDT'].includes(token)) return reply.code(400).send({ error: 'Token must be USDC or USDT' });

    // Parse and validate the file
    let parsed;
    try {
      parsed = parsePayrollBuffer(fileBuffer, filename);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message ?? 'Failed to parse file' });
    }

    // Cross-check wallet addresses against Employee Directory termination dates
    const wallets = parsed.recipients.map((r) => r.walletAddress).filter(Boolean);
    const dirEmployees = await prisma.employee.findMany({
      where: { orgId: request.currentOrgId, walletAddress: { in: wallets } },
      select: { walletAddress: true, terminationDate: true, isActive: true },
    });
    const dirMap = new Map(dirEmployees.map((e) => [e.walletAddress, e]));
    const today  = new Date(); today.setHours(0, 0, 0, 0);

    const recipients = parsed.recipients.map((r) => {
      if (r.isExpired || r.hasError) return r;
      const emp = dirMap.get(r.walletAddress);
      if (!emp) return r;
      if (emp.isActive === false) {
        return { ...r, isExpired: true, terminationDate: emp.terminationDate ?? null };
      }
      if (emp.terminationDate && emp.terminationDate < today) {
        return { ...r, isExpired: true, terminationDate: emp.terminationDate };
      }
      return r;
    });

    // Separate invalid rows (bad data) from expired rows (contract ended)
    const invalidRecipients = recipients.filter((r) => r.hasError);
    const expiredRecipients = recipients.filter((r) => r.isExpired && !r.hasError);
    const activeRecipients  = recipients.filter((r) => !r.hasError && !r.isExpired);

    if (invalidRecipients.length > 0) {
      return reply.code(422).send({
        error:      'Validation errors in CSV',
        recipients,
      });
    }

    if (activeRecipients.length === 0) {
      return reply.code(422).send({
        error:    'No payable recipients — all have exceeded their termination date',
        excluded: expiredRecipients.map((r) => ({
          name:            r.fullName,
          wallet:          r.walletAddress,
          terminationDate: r.terminationDate?.toISOString() ?? null,
        })),
      });
    }

    const run = await createDraft({
      orgId:       request.currentOrgId,
      label,
      token,
      createdBy:   request.user.sub,
      recipients:  activeRecipients,
      csvRaw:      /\.xlsx?$/i.test(filename) ? fileBuffer.toString('base64') : fileBuffer.toString('utf-8'),
      csvFilename: filename,
    });

    return reply.code(201).send({
      ...run,
      excluded: expiredRecipients.map((r) => ({
        name:            r.fullName,
        wallet:          r.walletAddress,
        terminationDate: r.terminationDate?.toISOString() ?? null,
      })),
    });
  });

  // ── GET /payroll-runs/:id — run detail + recipients ────────────────────────
  app.get('/:id', { preHandler }, async (request: any, reply) => {
    const { id } = request.params as { id: string };

    const run = await prisma.payrollRun.findFirst({
      where:   { id, orgId: request.currentOrgId },
      include: {
        recipients: { orderBy: { rowIndex: 'asc' } },
        submitter:  { select: { id: true, fullName: true, email: true } },
        reviewer:   { select: { id: true, fullName: true, email: true } },
        executor:   { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!run) return reply.code(404).send({ error: 'Payroll run not found' });
    return reply.send(run);
  });

  // ── DELETE /payroll-runs/:id — delete draft only ────────────────────────────
  app.delete('/:id', {
    preHandler: [...preHandler, requireRole(CAN_CREATE_DRAFT)],
  }, async (request: any, reply) => {
    const { id } = request.params as { id: string };

    const run = await prisma.payrollRun.findFirst({
      where: { id, orgId: request.currentOrgId },
    });

    if (!run) return reply.code(404).send({ error: 'Payroll run not found' });
    if (run.status !== PAYROLL_STATUS.DRAFT) {
      return reply.code(409).send({ error: 'Only draft runs can be deleted' });
    }

    await prisma.payrollRun.delete({ where: { id } });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'payroll_run.deleted',
      resourceType: 'payroll_run',
      resourceId:   id,
      ipAddress:    request.ip,
    });

    return reply.code(204).send();
  });

  // ── POST /payroll-runs/:id/submit — HR submits for approval ────────────────
  app.post('/:id/submit', {
    preHandler: [...preHandler, requireRole(CAN_SUBMIT)],
  }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const run = await submitRun(id, request.currentOrgId, request.user.sub);
      return reply.send(run);
    } catch (err: any) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // ── POST /payroll-runs/:id/approve — Finance/Admin approves ────────────────
  app.post('/:id/approve', {
    preHandler: [...preHandler, requireRole(CAN_APPROVE)],
  }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const run = await approveRun(id, request.currentOrgId, request.user.sub);
      return reply.send(run);
    } catch (err: any) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // ── POST /payroll-runs/:id/reject — Finance/Admin rejects ──────────────────
  app.post('/:id/reject', {
    preHandler: [...preHandler, requireRole(CAN_REJECT)],
  }, async (request: any, reply) => {
    const body = z.object({
      note: z.string().min(1, 'Please provide a reason for rejection'),
    }).safeParse(request.body);

    if (!body.success) return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });

    const { id } = request.params as { id: string };
    try {
      const run = await rejectRun(id, request.currentOrgId, request.user.sub, body.data.note);
      return reply.send(run);
    } catch (err: any) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // ── GET /payroll-runs/:id/tx-data — build unsigned tx for frontend ──────────
  app.get('/:id/tx-data', {
    preHandler: [...preHandler, requireRole(CAN_EXECUTE)],
  }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const txData = await buildTxData(id, request.currentOrgId);
      return reply.send(txData);
    } catch (err: any) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // ── POST /payroll-runs/:id/execute — record tx hash, start watcher ──────────
  app.post('/:id/execute', {
    preHandler: [...preHandler, requireRole(CAN_EXECUTE)],
  }, async (request: any, reply) => {
    const body = z.object({
      txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid tx hash format'),
    }).safeParse(request.body);

    if (!body.success) return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });

    const { id } = request.params as { id: string };
    try {
      const run = await recordExecution(id, request.currentOrgId, request.user.sub, body.data.txHash);
      return reply.send({
        ...run,
        message: 'Transaction submitted. Watching for confirmation...',
      });
    } catch (err: any) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // ── GET /payroll-runs/:id/export — download CSV ────────────────────────────
  app.get('/:id/export', { preHandler }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const fmt = (request.query as any).format ?? 'csv';

    const run = await prisma.payrollRun.findFirst({
      where:   { id, orgId: request.currentOrgId },
      include: { recipients: { orderBy: { rowIndex: 'asc' } } },
    });

    if (!run) return reply.code(404).send({ error: 'Payroll run not found' });

    // If original CSV is stored (Option B), return it directly
    if (fmt === 'original' && run.csvRaw) {
      const isXlsx = /\.xlsx?$/i.test(run.csvFilename ?? '');
      if (isXlsx) {
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="${run.csvFilename}"`);
        return reply.send(Buffer.from(run.csvRaw, 'base64'));
      }
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${run.csvFilename ?? 'payroll.csv'}"`);
      return reply.send(run.csvRaw);
    }

    // Otherwise generate a clean CSV from structured data (Option A)
    const rows = [
      ['Date', 'Payroll Label', 'Recipient Name', 'Wallet Address', `Amount (${run.token})`, 'Tx Hash', 'Status'],
      ...run.recipients.map((r) => [
        new Date(run.createdAt).toLocaleDateString(),
        run.label,
        r.fullName,
        r.walletAddress,
        r.amount.toString(),
        run.txHash ?? '',
        run.status,
      ]),
    ];

    const csv = rows.map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="${run.label.replace(/\s+/g, '-')}.csv"`);
    return reply.send(csv);
  });
}
