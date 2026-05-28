import { Queue } from 'bullmq';
import { env } from '../config/env';

const connection = { url: env.REDIS_URL };

// ── Email queue — all outbound emails go through here ─────────────────────────
export const emailQueue = new Queue('emails', {
  connection,
  defaultJobOptions: {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail:     50,
  },
});

// ── Tx watcher queue — watches for on-chain confirmation ──────────────────────
export const txWatcherQueue = new Queue('tx-watcher', {
  connection,
  defaultJobOptions: {
    attempts:    1,             // the worker loops internally — no BullMQ retries
    removeOnComplete: 100,
    removeOnFail:     50,
  },
});

// ── Schedule checker queue — fires hourly to auto-create draft payroll runs ───
export const scheduleQueue = new Queue('schedule-checker', {
  connection,
  defaultJobOptions: {
    attempts:         1,
    removeOnComplete: 10,
    removeOnFail:     10,
  },
});

export type EmailJobData =
  | { type: 'payroll_submitted'; to: string | string[]; subject: string; html: string }
  | { type: 'payroll_approved';  to: string | string[]; subject: string; html: string }
  | { type: 'payroll_rejected';  to: string | string[]; subject: string; html: string }
  | { type: 'payroll_executed';  to: string | string[]; subject: string; html: string }
  | { type: 'invitation';        to: string | string[]; subject: string; html: string };

export type TxWatcherJobData = {
  runId:   string;
  txHash:  string;
  orgId:   string;
};
