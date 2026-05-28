import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';

import { env } from './config/env';
import prisma from './db/client';
import authRoutes   from './routes/auth/index';
import orgRoutes    from './routes/orgs/index';
import meRoutes     from './routes/me/index';
import adminRoutes  from './routes/admin/index';
import proofRoutes  from './routes/proof/index';
import { startEmailWorker }    from './workers/emailWorker';
import { startTxWatcherWorker } from './workers/txWatcher';
import { startScheduleWorker }  from './workers/scheduleWorker';

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

async function start() {
  // ── Plugins ───────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret: env.REFRESH_TOKEN_SECRET, // signs cookies
  });

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max CSV upload
  });

  // ── Routes ────────────────────────────────────────────────────────────────

  // Health check — used by Render to verify the service is alive
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }));

  // API v1 routes (registered below as they are built)
  app.register(async (v1) => {
    // Auth routes — signup, login, refresh, logout, wallet linking
    v1.register(authRoutes, { prefix: '/auth' });

    // Org + members + invitations + payroll runs + employees
    v1.register(orgRoutes, { prefix: '/orgs' });

    // Me — profile + notifications
    v1.register(meRoutes, { prefix: '/me' });

    // Admin — platform management (super-admin only)
    v1.register(adminRoutes, { prefix: '/admin' });

    // Proof — public payroll verification (no auth)
    v1.register(proofRoutes, { prefix: '/proof' });
  }, { prefix: '/api/v1' });

  // ── Start ─────────────────────────────────────────────────────────────────
  // ── Start background workers ──────────────────────────────────────────────
  startEmailWorker();
  startTxWatcherWorker();
  startScheduleWorker();

  // Keep Neon connection alive — ping every 4 minutes to prevent cold-start drops
  setInterval(async () => {
    try { await prisma.$queryRaw`SELECT 1` } catch { /* ignore */ }
  }, 4 * 60 * 1000);

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`\n🚀  NovaPay API running at http://localhost:${env.PORT}`);
    console.log(`📋  Health check: http://localhost:${env.PORT}/health\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
