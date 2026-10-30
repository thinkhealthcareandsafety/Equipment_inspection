import { Router } from 'express';
import { setTimeout as sleep } from 'node:timers/promises';
import multer from 'multer';
import { slugCode, uuid } from '@think/shared';
import { audit, getDb } from '../db.ts';
import { codeMatches, requireAuth, requireRole, scope, teamUser } from '../lib/auth.ts';
import { commitInventory, previewInventory } from '../services/inventory.ts';
import { runReminders } from '../services/reminders.ts';

export const api = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ---------- auth ----------
api.post('/auth/login', async (req, res) => {
  if (!codeMatches(req.body?.code)) {
    await sleep(600); // slows down guessing
    return res.status(401).json({ error: 'That code is not right' });
  }
  const user = teamUser(req.body?.name);
  const db = await getDb();
  await audit(db, { user, action: 'auth.unlock', entityType: 'device', changes: { name: user.name } });
  res.json({ token: String(req.body.code), user });
});

api.use(requireAuth);
api.get('/auth/me', (req, res) => res.json(req.user));

// ---------- photos ----------
api.get('/photos/:id', async (req, res) => {
  const db = await getDb();
  const s = scope(req.user!, 'client_id', 1);
  const r = (await db.query<{ data: Uint8Array; mime: string }>(`SELECT data, mime FROM photos WHERE id = $1 AND ${s.sql}`, [req.params.id, ...s.params])).rows[0];
  if (!r) return res.status(404).end();
  res.setHeader('Content-Type', r.mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.end(Buffer.from(r.data));
});

// ---------- inventory import ----------
api.post('/import/preview', requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach the inventory .xlsx file' });
  try {
    const r = await previewInventory(req.file.buffer);
    res.json({ ...r, units: r.units.slice(0, 2000) });
  } catch (e) { res.status(422).json({ error: (e as Error).message }); }
});

api.post('/import/commit', requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach the inventory .xlsx file' });
  const db = await getDb();
  const clientName = String(req.body.clientName ?? '').trim();
  let clientId = String(req.body.clientId ?? '');
  try {
    const result = await previewInventory(req.file.buffer);
    const out = await db.tx(async (q) => {
      let code: string;
      if (!clientId) {
        if (!clientName) throw new Error('Choose a client or enter a new client name');
        clientId = uuid(); code = slugCode(clientName, 4);
        await q.query('INSERT INTO clients (id, name, code) VALUES ($1,$2,$3)', [clientId, clientName, code]);
      } else {
        const c = (await q.query<{ code: string }>('SELECT code FROM clients WHERE id = $1', [clientId])).rows[0];
        if (!c) throw new Error('Client not found');
        code = c.code;
      }
      return commitInventory(q, { clientId, clientCode: code, filename: req.file!.originalname, result, user: req.user! });
    });
    res.json(out);
  } catch (e) { res.status(422).json({ error: (e as Error).message }); }
});

api.get('/import/batches', requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  res.json((await db.query('SELECT id, client_id, filename, created_at, summary FROM import_batches ORDER BY created_at DESC LIMIT 20')).rows);
});

// ---------- audit trail ----------
api.get('/audit', async (req, res) => {
  const db = await getDb();
  const u = req.user!;
  const params: unknown[] = [];
  const where: string[] = [];
  if (u.role === 'client_admin') { params.push(u.clientId); where.push(`client_id = $${params.length}`); }
  if (req.query.entityId) { params.push(String(req.query.entityId)); where.push(`entity_id = $${params.length}`); }
  if (req.query.action) { params.push(`${String(req.query.action)}%`); where.push(`action LIKE $${params.length}`); }
  params.push(Math.min(Number(req.query.limit ?? 200), 1000));
  const r = await db.query(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC LIMIT $${params.length}`, params);
  res.json(r.rows.map((x: any) => ({ ...x, at: x.at instanceof Date ? x.at.toISOString() : x.at })));
});

// ---------- reminders ----------
api.post('/reminders/run', requireRole('admin', 'reviewer'), async (_req, res) => {
  res.json(await runReminders());
});
