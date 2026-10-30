import express from 'express';
import compression from 'compression';
import cors from 'cors';
import cron from 'node-cron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { getDb } from './db.ts';
import { api } from './routes/api.ts';
import { sync } from './routes/sync.ts';
import { seedIfEmpty } from './seed.ts';
import { runReminders } from './services/reminders.ts';

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '25mb' })); // photo uploads arrive base64-encoded in sync batches

app.get('/api/health', (_req, res) => res.json({ ok: true, db: config.databaseUrl ? 'postgres' : 'pglite' }));
app.use('/api/sync', sync);
app.use('/api', api);

// Serve the built PWA in production (single deployable).
if (existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

await getDb();
await seedIfEmpty();
cron.schedule(config.reminderCron, () => { runReminders().catch((e) => console.error('[reminders]', e)); }, { timezone: config.timezone });
await runReminders().catch((e) => console.error('[reminders]', e));

app.listen(config.port, () => console.log(`Think Inspect API on http://localhost:${config.port}`));
