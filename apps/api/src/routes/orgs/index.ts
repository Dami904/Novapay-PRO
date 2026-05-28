import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/client';
import { authenticate } from '../../middleware/authenticate';
import { requireOrgMember } from '../../middleware/requireOrgMember';
import { requireRole } from '../../middleware/requireRole';
import { writeAudit } from '../../services/auditService';
import { emailQueue } from '../../workers/queue';
import { invitationEmail } from '../../services/emailService';
import { hashPassword, buildOrgClaims, signAccessToken, createRefreshToken, REFRESH_COOKIE_OPTIONS } from '../../services/authService';
import { displayName } from '../../services/notificationService';
import { generateToken } from '../../utils/token';
import { CAN_MANAGE_ORG, CAN_MANAGE_MEMBERS, CAN_DELETE_ORG, INVITATION_TTL_DAYS, ROLES } from '../../config/constants';
import payrollRunRoutes from './payrollRuns';
import employeeRoutes   from './employees';
import scheduleRoutes   from './schedules';
import auditLogRoutes   from './auditLogs';
import { env } from '../../config/env';

export default async function orgRoutes(app: FastifyInstance) {

  // ── GET /orgs/:orgId ────────────────────────────────────────────────────────
  app.get('/:orgId', {
    preHandler: [authenticate, requireOrgMember],
  }, async (request, reply) => {
    const org = await prisma.organization.findUnique({
      where:   { id: request.currentOrgId },
      include: { subscription: { select: { plan: true, payrollRunsUsed: true } } },
    });
    return reply.send(org);
  });

  // ── PATCH /orgs/:orgId ──────────────────────────────────────────────────────
  app.patch('/:orgId', {
    preHandler: [authenticate, requireOrgMember, requireRole(CAN_MANAGE_ORG)],
  }, async (request, reply) => {
    const body = z.object({
      name:              z.string().min(2).optional(),
      discordWebhookUrl: z.string().url().nullable().optional(),
      walletLabel:       z.string().optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });

    const org = await prisma.organization.update({
      where: { id: request.currentOrgId },
      data:  body.data,
    });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'org.updated',
      resourceType: 'organization',
      resourceId:   request.currentOrgId,
      metadata:     body.data,
      ipAddress:    request.ip,
    });

    return reply.send(org);
  });

  // ── GET /orgs/:orgId/members ────────────────────────────────────────────────
  app.get('/:orgId/members', {
    preHandler: [authenticate, requireOrgMember],
  }, async (request, reply) => {
    const members = await prisma.orgMember.findMany({
      where:   { orgId: request.currentOrgId },
      include: { user: { select: { id: true, email: true, fullName: true, avatarUrl: true, createdAt: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return reply.send(members);
  });

  // ── PATCH /orgs/:orgId/members/:userId — change role ───────────────────────
  app.patch('/:orgId/members/:userId', {
    preHandler: [authenticate, requireOrgMember, requireRole(CAN_MANAGE_MEMBERS)],
  }, async (request: any, reply) => {
    const body = z.object({
      role: z.enum(['admin', 'finance', 'hr', 'viewer']),
    }).safeParse(request.body);

    if (!body.success) return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });

    const { userId } = request.params as { userId: string };

    // Prevent changing the owner's role
    const target = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: request.currentOrgId, userId } },
    });
    if (!target) return reply.code(404).send({ error: 'Member not found' });
    if (target.role === 'owner') return reply.code(403).send({ error: 'Cannot change the owner\'s role' });

    const updated = await prisma.orgMember.update({
      where: { orgId_userId: { orgId: request.currentOrgId, userId } },
      data:  { role: body.data.role },
    });

    await writeAudit({
      orgId:        request.currentOrgId,
      actorId:      request.user.sub,
      action:       'member.role_changed',
      resourceType: 'org_member',
      resourceId:   userId,
      metadata:     { from: target.role, to: body.data.role },
      ipAddress:    request.ip,
    });

    return reply.send(updated);
  });

  // ── DELETE /orgs/:orgId/members/:userId — remove member ────────────────────
  app.delete('/:orgId/members/:userId', {
    preHandler: [authenticate, requireOrgMember, requireRole(CAN_DELETE_ORG)],
  }, async (request: any, reply) => {
    const { userId } = request.params as { userId: string };

    if (userId === request.user.sub) {
      return reply.code(400).send({ error: 'You cannot remove yourself' });
    }

    const target = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: request.currentOrgId, userId } },
    });
    if (!target) return reply.code(404).send({ error: 'Member not found' });
    if (target.role === 'owner') return reply.code(403).send({ error: 'Cannot remove the owner' });

    await prisma.orgMember.delete({
      where: { orgId_userId: { orgId: request.currentOrgId, userId } },
    });

    await writeAudit({
      orgId:     request.currentOrgId,
      actorId:   request.user.sub,
      action:    'member.removed',
      resourceType: 'org_member',
      resourceId:   userId,
      ipAddress: request.ip,
    });

    return reply.code(204).send();
  });

  // ── POST /orgs/:orgId/invitations — send invite ─────────────────────────────
  app.post('/:orgId/invitations', {
    preHandler: [authenticate, requireOrgMember, requireRole(CAN_MANAGE_MEMBERS)],
  }, async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      role:  z.enum([ROLES.ADMIN, ROLES.FINANCE, ROLES.HR, ROLES.VIEWER]),
    }).safeParse(request.body);

    if (!body.success) return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });

    const { email, role } = body.data;

    // Check not already a member via a single join query
    const existingUser = await prisma.user.findUnique({
      where:   { email },
      include: { orgMembers: { where: { orgId: request.currentOrgId } } },
    });
    if (existingUser?.orgMembers.length) {
      return reply.code(409).send({ error: 'This person is already a member' });
    }

    const token     = generateToken(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_TTL_DAYS);

    const invitation = await prisma.orgInvitation.create({
      data: {
        orgId:     request.currentOrgId,
        email,
        role,
        token,
        invitedBy: request.user.sub,
        expiresAt,
      },
    });

    const [org, actor] = await Promise.all([
      prisma.organization.findUnique({ where: { id: request.currentOrgId } }),
      prisma.user.findUnique({ where: { id: request.user.sub }, select: { fullName: true, email: true } }),
    ]);

    const template = invitationEmail({
      orgName: org!.name,
      role,
      inviter: displayName(actor),
      token,
      appUrl:  env.FRONTEND_URL,
    });

    // Fire-and-forget — don't block the response waiting for the queue
    emailQueue.add('invitation', { type: 'invitation', to: email, ...template }).catch((err) =>
      console.error('[Invitations] Failed to queue invitation email:', err),
    );

    await writeAudit({
      orgId:     request.currentOrgId,
      actorId:   request.user.sub,
      action:    'member.invited',
      metadata:  { email, role },
      ipAddress: request.ip,
    });

    return reply.code(201).send({ message: `Invitation sent to ${email}`, id: invitation.id });
  });

  // ── GET /invitations/:token — validate token (public) ──────────────────────
  app.get('/invitations/:token', async (request: any, reply) => {
    const { token } = request.params as { token: string };
    const inv = await prisma.orgInvitation.findUnique({
      where:   { token },
      include: { org: { select: { name: true, slug: true } } },
    });

    if (!inv || inv.accepted || inv.expiresAt < new Date()) {
      return reply.code(404).send({ error: 'Invitation not found or has expired' });
    }

    return reply.send({
      email:   inv.email,
      role:    inv.role,
      orgName: inv.org.name,
      orgSlug: inv.org.slug,
    });
  });

  // ── POST /invitations/:token/accept — accept invite (public) ───────────────
  app.post('/invitations/:token/accept', async (request: any, reply) => {
    const body = z.object({
      password: z.string().min(8),
      fullName: z.string().min(2).optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });

    const { token } = request.params as { token: string };
    const inv = await prisma.orgInvitation.findUnique({
      where:   { token },
      include: { org: { select: { id: true, name: true, slug: true, plan: true } } },
    });

    if (!inv || inv.accepted || inv.expiresAt < new Date()) {
      return reply.code(404).send({ error: 'Invitation not found or has expired' });
    }

    // Find or create the user
    let user = await prisma.user.findUnique({ where: { email: inv.email } });

    if (!user) {
      const passwordHash = await hashPassword(body.data.password);
      user = await prisma.user.create({
        data: { email: inv.email, passwordHash, fullName: body.data.fullName },
      });
    }

    // Add to org
    await prisma.$transaction([
      prisma.orgMember.create({
        data: { orgId: inv.orgId, userId: user.id, role: inv.role, invitedBy: inv.invitedBy },
      }),
      prisma.orgInvitation.update({ where: { token }, data: { accepted: true } }),
    ]);

    const orgs        = await buildOrgClaims(user.id);
    const accessToken = signAccessToken(app, { sub: user.id, email: user.email, orgs });
    const refreshToken = await createRefreshToken(user.id);

    reply.setCookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    return reply.code(201).send({
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName },
      org:  inv.org,
    });
  });

  // ── Register sub-routes ────────────────────────────────────────────────────
  app.register(payrollRunRoutes, { prefix: '/:orgId/payroll-runs' });
  app.register(employeeRoutes,   { prefix: '/:orgId/employees' });
  app.register(scheduleRoutes,   { prefix: '/:orgId/schedules' });
  app.register(auditLogRoutes,   { prefix: '/:orgId/audit-logs' });
}
