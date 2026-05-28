import { FastifyRequest, FastifyReply } from 'fastify';
import { Role } from '../config/constants';

/**
 * Factory — returns a Fastify preHandler that checks the user's role
 * in the current org against the allowed roles list.
 *
 * Usage:
 *   fastify.post('/execute', { preHandler: [authenticate, requireOrgMember, requireRole(CAN_EXECUTE)] }, handler)
 */
export function requireRole(allowedRoles: Role[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!allowedRoles.includes(request.orgRole as Role)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
    }
  };
}
