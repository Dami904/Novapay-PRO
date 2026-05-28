import { Decimal } from '@prisma/client/runtime/library';
import { ethers } from 'ethers';
import prisma from '../db/client';
import { emailQueue, txWatcherQueue } from '../workers/queue';
import { notify, getMemberContacts, displayName } from './notificationService';
import {
  payrollSubmittedEmail,
  payrollApprovedEmail,
  payrollRejectedEmail,
} from './emailService';
import { writeAudit } from './auditService';
import {
  ROLES,
  PAYROLL_STATUS,
  VALID_TRANSITIONS,
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
  MORPH_EXPLORER_URL,
  type PayrollStatus,
  type SupportedToken,
} from '../config/constants';
import { env } from '../config/env';
import {
  sendDiscordWebhook,
  discordPayrollSubmitted,
  discordPayrollApproved,
  discordPayrollRejected,
} from './discordService';
import type { ParsedRecipient } from '../utils/csvParser';

// ── Create draft ──────────────────────────────────────────────────────────────

export async function createDraft(params: {
  orgId:        string;
  label:        string;
  token:        string;
  createdBy:    string;
  recipients:   ParsedRecipient[];
  csvRaw:       string;
  csvFilename:  string;
}) {
  const { orgId, label, token, createdBy, recipients, csvRaw, csvFilename } = params;

  const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0);

  // Resolve employee IDs for recipients whose wallet is in the org directory
  const wallets     = recipients.map((r) => r.walletAddress.toLowerCase());
  const employees   = await prisma.employee.findMany({
    where:  { orgId, walletAddress: { in: wallets } },
    select: { id: true, walletAddress: true },
  });
  const employeeMap = new Map(employees.map((e) => [e.walletAddress.toLowerCase(), e.id]));

  const run = await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: {
        orgId,
        label,
        token,
        status:         PAYROLL_STATUS.DRAFT,
        recipientCount: recipients.length,
        totalAmount:    new Decimal(totalAmount),
        csvFilename,
        csvRaw,
      },
    });

    await tx.payrollRunRecipient.createMany({
      data: recipients.map((r) => ({
        runId:           run.id,
        fullName:        r.fullName,
        walletAddress:   r.walletAddress,
        email:           r.email ?? null,
        amount:          new Decimal(r.amount),
        rowIndex:        r.rowIndex,
        terminationDate: r.terminationDate ?? null,
        employeeId:      employeeMap.get(r.walletAddress.toLowerCase()) ?? null,
      })),
    });

    return run;
  });

  await writeAudit({
    orgId,
    actorId:      createdBy,
    action:       'payroll_run.created',
    resourceType: 'payroll_run',
    resourceId:   run.id,
    metadata:     { label, token, recipientCount: recipients.length, totalAmount },
  });

  return run;
}

// ── State machine transition ──────────────────────────────────────────────────

interface TransitionOptions {
  runId:    string;
  orgId:    string;
  from:     PayrollStatus;
  to:       PayrollStatus;
  actorId:  string;
  extra?:   Record<string, unknown>;
}

async function transition(opts: TransitionOptions) {
  const { runId, orgId, from, to, actorId, extra } = opts;

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, orgId },
  });

  if (!run) throw { statusCode: 404, message: 'Payroll run not found' };
  if (run.status !== from) {
    throw {
      statusCode: 409,
      message:    `Cannot perform this action. Run is in "${run.status}" status, expected "${from}"`,
    };
  }

  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw { statusCode: 409, message: `Invalid status transition: ${from} → ${to}` };
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status: to, ...extra };

  if (to === PAYROLL_STATUS.PENDING_APPROVAL) {
    updateData.submittedBy = actorId;
    updateData.submittedAt = now;
  } else if (to === PAYROLL_STATUS.APPROVED || to === PAYROLL_STATUS.REJECTED) {
    updateData.reviewedBy = actorId;
    updateData.reviewedAt = now;
  } else if (to === PAYROLL_STATUS.EXECUTING) {
    updateData.executedBy = actorId;
    updateData.executedAt = now;
  }

  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data:  updateData,
  });

  await writeAudit({
    orgId,
    actorId,
    action:       `payroll_run.${to.replace('_', '.')}`,
    resourceType: 'payroll_run',
    resourceId:   runId,
    metadata:     extra,
  });

  return updated;
}

