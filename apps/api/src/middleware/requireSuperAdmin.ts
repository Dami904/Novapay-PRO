import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db/client';

/**
 * Verifies the user is a platform super-admin.
 * Super-admin flag lives in the DB (users.is_super_admin), not in the JWT,
 * so this always does a DB lookup — making it impossible to forge via JWT.
 *
 * Must run AFTER authenticate middleware.
 */
export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Super admin access required',
    });
  }
}
