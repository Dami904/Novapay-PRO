import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/client';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/authenticate';
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin';
import { writeAudit } from '../../services/auditService';

// Every admin route requires authenticate + requireSuperAdmin
// requireSuperAdmin always does a DB lookup — cannot be forged via JWT
const preHandler = [authenticate, requireSuperAdmin];

export default async function adminRoutes(app: FastifyInstance) {

  // ── GET /admin/stats — platform-level dashboard numbers ───────────────────
  app.get('/stats', { preHandler }, async (_request, reply) => {
    const [
      totalOrgs,
      totalUsers,
      totalRuns,
      totalComplete,
      totalFailed,
      planBreakdown,
      recentRuns,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.payrollRun.count(),
      prisma.payrollRun.count({ where: { status: 'complete' } }),
      prisma.payrollRun.count({ where: { status: 'failed' } }),
      // How many orgs per plan
      prisma.organization.groupBy({ by: ['plan'], _count: { id: true } }),
      // Last 5 completed runs across the whole platform
      prisma.payrollRun.findMany({
        where:   { status: 'complete' },
        orderBy: { executedAt: 'desc' },
        take:    5,
        select: {
          id: true, label: true, token: true, totalAmount: true,
          executedAt: true,
          org: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return reply.send({
      totalOrgs,
      totalUsers,
      totalRuns,
      totalComplete,
      totalFailed,
      planBreakdown: Object.fromEntries(planBreakdown.map((p) => [p.plan, p._count.id])),
      recentRuns,
    });
  });

  // ── GET /admin/orgs — list all orgs ───────────────────────────────────────
  app.get('/orgs', { preHandler }, async (request, reply) => {
    const query = z.object({
      search:   z.string().optional(),
      plan:     z.enum(['free', 'starter', 'growth']).optional(),
      page:     z.coerce.number().default(1),
      pageSize: z.coerce.number().default(25),
    }).parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.plan)   where.plan = query.plan;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (query.page - 1) * query.pageSize,
        take:    query.pageSize,
        select: {
          id: true, name: true, slug: true, plan: true,
          walletAddress: true, createdAt: true,
          _count: {
            select: { members: true, employees: true, payrollRuns: true },
          },
          subscription: { select: { plan: true, status: true, payrollRunsUsed: true } },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return reply.send({ orgs, total, page: query.page, pageSize: query.pageSize });
  });

  // ── GET /admin/orgs/:orgId — full org detail ───────────────────────────────
  app.get('/orgs/:orgId', { preHandler }, async (request: any, reply) => {
    const { orgId } = request.params as { orgId: string };

    const org = await prisma.organization.findUnique({
      where:   { id: orgId },
      include: {
        subscription: true,
        members: {
          include: { user: { select: { id: true, email: true, fullName: true, createdAt: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        payrollRuns: {
          orderBy: { createdAt: 'desc' },
          take:    10,
          select: {
            id: true, label: true, token: true, status: true,
            totalAmount: true, recipientCount: true,
            createdAt: true, executedAt: true, txHash: true,
          },
        },
        _count: {
          select: { employees: true, payrollRuns: true, auditLogs: true },
        },
      },
    });

    if (!org) return reply.code(404).send({ error: 'Organisation not found' });
    return reply.send(org);
  });

  // ── PATCH /admin/orgs/:orgId/plan — override org plan ─────────────────────
  app.patch('/orgs/:orgId/plan', { preHandler }, async (request: any, reply) => {
    const body = z.object({
      plan: z.enum(['free', 'starter', 'growth']),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const { orgId } = request.params as { orgId: string };

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return reply.code(404).send({ error: 'Organisation not found' });

    const [updatedOrg] = await prisma.$transaction([
      prisma.organization.update({
        where: { id: orgId },
        data:  { plan: body.data.plan },
      }),
      prisma.subscriptionPlan.upsert({
        where:  { orgId },
        update: { plan: body.data.plan },
        create: { orgId, plan: body.data.plan },
      }),
    ]);

    await writeAudit({
      orgId,
      actorId:      request.user.sub,
      action:       'admin.plan_overridden',
      resourceType: 'organization',
      resourceId:   orgId,
      metadata:     { from: org.plan, to: body.data.plan },
      ipAddress:    request.ip,
    });

    return reply.send({ message: `Plan updated to "${body.data.plan}"`, org: updatedOrg });
  });

  // ── DELETE /admin/orgs/:orgId — permanently delete an org ─────────────────
  // Cascades to all related data (members, runs, employees, audit logs) via Prisma schema
  app.delete('/orgs/:orgId', { preHandler }, async (request: any, reply) => {
    const { orgId } = request.params as { orgId: string };

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return reply.code(404).send({ error: 'Organisation not found' });

    await prisma.organization.delete({ where: { id: orgId } });

    // Audit goes on a system org (the deleted one no longer exists)
    // We log against the super admin's first org or skip — here we just log to console
    console.warn(`[Admin] Org "${org.name}" (${orgId}) deleted by super-admin ${request.user.sub}`);

    return reply.code(204).send();
  });

  // ── GET /admin/users — list all users ─────────────────────────────────────
  app.get('/users', { preHandler }, async (request, reply) => {
    const query = z.object({
      search:   z.string().optional(),
      page:     z.coerce.number().default(1),
      pageSize: z.coerce.number().default(25),
    }).parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.OR = [
        { email:    { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (query.page - 1) * query.pageSize,
        take:    query.pageSize,
        select: {
          id: true, email: true, fullName: true,
          isSuperAdmin: true, createdAt: true,
          _count: { select: { orgMembers: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return reply.send({ users, total, page: query.page, pageSize: query.pageSize });
  });

  // ── PATCH /admin/users/:userId/super-admin — grant or revoke super-admin ───
  // Requires BOTH super-admin session AND the server-side ADMIN_SECRET header.
  // This prevents any existing super-admin from chain-promoting others without
  // physical access to the server config (.env).
  app.patch('/users/:userId/super-admin', { preHandler }, async (request: any, reply) => {
    // Second-factor: X-Admin-Secret must match the env secret
    const incomingSecret = request.headers['x-admin-secret'];
    if (!incomingSecret || incomingSecret !== env.ADMIN_SECRET) {
      return reply.code(403).send({ error: 'Invalid or missing admin secret' });
    }

    const body = z.object({
      isSuperAdmin: z.boolean(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const { userId } = request.params as { userId: string };

    // Prevent a super-admin from revoking their own access
    if (userId === request.user.sub && !body.data.isSuperAdmin) {
      return reply.code(400).send({ error: 'You cannot revoke your own super-admin access' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const updated = await prisma.user.update({
      where:  { id: userId },
      data:   { isSuperAdmin: body.data.isSuperAdmin },
      select: { id: true, email: true, fullName: true, isSuperAdmin: true },
    });

    console.log(
      `[Admin] Super-admin ${body.data.isSuperAdmin ? 'granted to' : 'revoked from'} user ${userId} by ${request.user.sub}`,
    );

    return reply.send(updated);
  });

  // ── GET /admin/audit-logs — platform-wide audit log ───────────────────────
  app.get('/audit-logs', { preHandler }, async (request, reply) => {
    const query = z.object({
      orgId:    z.string().uuid().optional(),
      action:   z.string().optional(),
      page:     z.coerce.number().default(1),
      pageSize: z.coerce.number().default(50),
    }).parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.orgId)  where.orgId  = query.orgId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (query.page - 1) * query.pageSize,
        take:    query.pageSize,
        include: {
          actor: { select: { id: true, email: true, fullName: true } },
          org:   { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return reply.send({ logs, total, page: query.page, pageSize: query.pageSize });
  });
}