// ── Submit for approval ───────────────────────────────────────────────────────

export async function submitRun(runId: string, orgId: string, actorId: string) {
  const run = await transition({
    runId, orgId, actorId,
    from: PAYROLL_STATUS.DRAFT,
    to:   PAYROLL_STATUS.PENDING_APPROVAL,
  });

  const [org, actor, contacts] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true, email: true } }),
    getMemberContacts(orgId, [ROLES.OWNER, ROLES.ADMIN, ROLES.FINANCE]),
  ]);

  await notify({
    orgId,
    userIds:      contacts.map((c) => c.userId),
    type:         'payroll_submitted',
    title:        `Payroll "${run.label}" needs your approval`,
    resourceType: 'payroll_run',
    resourceId:   runId,
  });

  if (contacts.length > 0 && org) {
    const template = payrollSubmittedEmail({
      orgName:   org.name,
      runLabel:  run.label,
      submitter: displayName(actor),
      runId, orgId, appUrl: env.FRONTEND_URL,
    });
    emailQueue.add('payroll_submitted', {
      type: 'payroll_submitted',
      to:   contacts.map((c) => c.email),
      ...template,
    }).catch((err) => console.error('[PayrollService] Failed to queue payroll_submitted email:', err));
  }

  // Discord webhook — fire-and-forget
  if (org?.discordWebhookUrl) {
    sendDiscordWebhook(
      org.discordWebhookUrl,
      discordPayrollSubmitted({
        orgName:   org.name,
        runLabel:  run.label,
        submitter: displayName(actor),
        total:     run.totalAmount?.toString() ?? '0',
        token:     run.token,
        appUrl:    env.FRONTEND_URL,
        orgId,
        runId,
      }),
    );
  }

  return run;
}

export async function approveRun(runId: string, orgId: string, actorId: string) {
  const run = await transition({
    runId, orgId, actorId,
    from: PAYROLL_STATUS.PENDING_APPROVAL,
    to:   PAYROLL_STATUS.APPROVED,
  });

  const [org, actor, contacts] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true, email: true } }),
    getMemberContacts(orgId, [ROLES.OWNER, ROLES.ADMIN]),
  ]);

  await notify({
    orgId,
    userIds:      contacts.map((c) => c.userId),
    type:         'payroll_approved',
    title:        `Payroll "${run.label}" approved — ready to execute`,
    resourceType: 'payroll_run',
    resourceId:   runId,
  });

  if (contacts.length > 0 && org) {
    const template = payrollApprovedEmail({
      orgName:  org.name,
      runLabel: run.label,
      approver: displayName(actor),
      runId, orgId, appUrl: env.FRONTEND_URL,
    });
    emailQueue.add('payroll_approved', {
      type: 'payroll_approved',
      to:   contacts.map((c) => c.email),
      ...template,
    }).catch((err) => console.error('[PayrollService] Failed to queue payroll_approved email:', err));
  }

  // Discord webhook — fire-and-forget
  if (org?.discordWebhookUrl) {
    sendDiscordWebhook(
      org.discordWebhookUrl,
      discordPayrollApproved({
        orgName:  org.name,
        runLabel: run.label,
        approver: displayName(actor),
        total:    run.totalAmount?.toString() ?? '0',
        token:    run.token,
        appUrl:   env.FRONTEND_URL,
        orgId,
        runId,
      }),
    );
  }

  return run;
}

