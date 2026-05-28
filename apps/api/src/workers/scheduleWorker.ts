import { Worker } from 'bullmq';
import { env } from '../config/env';
import prisma from '../db/client';
import { scheduleQueue } from './queue';
import { parsePayrollBuffer } from '../utils/csvParser';
import { createDraft } from '../services/payrollService';
import { getMemberContacts, notify } from '../services/notificationService';
import { ROLES } from '../config/constants';

// ── Next-occurrence calculator — no external date library needed ──────────────
function getNextRunAt(cadence: string, from: Date): Date {
  const next = new Date(from);
  switch (cadence) {
    case 'weekly':   next.setDate(next.getDate() + 7);    break;
    case 'biweekly': next.setDate(next.getDate() + 14);   break;
    case 'monthly':  next.setMonth(next.getMonth() + 1);  break;
    default:         next.setMonth(next.getMonth() + 1);  break;
  }
  return next;
}

export function startScheduleWorker() {
  const worker = new Worker(
    'schedule-checker',
    async () => {
      const now = new Date();

      // Find all active schedules that are due
      const dueSchedules = await prisma.payrollSchedule.findMany({
        where: { isActive: true, nextRunAt: { lte: now } },
      });

      if (dueSchedules.length === 0) {
        console.log('[ScheduleWorker] No due schedules found');
        return;
      }

      console.log(`[ScheduleWorker] Processing ${dueSchedules.length} due schedule(s)`);

      for (const schedule of dueSchedules) {
        try {
          if (!schedule.csvRaw) {
            console.warn(`[ScheduleWorker] Schedule ${schedule.id} has no CSV template — skipping`);
            continue;
          }

          // Parse the stored template CSV
          const buffer   = Buffer.from(schedule.csvRaw, 'utf-8');
          const filename = schedule.csvFilename ?? 'schedule-template.csv';
          const parsed   = parsePayrollBuffer(buffer, filename);

          if (parsed.hasErrors) {
            console.error(`[ScheduleWorker] CSV parse errors on schedule ${schedule.id} — skipping`);
            continue;
          }

          // Auto-label: append the current month/year so each draft is distinct
          const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
          const runLabel   = `${schedule.label} — ${monthLabel}`;

          // Create the draft payroll run (same as HR uploading manually)
          const run = await createDraft({
            orgId:       schedule.orgId,
            label:       runLabel,
            token:       schedule.token,
            createdBy:   schedule.createdBy,
            recipients:  parsed.recipients,
            csvRaw:      schedule.csvRaw,
            csvFilename: filename,
          });

          // Advance nextRunAt to the next occurrence
          await prisma.payrollSchedule.update({
            where: { id: schedule.id },
            data:  { nextRunAt: getNextRunAt(schedule.cadence, schedule.nextRunAt) },
          });

          // Notify all members so they know a draft is ready for review
          const contacts = await getMemberContacts(schedule.orgId, [
            ROLES.OWNER, ROLES.ADMIN, ROLES.FINANCE, ROLES.HR,
          ]);

          await notify({
            orgId:        schedule.orgId,
            userIds:      contacts.map((c) => c.userId),
            type:         'payroll_draft_auto_created',
            title:        `Scheduled payroll draft created: "${runLabel}"`,
            body:         `A new draft was automatically generated from your recurring schedule. Review and submit for approval.`,
            resourceType: 'payroll_run',
            resourceId:   run.id,
          });

          console.log(`[ScheduleWorker] ✅ Created draft run "${runLabel}" (${run.id}) for org ${schedule.orgId}`);
        } catch (err) {
          console.error(`[ScheduleWorker] Failed to process schedule ${schedule.id}:`, err);
        }
      }
    },
    {
      connection:  { url: env.REDIS_URL },
      concurrency: 1,  // schedule checks are sequential — avoids duplicate drafts
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[ScheduleWorker] Job ${job?.id} failed:`, err.message);
  });

  // Register the hourly repeating job.
  // BullMQ deduplicates by jobId — safe to call on every startup.
  scheduleQueue
    .add('check-due-schedules', {}, {
      jobId:  'hourly-schedule-check',          // stable ID prevents duplicates on restart
      repeat: { pattern: '0 * * * *' },         // top of every hour
    })
    .then(() => console.log('[ScheduleWorker] Started — checking due schedules every hour'))
    .catch((err) => console.error('[ScheduleWorker] Failed to register repeating job:', err));

  return worker;
}
