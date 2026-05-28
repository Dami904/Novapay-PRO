import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    orgRole:       string;
    currentOrgId:  string;
  }
}

/**
 * Ensures the authenticated user is a member of the org in :orgId.
 * Attaches request.orgRole and request.currentOrgId for downstream use.
 *
 * Must run AFTER authenticate middleware.
 */
export async function requireOrgMember(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const params = request.params as Record<string, string>;
  const orgId  = params.orgId;

  if (!orgId) {
    reply.code(400).send({ error: 'Missing orgId param' });
    return;
  }

  const orgEntry = request.user.orgs.find((o) => o.org_id === orgId);

  if (!orgEntry) {
    reply.code(403).send({
      error:   'Forbidden',
      message: 'You are not a member of this organisation',
    });
    return;
  }

  request.orgRole      = orgEntry.role;
  request.currentOrgId = orgId;
}
