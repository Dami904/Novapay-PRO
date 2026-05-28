import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/client';
import { authenticate } from '../../middleware/authenticate';

export default async function meRoutes(app: FastifyInstance) {

  // ── GET /me — current user profile ─────────────────────────────────────────
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where:  { id: request.user.sub },
      select: { id: true, email: true, fullName: true, avatarUrl: true, createdAt: true, isSuperAdmin: true },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return reply.send(user);
  });

  // ── GET /me/notifications — list notifications for a specific org ───────────
  // Query params: orgId (required), unreadOnly?, page?, pageSize?
  app.get('/notifications', { preHandler: [authenticate] }, async (request, reply) => {
    const query = z.object({
      orgId:      z.string().uuid('Invalid org ID'),
      unreadOnly: z.enum(['true', 'false']).default('false'),
      page:       z.coerce.number().default(1),
      pageSize:   z.coerce.number().default(20),
    }).safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: 'Validation error', issues: query.error.flatten() });
    }

    const { orgId, unreadOnly, page, pageSize } = query.data;

    // Verify the user is actually a member of this org
    const membership = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: request.user.sub } },
    });
    if (!membership) return reply.code(403).send({ error: 'Not a member of this organisation' });

    const where = {
      userId: request.user.sub,
      orgId,
      ...(unreadOnly === 'true' ? { read: false } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.notification.count({ where }),
      // Always return the total unread count regardless of the unreadOnly filter
      prisma.notification.count({
        where: { userId: request.user.sub, orgId, read: false },
      }),
    ]);

    return reply.send({ notifications, total, unreadCount, page, pageSize });
  });

  // ── PATCH /me/notifications/:id/read — mark one as read ───────────────────
  app.patch('/notifications/:id/read', { preHandler: [authenticate] }, async (request: any, reply) => {
    const { id } = request.params as { id: string };

    // Scope to the current user — no one can mark another user's notification
    const notification = await prisma.notification.findFirst({
      where: { id, userId: request.user.sub },
    });
    if (!notification) return reply.code(404).send({ error: 'Notification not found' });

    if (notification.read) return reply.send({ message: 'Already read' });

    await prisma.notification.update({ where: { id }, data: { read: true } });
    return reply.send({ message: 'Marked as read' });
  });

  // ── POST /me/notifications/read-all — mark all unread as read for an org ───
  app.post('/notifications/read-all', { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({
      orgId: z.string().uuid('Invalid org ID'),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'Validation error', issues: body.error.flatten() });
    }

    const { orgId } = body.data;

    // Verify membership before bulk-updating
    const membership = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: request.user.sub } },
    });
    if (!membership) return reply.code(403).send({ error: 'Not a member of this organisation' });

    const { count } = await prisma.notification.updateMany({
      where: { userId: request.user.sub, orgId, read: false },
      data:  { read: true },
    });

    return reply.send({ message: `${count} notifications marked as read`, count });
  });
}
