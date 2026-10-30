/**
 * Vercel serverless entry. The database is the hosted PostgreSQL in DATABASE_URL
 * (tables are created and the first inventory loaded during the build, see seed.ts).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.ts';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (!process.env.DATABASE_URL) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Database not connected. Add DATABASE_URL in the Vercel project settings, then redeploy.' }));
    return;
  }
  app(req as never, res as never);
}
