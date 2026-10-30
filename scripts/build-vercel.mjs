/**
 * Builds the full app for Vercel using the Build Output API:
 *   .vercel/output/static            the PWA (client/dist)
 *   .vercel/output/functions/api.func  the Express API as one bundled function
 * Then prepares the database (creates tables, loads the inventory the first time,
 * creates the administrator from ADMIN_EMAIL / ADMIN_PASSWORD).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const run = (cmd, args, env = {}) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
const out = '.vercel/output';

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/functions/api.func`, { recursive: true });

// 1. Client
run('npm', ['run', 'build', '-w', 'client'], { VITE_DEMO: '0' });
cpSync('client/dist', `${out}/static`, { recursive: true });

// 2. API function (ESM bundle; pglite is only for local use and stays out of the function)
await build({
  entryPoints: ['server/src/vercel.ts'],
  outfile: `${out}/functions/api.func/index.mjs`,
  bundle: true, platform: 'node', format: 'esm', target: 'node22', minify: false, sourcemap: false,
  external: ['@electric-sql/pglite', 'pg-native'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
writeFileSync(`${out}/functions/api.func/.vc-config.json`, JSON.stringify({
  runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', maxDuration: 30,
}));
writeFileSync(`${out}/functions/api.func/package.json`, JSON.stringify({ type: 'module' }));

// 3. Routes: /api/* to the function, everything else to the PWA (single-page app fallback)
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '/api/(.*)', dest: '/api' },
    { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
  crons: [{ path: '/api/cron/reminders', schedule: '0 3 * * *' }], // 08:30 India time
}));

// 4. Database
if (process.env.DATABASE_URL) {
  run('npx', ['tsx', 'server/src/seed.ts'], { SEED_MODE: process.env.SEED_MODE ?? 'production' });
} else {
  console.warn('\n[build] DATABASE_URL is not set: the site will build, but the API will say "Database not connected".\n        Add a Postgres database (Vercel → Storage → Neon) and redeploy.\n');
}
