import express from 'express';
import cron from 'node-cron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { getDb } from './db.ts';
import { seedIfEmpty } from './seed.ts';
import { runReminders } from './services/reminders.ts';

const app = createApp();

// Serve the built PWA (single deployable). Registered after the API so /api/* is never shadowed.
if (existsSync(config.clientDist)) {
  const spa = express.Router();
  spa.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  spa.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  app.use(spa);
}

await getDb();
await seedIfEmpty();
cron.schedule(config.reminderCron, () => { runReminders().catch((e) => console.error('[reminders]', e)); }, { timezone: config.timezone });
await runReminders().catch((e) => console.error('[reminders]', e));

app.listen(config.port, () => console.log(`Think Inspect API on http://localhost:${config.port}`));