export async function rejectRun(runId: string, orgId: string, actorId: string, note: string) {
  const current = await prisma.payrollRun.findFirst({ where: { id: runId, orgId }, select: { status: true } });
  if (!current) throw { statusCode: 404, message: 'Payroll run not found' };

  const validFrom = [PAYROLL_STATUS.PENDING_APPROVAL, PAYROLL_STATUS.APPROVED];
  if (!validFrom.includes(current.status as typeof PAYROLL_STATUS.PENDING_APPROVAL)) {
    throw { statusCode: 409, message: 'This run cannot be recalled at its current stage' };
  }

  const run = await transition({
    runId, orgId, actorId,
    from:  current.status as typeof PAYROLL_STATUS.PENDING_APPROVAL,
    to:    PAYROLL_STATUS.REJECTED,
    extra: { reviewNote: note },
  });

  if (!run.submittedBy) return run;

  const [org, actor, submitter] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true, email: true } }),
    prisma.user.findUnique({ where: { id: run.submittedBy }, select: { email: true } }),
  ]);

  await notify({
    orgId,
    userIds:      [run.submittedBy],
    type:         'payroll_rejected',
    title:        `Payroll "${run.label}" was rejected`,
    body:         note,
    resourceType: 'payroll_run',
    resourceId:   runId,
  });

  if (submitter && org) {
    const template = payrollRejectedEmail({
      orgName:  org.name,
      runLabel: run.label,
      rejector: displayName(actor, 'A reviewer'),
      note, runId, orgId, appUrl: env.FRONTEND_URL,
    });
    emailQueue.add('payroll_rejected', {
      type: 'payroll_rejected',
      to:   submitter.email,
      ...template,
    }).catch((err) => console.error('[PayrollService] Failed to queue payroll_rejected email:', err));
  }

  // Discord webhook — fire-and-forget
  if (org?.discordWebhookUrl) {
    sendDiscordWebhook(
      org.discordWebhookUrl,
      discordPayrollRejected({
        orgName:  org.name,
        runLabel: run.label,
        rejector: displayName(actor, 'A reviewer'),
        note,
        appUrl:   env.FRONTEND_URL,
        orgId,
        runId,
      }),
    );
  }

  return run;
}

// ── Build unsigned tx data ────────────────────────────────────────────────────

export async function buildTxData(runId: string, orgId: string) {
  const run = await prisma.payrollRun.findFirst({
    where:   { id: runId, orgId },
    include: { recipients: { orderBy: { rowIndex: 'asc' } } },
  });

  if (!run) throw { statusCode: 404, message: 'Payroll run not found' };
  if (run.status !== PAYROLL_STATUS.APPROVED) {
    throw { statusCode: 409, message: 'Only approved runs can be executed' };
  }

  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { walletAddress: true },
  });

  if (!org?.walletAddress) {
    throw { statusCode: 400, message: 'No wallet linked to this organisation. Link a wallet in Org Settings first.' };
  }

  const token = run.token as SupportedToken;
  const decimals = TOKEN_DECIMALS[token];

  const recipients = run.recipients.map((r) => r.walletAddress);
  const amounts    = run.recipients.map((r) =>
    ethers.parseUnits(r.amount.toString(), decimals).toString(),
  );

  return {
    contractAddress: env.NOVAPAY_B2B_CONTRACT_ADDRESS,
    tokenAddress:    TOKEN_ADDRESSES[token],
    orgWallet:       org.walletAddress,
    recipients,
    amounts,
    label:   run.label,
    runId:   run.id,
    token,
    decimals,
    totalAmount: run.totalAmount?.toString(),
    recipientCount: run.recipientCount,
  };
}

// ── Record tx hash + start watcher ────────────────────────────────────────────

export async function recordExecution(
  runId:   string,
  orgId:   string,
  actorId: string,
  txHash:  string,
) {
  const explorerUrl = `${MORPH_EXPLORER_URL}/tx/${txHash}`;

  const run = await transition({
    runId, orgId, actorId,
    from:  PAYROLL_STATUS.APPROVED,
    to:    PAYROLL_STATUS.EXECUTING,
    extra: { txHash, explorerUrl },
  });

  // Kick off the tx confirmation watcher
  await txWatcherQueue.add('watch', { runId, txHash, orgId });

  return run;
}
