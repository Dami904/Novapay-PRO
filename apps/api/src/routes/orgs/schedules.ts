import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/client';
import { authenticate } from '../../middleware/authenticate';
import { requireOrgMember } from '../../middleware/requireOrgMember';
import { requireRole } from '../../middleware/requireRole';
import { writeAudit } from '../../services/auditService';
import { CAN_CREATE_DRAFT } from '../../config/constants';

// ── Next-occurrence helper (mirrors scheduleWorker.ts — kept local to avoid shared module) ──
function getNextRunAt(cadence: string, from: Date): Date {
  const next = new Date(from);
  switch (cadence) {
    case 'weekly':   next.setDate(next.getDate() + 7);   break;
    case 'biweekly': next.setDate(next.getDate() + 14);  break;
    case 'monthly':  next.setMonth(next.getMonth() + 1); break;
    default:         next.setMonth(next.getMonth() + 1); break;
  }
  return next;
}

export default async function scheduleRoutes(app: FastifyInstance) {
  const readHandler   = [authenticate, requireOrgMember];
  const manageHandler = [...readHandler, requireRole(CAN_CREATE_DRAFT)];

  // ── GET /schedules — list org's payroll schedules ─────────────────────────
  app.get('/', { preHandler: readHandler }, async (request, reply) => {
    const schedules = await prisma.payrollSchedule.findMany({
      where:   { orgId: request.currentOrgId },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(schedules);
  });

  // ── POST /schedules — create a recurring schedule ─────────────────────────
  // Multipart: fields (label, token, cadence, firstRunAt) + optional CSV file
  app.post('/', { preHandler: manageHandler }, async (request, reply) => {
    const parts = request.parts();
    let label      = '';
    let token      = 'USDC';
    let cadence    = 'monthly';
    let firstRunAt = '';
    let csvRaw:     string | null = null;
    let csvFilename: string | null = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        csvRaw      = (await part.toBuffer()).toString('utf-8');
        csvFilename = part.filename;
      } else {
        const val = (part as any).value as string;
        if (part.fieldname === 'label')      label      = val;
        if (part.fieldname === 'token')      token      = val;
        if (part.fieldname === 'cadence')    cadence    = val;
        if (part.fieldname === 'firstRunAt') firstRunAt = val;
      }
    }

    // Validate fields
    const body = z.object({
      label:      z.string().min(1, 'Label is required'),
      token:      z.enum(['USDC', 'USDT']),
      cadence:    z.enum(['weekly', 'biweekly', 'monthly']),
      firstRunAt: z.string().datetime({ message: 'firstRunAt must be an ISO-8601 datetime' }),
    }).safeParse({ label, token, cadence, firstRunAt });

    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const schedule = await prisma.payrollSchedule.create({
      data: {
        orgId:       request.currentOrgId,
        label:       body.data.label,
        token:       body.data.token,
        cadence:     body.data.cadence,
        nextRunAt:   new Date(body.data.firstRunAt),
        csvRaw:      csvRaw ?? undefined,
        csvFilename: csvFilename ?? undefined,
        createdBy:   request.user.sub,
      },
    });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'schedule.created',
      resourceType: 'payroll_schedule',
      resourceId:   schedule.id,
      metadata:     { label: body.data.label, cadence: body.data.cadence, firstRunAt: body.data.firstRunAt },
      ipAddress:    request.ip,
    });

    return reply.code(201).send(schedule);
  });

  // ── PATCH /schedules/:scheduleId — update label / cadence / active flag ───
  app.patch('/:scheduleId', { preHandler: manageHandler }, async (request: any, reply) => {
    const body = z.object({
      label:    z.string().min(1).optional(),
      cadence:  z.enum(['weekly', 'biweekly', 'monthly']).optional(),
      isActive: z.boolean().optional(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const { scheduleId } = request.params as { scheduleId: string };

    const existing = await prisma.payrollSchedule.findFirst({
      where: { id: scheduleId, orgId: request.currentOrgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Schedule not found' });

    // If cadence changed, recalculate nextRunAt from now
    const updateData: Record<string, unknown> = { ...body.data };
    if (body.data.cadence && body.data.cadence !== existing.cadence) {
      updateData.nextRunAt = getNextRunAt(body.data.cadence, new Date());
    }

    const updated = await prisma.payrollSchedule.update({
      where: { id: scheduleId },
      data:  updateData,
    });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'schedule.updated',
      resourceType: 'payroll_schedule',
      resourceId:   scheduleId,
      metadata:     body.data as Record<string, unknown>,
      ipAddress:    request.ip,
    });

    return reply.send(updated);
  });

  // ── DELETE /schedules/:scheduleId ──────────────────────────────────────────
  app.delete('/:scheduleId', { preHandler: manageHandler }, async (request: any, reply) => {
    const { scheduleId } = request.params as { scheduleId: string };

    const existing = await prisma.payrollSchedule.findFirst({
      where: { id: scheduleId, orgId: request.currentOrgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Schedule not found' });

    await prisma.payrollSchedule.delete({ where: { id: scheduleId } });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'schedule.deleted',
      resourceType: 'payroll_schedule',
      resourceId:   scheduleId,
      metadata:     { label: existing.label, cadence: existing.cadence },
      ipAddress:    request.ip,
    });

    return reply.code(204).send();
  });
}
