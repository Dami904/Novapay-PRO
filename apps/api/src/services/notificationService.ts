import prisma from '../db/client';

interface NotifyParams {
  orgId:         string;
  userIds:       string[];
  type:          string;
  title:         string;
  body?:         string;
  resourceType?: string;
  resourceId?:   string;
}

export interface OrgMemberContact {
  userId: string;
  email:  string;
}

/** Create in-app notifications for one or more users. Fire-and-forget. */
export async function notify(params: NotifyParams): Promise<void> {
  try {
    await prisma.notification.createMany({
      data: params.userIds.map((userId) => ({
        orgId:        params.orgId,
        userId,
        type:         params.type,
        title:        params.title,
        body:         params.body,
        resourceType: params.resourceType,
        resourceId:   params.resourceId,
      })),
    });
  } catch (err) {
    console.error('[NotificationService] Failed to create notifications:', err);
  }
}

/**
 * Fetch user IDs + emails for org members matching given roles in one query.
 * Replaces the previous dual-query pattern (getUsersByRole + separate email lookup).
 */
export async function getMemberContacts(
  orgId: string,
  roles: string[],
): Promise<OrgMemberContact[]> {
  const members = await prisma.orgMember.findMany({
    where:   { orgId, role: { in: roles } },
    include: { user: { select: { id: true, email: true } } },
  });
  return members.map((m) => ({ userId: m.user.id, email: m.user.email }));
}

/** Display name helper — avoids repeating this ternary chain everywhere. */
export function displayName(
  user: { fullName?: string | null; email?: string | null } | null | undefined,
  fallback = 'A team member',
): string {
  return user?.fullName ?? user?.email ?? fallback;
}
