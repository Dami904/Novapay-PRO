import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/client';
import { authenticate } from '../../middleware/authenticate';
import { requireOrgMember } from '../../middleware/requireOrgMember';
import { requireRole } from '../../middleware/requireRole';
import { CAN_VIEW_AUDIT_LOG } from '../../config/constants';

export default async function auditLogRoutes(app: FastifyInstance) {

  // ── GET /orgs/:orgId/audit-logs ────────────────────────────────────────────
  // Owner + Admin only — shows every action ever taken within the org
  app.get('/', {
    preHandler: [authenticate, requireOrgMember, requireRole(CAN_VIEW_AUDIT_LOG)],
  }, async (request, reply) => {
    const query = z.object({
      action:   z.string().optional(),  // filter by action keyword e.g. "payroll_run"
      page:     z.coerce.number().default(1),
      pageSize: z.coerce.number().default(50),
    }).parse(request.query);

    const where: Record<string, unknown> = { orgId: request.currentOrgId };
    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (query.page - 1) * query.pageSize,
        take:    query.pageSize,
        include: {
          actor: { select: { id: true, email: true, fullName: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return reply.send({ logs, total, page: query.page, pageSize: query.pageSize });
  });
}
