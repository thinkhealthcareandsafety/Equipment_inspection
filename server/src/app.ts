import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { config } from './config.ts';
import { api } from './routes/api.ts';
import { sync } from './routes/sync.ts';
import { runReminders } from './services/reminders.ts';

/** The API, with no listening, scheduling or static files, so it can run as a local server or a serverless function. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(cors());
  app.use(express.json({ limit: '25mb' })); // photo uploads arrive base64-encoded in sync batches

  app.get('/api/health', (_req, res) => res.json({ ok: true, db: config.databaseUrl ? 'postgres' : 'pglite' }));

  // Called daily by the host's scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
  app.get('/api/cron/reminders', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not authorised' });
    res.json(await runReminders());
  });

  app.use('/api/sync', sync);
  app.use('/api', api);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error' });
  });
  return app;
}
