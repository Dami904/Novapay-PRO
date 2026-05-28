import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt      from '@fastify/jwt';
import fastifyCookie   from '@fastify/cookie';
import fastifyCors     from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import { env }         from '../../config/env';
import prisma          from '../../db/client';
import authRoutes      from '../../routes/auth/index';
import orgRoutes       from '../../routes/orgs/index';
import meRoutes        from '../../routes/me/index';
import adminRoutes     from '../../routes/admin/index';
import proofRoutes     from '../../routes/proof/index';

// Singleton — one app instance per process (avoids repeated plugin registration)
let _app: FastifyInstance | null = null;

/**
 * Build and return the Fastify app with all plugins and routes registered
 * but WITHOUT starting background workers (email, txWatcher, schedule) or
 * binding to any port. Safe to call multiple times — returns the cached instance.
 *
 * IMPORTANT: Call vi.mock('../../workers/queue', ...) at the top of every test
 * file that imports this helper to prevent BullMQ from connecting to Redis.
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  if (_app) return _app;

  const app = Fastify({ logger: false });

  // ── Plugins (mirror server.ts exactly) ──────────────────────────────────────
  await app.register(fastifyCors, {
    origin:      env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret: env.REFRESH_TOKEN_SECRET,
  });

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  // High limit so tests never hit the rate cap
  await app.register(fastifyRateLimit, {
    max:        100_000,
    timeWindow: '1 minute',
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', env: env.NODE_ENV }));

  // ── Routes ───────────────────────────────────────────────────────────────────
  app.register(async (v1) => {
    v1.register(authRoutes,  { prefix: '/auth' });
    v1.register(orgRoutes,   { prefix: '/orgs' });
    v1.register(meRoutes,    { prefix: '/me' });
    v1.register(adminRoutes, { prefix: '/admin' });
    v1.register(proofRoutes, { prefix: '/proof' });
  }, { prefix: '/api/v1' });

  await app.ready();

  // Warm up the Neon serverless connection so it isn't cold-starting mid-suite.
  // Neon free tier pools can drop idle connections; a cheap ping here means the
  // first real DB call in any test file won't hit a "can't reach server" error.
  await prisma.$queryRaw`SELECT 1`;

  _app = app;
  return app;
}

/** Close and release the cached app. Call in globalTeardown if needed. */
export async function closeTestApp(): Promise<void> {
  if (_app) {
    await _app.close();
    _app = null;
  }
}
