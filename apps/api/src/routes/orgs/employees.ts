import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ethers } from 'ethers';
import prisma from '../../db/client';
import { authenticate } from '../../middleware/authenticate';
import { requireOrgMember } from '../../middleware/requireOrgMember';
import { requireRole } from '../../middleware/requireRole';
import { writeAudit } from '../../services/auditService';
import { CAN_MANAGE_EMPLOYEES } from '../../config/constants';

export default async function employeeRoutes(app: FastifyInstance) {
  const readHandler   = [authenticate, requireOrgMember];
  const manageHandler = [...readHandler, requireRole(CAN_MANAGE_EMPLOYEES)];

  // ── GET /employees — list with search + filter + pagination ────────────────
  app.get('/', { preHandler: readHandler }, async (request, reply) => {
    const query = z.object({
      search:   z.string().optional(),
      isActive: z.enum(['true', 'false']).optional(),
      page:     z.coerce.number().default(1),
      pageSize: z.coerce.number().default(50),
    }).parse(request.query);

    const where: Record<string, unknown> = { orgId: request.currentOrgId };
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    if (query.search) {
      where.OR = [
        { fullName:      { contains: query.search, mode: 'insensitive' } },
        { email:         { contains: query.search, mode: 'insensitive' } },
        { walletAddress: { contains: query.search, mode: 'insensitive' } },
        { department:    { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip:    (query.page - 1) * query.pageSize,
        take:    query.pageSize,
      }),
      prisma.employee.count({ where }),
    ]);

    return reply.send({ employees, total, page: query.page, pageSize: query.pageSize });
  });

  // ── POST /employees — add single employee ──────────────────────────────────
  app.post('/', { preHandler: manageHandler }, async (request, reply) => {
    const body = z.object({
      fullName:       z.string().min(1, 'Name is required'),
      walletAddress:  z.string().refine(ethers.isAddress, 'Invalid wallet address'),
      email:           z.string().email().optional(),
      department:      z.string().optional(),
      employmentType:  z.enum(['employee', 'contractor']).default('employee'),
      terminationDate: z.string().optional().transform((v) => v ? new Date(v) : undefined),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const { walletAddress, ...rest } = body.data;

    const existing = await prisma.employee.findUnique({
      where: { orgId_walletAddress: { orgId: request.currentOrgId, walletAddress } },
    });
    if (existing) {
      return reply.code(409).send({ error: 'An employee with this wallet address already exists' });
    }

    const employee = await prisma.employee.create({
      data: { orgId: request.currentOrgId, walletAddress, ...rest },
    });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'employee.added',
      resourceType: 'employee',
      resourceId:   employee.id,
      metadata:     { fullName: employee.fullName, walletAddress },
      ipAddress:    request.ip,
    });

    return reply.code(201).send(employee);
  });

  // ── GET /employees/:employeeId ─────────────────────────────────────────────
  app.get('/:employeeId', { preHandler: readHandler }, async (request: any, reply) => {
    const { employeeId } = request.params as { employeeId: string };

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId: request.currentOrgId },
    });
    if (!employee) return reply.code(404).send({ error: 'Employee not found' });

    return reply.send(employee);
  });

  // ── PATCH /employees/:employeeId — update fields ───────────────────────────
  app.patch('/:employeeId', { preHandler: manageHandler }, async (request: any, reply) => {
    const body = z.object({
      fullName:       z.string().min(1).optional(),
      email:          z.string().email().nullable().optional(),
      walletAddress:  z.string().refine(ethers.isAddress, 'Invalid wallet address').optional(),
      department:     z.string().nullable().optional(),
      employmentType:  z.enum(['employee', 'contractor']).optional(),
      isActive:        z.boolean().optional(),
      terminationDate: z.string().nullable().optional().transform((v) => v ? new Date(v) : v === null ? null : undefined),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const { employeeId } = request.params as { employeeId: string };

    const existing = await prisma.employee.findFirst({
      where: { id: employeeId, orgId: request.currentOrgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Employee not found' });

    // If wallet is changing, ensure the new address isn't already taken in this org
    if (body.data.walletAddress && body.data.walletAddress !== existing.walletAddress) {
      const taken = await prisma.employee.findUnique({
        where: { orgId_walletAddress: { orgId: request.currentOrgId, walletAddress: body.data.walletAddress } },
      });
      if (taken) return reply.code(409).send({ error: 'An employee with this wallet address already exists' });
    }

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data:  body.data,
    });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'employee.updated',
      resourceType: 'employee',
      resourceId:   employeeId,
      metadata:     body.data as Record<string, unknown>,
      ipAddress:    request.ip,
    });

    return reply.send(updated);
  });

  // ── DELETE /employees/:employeeId ──────────────────────────────────────────
  app.delete('/:employeeId', { preHandler: manageHandler }, async (request: any, reply) => {
    const { employeeId } = request.params as { employeeId: string };

    const existing = await prisma.employee.findFirst({
      where: { id: employeeId, orgId: request.currentOrgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Employee not found' });

    await prisma.employee.delete({ where: { id: employeeId } });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'employee.removed',
      resourceType: 'employee',
      resourceId:   employeeId,
      metadata:     { fullName: existing.fullName, walletAddress: existing.walletAddress },
      ipAddress:    request.ip,
    });

    return reply.code(204).send();
  });

  // ── POST /employees/import — bulk CSV/XLSX upsert ──────────────────────────
  // Accepts columns: full_name/name, wallet_address/wallet, email?, department?, employment_type?
  // Wallet already in org → update name/email/department; new wallet → create
  app.post('/import', { preHandler: manageHandler }, async (request, reply) => {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let filename = '';

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        filename   = part.filename;
      }
    }

    if (!fileBuffer || !filename) {
      return reply.code(400).send({ error: 'A CSV or Excel file is required' });
    }

    const ext  = filename.split('.').pop()?.toLowerCase() ?? '';
    let rows: Record<string, string>[];

    if (ext === 'xlsx' || ext === 'xls') {
      // Parse Excel with SheetJS
      const workbook  = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheet     = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows   = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      // Normalise headers the same way PapaParse does
      const normalise = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');
      rows = rawRows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [normalise(String(k)), String(v ?? '')]),
        ),
      );
    } else {
      // Parse CSV with PapaParse
      const parsed = Papa.parse<Record<string, string>>(fileBuffer.toString('utf-8'), {
        header:          true,
        skipEmptyLines:  true,
        transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
      });

      if (parsed.errors.length > 0) {
        return reply.code(400).send({ error: 'Failed to parse CSV', details: parsed.errors });
      }
      rows = parsed.data;
    }

    if (rows.length === 0) return reply.code(400).send({ error: 'File contains no rows' });

    // Flexible column detection
    const nameKey   = [
      'full_name', 'name', 'employee_name', 'employee', 'staff_name', 'staff',
      'worker', 'member', 'member_name', 'display_name', 'preferred_name', 'beneficiary',
    ].find((k) => rows[0][k] !== undefined);
    const walletKey = [
      'wallet_address', 'wallet', 'address', 'eth_address', 'ethereum_address',
      'wallet_addr', 'addr', 'public_address', 'crypto_address', 'blockchain_address',
      'recipient_address', 'metamask_address', 'usdc_wallet', 'usdt_wallet',
      'usdc_address', 'usdt_address', 'usdc_wallet_address', 'usdt_wallet_address',
      'token_address',
    ].find((k) => rows[0][k] !== undefined);

    if (!nameKey || !walletKey) {
      return reply.code(400).send({
        error:    'Missing required columns',
        expected: 'name (full_name / name) and wallet (wallet_address / wallet / address)',
        found:    Object.keys(rows[0]),
      });
    }

    // Validate all rows first — reject the whole import if any row fails
    const validRows: {
      fullName: string; walletAddress: string;
      email?: string; department?: string; employmentType: string;
    }[] = [];
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row      = rows[i];
      const fullName = row[nameKey]?.trim();
      const wallet   = row[walletKey]?.trim();

      if (!fullName)                   { errors.push({ row: i + 2, error: 'Missing name' }); continue; }
      if (!wallet || !ethers.isAddress(wallet)) {
        errors.push({ row: i + 2, error: `Invalid wallet address: "${wallet}"` }); continue;
      }

      validRows.push({
        fullName,
        walletAddress:  wallet,
        email: (
          row['email'] || row['email_address'] || row['mail'] ||
          row['work_email'] || row['business_email'] || row['contact_email']
        )?.trim() || undefined,
        department: (
          row['department'] || row['dept'] || row['team'] || row['division'] ||
          row['unit'] || row['group'] || row['business_unit'] || row['cost_center'] ||
          row['cost_centre'] || row['function']
        )?.trim() || undefined,
        employmentType: (() => {
          const raw = (
            row['employment_type'] || row['employement_type'] || row['employment'] ||
            row['type'] || row['emp_type'] || row['worker_type'] || row['contract_type'] ||
            row['staff_type'] || row['work_type'] || row['category'] || row['emp_category']
          )?.trim().toLowerCase() ?? '';
          const contractorTerms = [
            'contractor', 'contract', 'freelancer', 'freelance',
            'consultant', 'consulting', 'self_employed', 'self-employed',
            'independent', 'gig', 'temp', 'temporary', 'casual',
          ];
          return contractorTerms.includes(raw) ? 'contractor' : 'employee';
        })(),
      });
    }

    if (errors.length > 0) {
      return reply.code(422).send({ error: 'Validation errors in CSV — nothing was imported', errors });
    }

    // Fetch all existing employees in one query for O(1) lookup
    const wallets    = validRows.map((r) => r.walletAddress);
    const existingEmployees = await prisma.employee.findMany({
      where: { orgId: request.currentOrgId, walletAddress: { in: wallets } },
      select: { id: true, walletAddress: true },
    });
    const existingMap = new Map(existingEmployees.map((e) => [e.walletAddress, e.id]));

    const toCreate = validRows.filter((r) => !existingMap.has(r.walletAddress));
    const toUpdate = validRows.filter((r) =>  existingMap.has(r.walletAddress));

    await prisma.$transaction([
      // Bulk-create new employees
      ...(toCreate.length > 0
        ? [prisma.employee.createMany({
            data: toCreate.map((r) => ({ orgId: request.currentOrgId, ...r, isActive: true })),
          })]
        : []),
      // Update existing ones individually (Prisma doesn't support bulk update with different values)
      ...toUpdate.map((r) =>
        prisma.employee.update({
          where: { id: existingMap.get(r.walletAddress)! },
          data:  { fullName: r.fullName, email: r.email, department: r.department, employmentType: r.employmentType, isActive: true },
        }),
      ),
    ]);

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'employee.bulk_imported',
      resourceType: 'employee',
      metadata:     { created: toCreate.length, updated: toUpdate.length, total: validRows.length },
      ipAddress:    request.ip,
    });

    return reply.send({
      message: `Import complete — ${toCreate.length} added, ${toUpdate.length} updated`,
      created: toCreate.length,
      updated: toUpdate.length,
    });
  });
}
