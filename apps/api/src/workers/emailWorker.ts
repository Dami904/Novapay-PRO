import { Worker } from 'bullmq';
import { env } from '../config/env';
import { sendEmail } from '../services/emailService';
import type { EmailJobData } from './queue';

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>(
    'emails',
    async (job) => {
      const { to, subject, html } = job.data;
      await sendEmail({ to, subject, html });
      console.log(`[EmailWorker] Sent "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[EmailWorker] Started — listening for email jobs');
  return worker;
}
