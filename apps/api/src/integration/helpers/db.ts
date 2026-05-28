import prisma from '../../db/client';

/**
 * Delete a set of users by ID. Cascades to: RefreshToken, OrgMember.
 * Call AFTER cleanupOrgs — otherwise FK violations if user is still referenced
 * by AuditLog (which cascades from org deletion).
 */
export async function cleanupUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/**
 * Delete a set of orgs by ID. Cascades to:
 * OrgMember, OrgInvitation, Employee, PayrollRun, PayrollRunRecipient,
 * PayrollSchedule, AuditLog, Notification, SubscriptionPlan.
 */
export async function cleanupOrgs(orgIds: string[]): Promise<void> {
  if (orgIds.length === 0) return;
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

/**
 * Disconnect Prisma from the test database.
 * Call once in afterAll of the last suite or in a global teardown file.
 */
export async function teardownDb(): Promise<void> {
  await prisma.$disconnect();
}
