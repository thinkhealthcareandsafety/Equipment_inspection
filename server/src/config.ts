import { fileURLToPath } from 'node:url';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? '',
  poolMax: Number(env.PG_POOL_MAX ?? 3), // serverless instances are many and short-lived: keep each one small
  pgliteDir: env.PGLITE_DIR ?? '.data/pglite',
  // One shared password opens the app. Set ACCESS_CODE to change it.
  accessCode: env.ACCESS_CODE ?? '9999',
  smtpUrl: env.SMTP_URL ?? '', // e.g. smtps://user:pass@smtp.zoho.in:465
  mailFrom: env.MAIL_FROM ?? 'Think Healthcare and Safety <no-reply@example.com>',
  reminderCron: env.REMINDER_CRON ?? '30 8 * * *', // 08:30 daily
  timezone: env.TZ_NAME ?? 'Asia/Kolkata',
  demoPassword: env.DEMO_PASSWORD ?? 'Think@2026',
  // Live deployments load the inventory and team only; local runs also add the paper-sample demo inspections.
  seedMode: env.SEED_MODE ?? (env.VERCEL || env.NODE_ENV === 'production' ? 'production' : 'demo'),
  // fileURLToPath (not URL.pathname) so Windows paths like C:\... resolve correctly
  clientDist: env.CLIENT_DIST ?? fileURLToPath(new URL('../../client/dist', import.meta.url)),
};

