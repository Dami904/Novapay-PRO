import prisma from '../db/client';

interface AuditParams {
  orgId:        string;
  actorId:      string;
  action:       string;
  resourceType?: string;
  resourceId?:  string;
  metadata?:    Record<string, unknown>;
  ipAddress?:   string;
}

/**
 * Write an audit log entry.
 * Called from every state-changing route handler.
 * Fire-and-forget — never throws, so a logging failure never breaks the main flow.
 */
export async function writeAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId:        params.orgId,
        actorId:      params.actorId,
        action:       params.action,
        resourceType: params.resourceType,
        resourceId:   params.resourceId,
        metadata:     (params.metadata as object) ?? undefined,
        ipAddress:    params.ipAddress,
      },
    });
  } catch (err) {
    // never let audit failure crash the request
    console.error('[AuditService] Failed to write audit log:', err);
  }
}
