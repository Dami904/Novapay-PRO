import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Email (Gmail via Nodemailer)
  GMAIL_USER:         z.string().email('GMAIL_USER must be a valid email'),
  GMAIL_APP_PASSWORD: z.string().min(1, 'GMAIL_APP_PASSWORD is required'),

  // Blockchain
  MORPH_RPC_URL: z.string().default('https://rpc-hoodi.morphl2.io'),
  NOVAPAY_B2B_CONTRACT_ADDRESS: z.string().default('0x0000000000000000000000000000000000000000'),

  // Super Admin
  SUPER_ADMIN_JWT_SECRET: z.string().min(32, 'SUPER_ADMIN_JWT_SECRET must be at least 32 characters'),
  SUPER_ADMIN_EMAIL: z.string().email('SUPER_ADMIN_EMAIL must be a valid email'),
  ADMIN_SECRET: z.string().min(16, 'ADMIN_SECRET must be at least 16 characters'),

  // Frontend
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5173'),

});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`    ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
