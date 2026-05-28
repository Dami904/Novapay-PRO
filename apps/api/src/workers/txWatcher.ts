import { Worker } from 'bullmq';
import { ethers } from 'ethers';
import { env } from '../config/env';
import prisma from '../db/client';
import { emailQueue } from './queue';
import { payrollExecutedEmail, employeePayslipEmail } from '../services/emailService';
import { getMemberContacts, notify } from '../services/notificationService';
import {
  sendDiscordWebhook,
  discordPayrollExecuted,
  discordPayrollFailed,
} from '../services/discordService';
import { MORPH_EXPLORER_URL, TX_POLL_INTERVAL_MS, TX_POLL_MAX_ATTEMPTS, ROLES } from '../config/constants';
import type { TxWatcherJobData } from './queue';

const provider = new ethers.JsonRpcProvider(env.MORPH_RPC_URL);

export function startTxWatcherWorker() {
  const worker = new Worker<TxWatcherJobData>(
    'tx-watcher',
    async (job) => {
      const { runId, txHash, orgId } = job.data;
      console.log(`[TxWatcher] Watching ${txHash} for run ${runId}`);

      let attempts = 0;

      while (attempts < TX_POLL_MAX_ATTEMPTS) {
        attempts++;
        await sleep(TX_POLL_INTERVAL_MS);

        try {
          const receipt = await provider.getTransactionReceipt(txHash);

          if (!receipt) {
            // Not yet mined — keep polling
            continue;
          }

          const explorerUrl = `${MORPH_EXPLORER_URL}/tx/${txHash}`;

          if (receipt.status === 1) {
            // Single query: update + fetch org in one round-trip
            const run = await prisma.payrollRun.update({
              where:   { id: runId },
              data:    { status: 'complete', executedAt: new Date(), explorerUrl },
              include: {
                org:        { select: { id: true, name: true, discordWebhookUrl: true } },
                recipients: { select: { fullName: true }, orderBy: { rowIndex: 'asc' } },
              },
            });

            // Single query for all contacts (IDs + emails)
            const contacts = await getMemberContacts(orgId, [
              ROLES.OWNER, ROLES.ADMIN, ROLES.FINANCE, ROLES.HR,
            ]);

            await notify({
              orgId,
              userIds:      contacts.map((c) => c.userId),
              type:         'payroll_executed',
              title:        `Payroll "${run.label}" executed successfully`,
              body:         `${run.totalAmount} ${run.token} disbursed on-chain`,
              resourceType: 'payroll_run',
              resourceId:   runId,
            });

            const adminEmails = await getMemberContacts(orgId, [ROLES.OWNER, ROLES.ADMIN]);
            if (adminEmails.length > 0) {
              const template = payrollExecutedEmail({
                orgName:    run.org.name,
                runLabel:   run.label,
                txHash,
                explorerUrl,
                total:      run.totalAmount?.toString() ?? '0',
                token:      run.token,
              });
              emailQueue.add('payroll_executed', {
                type: 'payroll_executed',
                to:   adminEmails.map((c) => c.email),
                ...template,
              }).catch((err) => console.error('[TxWatcher] Failed to queue payroll_executed email:', err));
            }

            // Per-employee payslip emails — CSV email takes priority, falls back to Employee Directory
            const recipientsWithEmail = await prisma.payrollRunRecipient.findMany({
              where: {
                runId,
                OR: [
                  { email: { not: null } },
                  { employee: { email: { not: null } } },
                ],
              },
              include: { employee: { select: { email: true } } },
            });

            for (const r of recipientsWithEmail) {
              const recipientEmail = r.email ?? r.employee?.email;
              if (!recipientEmail) continue;
              const payslip = employeePayslipEmail({
                employeeName:  r.fullName,
                orgName:       run.org.name,
                runLabel:      run.label,
                amount:        r.amount.toString(),
                token:         run.token,
                executedAt:    new Date().toISOString(),
                walletAddress: r.walletAddress,
                explorerUrl:   `${MORPH_EXPLORER_URL}/address/${r.walletAddress}`,
              });
              emailQueue.add('payslip', {
                type: 'payslip',
                to:   recipientEmail,
                ...payslip,
              }).catch((err) => console.error('[TxWatcher] Failed to queue payslip for', r.walletAddress, ':', err));
            }

            // Discord webhook — fire-and-forget
            if (run.org.discordWebhookUrl) {
              sendDiscordWebhook(
                run.org.discordWebhookUrl,
                discordPayrollExecuted({
                  orgName:    run.org.name,
                  runLabel:   run.label,
                  total:      run.totalAmount?.toString() ?? '0',
                  token:      run.token,
                  txHash,
                  explorerUrl,
                  recipients: run.recipients.map((r) => r.fullName),
                }),
              );
            }

            console.log(`[TxWatcher] ✅ Run ${runId} complete — tx ${txHash}`);
            return;

          } else {
            // ❌ Transaction reverted
            const failedRun = await prisma.payrollRun.update({
              where:   { id: runId },
              data:    { status: 'failed', explorerUrl },
              include: { org: { select: { name: true, discordWebhookUrl: true } } },
            });
            if (failedRun.org.discordWebhookUrl) {
              sendDiscordWebhook(
                failedRun.org.discordWebhookUrl,
                discordPayrollFailed({ orgName: failedRun.org.name, runLabel: failedRun.label, txHash, explorerUrl }),
              );
            }
            console.error(`[TxWatcher] ❌ Run ${runId} failed — tx reverted`);
            return;
          }
        } catch (err) {
          console.error(`[TxWatcher] RPC error on attempt ${attempts}:`, err);
        }
      }

      // Timed out — mark as failed
      console.error(`[TxWatcher] ⏰ Run ${runId} timed out after ${TX_POLL_MAX_ATTEMPTS} attempts`);
      await prisma.payrollRun.update({
        where: { id: runId },
        data:  { status: 'failed' },
      });
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[TxWatcher] Job ${job?.id} failed:`, err.message);
  });

  console.log('[TxWatcher] Started — listening for tx watch jobs');
  return worker;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
