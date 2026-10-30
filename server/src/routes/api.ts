import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { setTimeout as sleep } from 'node:timers/promises';
import multer from 'multer';
import { z } from 'zod';
import { slugCode, uuid, type Role } from '@think/shared';
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

// ---------- users ----------
api.get('/users', requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  res.json((await db.query('SELECT id, email, name, role, client_id, team_member_id, active, created_at FROM users ORDER BY role, name')).rows);
});

const NewUser = z.object({
  email: z.string().email(), name: z.string().min(2), role: z.enum(['admin', 'inspector', 'reviewer', 'client_admin']),
  clientId: z.string().uuid().nullable().optional(), password: z.string().min(8),
});
api.post('/users', requireRole('admin'), async (req, res) => {
  const p = NewUser.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  if (p.data.role === 'client_admin' && !p.data.clientId) return res.status(400).json({ error: 'Client admins must belong to a client' });
  const db = await getDb();
  const id = uuid();
  try {
    await db.tx(async (q) => {
      let teamId: string | null = null;
      if (p.data.role === 'inspector' || p.data.role === 'reviewer') {
        // Reuse a team member with the same name (e.g. the pre-loaded inspectors) so the picker never shows duplicates.
        const existing = (await q.query<{ id: string }>('SELECT id FROM team_members WHERE lower(name) = lower($1) AND active LIMIT 1', [p.data.name])).rows[0];
        if (existing) {
          teamId = existing.id;
          await q.query(`UPDATE team_members SET email = $2, seq = nextval('change_seq') WHERE id = $1`, [teamId, p.data.email]);
        } else {
          teamId = uuid();
          await q.query('INSERT INTO team_members (id, name, designation, email) VALUES ($1,$2,$3,$4)',
            [teamId, p.data.name, p.data.role === 'reviewer' ? 'Reviewer' : 'Inspector', p.data.email]);
        }
      }
      await q.query('INSERT INTO users (id, email, name, role, client_id, team_member_id, password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, p.data.email, p.data.name, p.data.role as Role, p.data.role === 'client_admin' ? p.data.clientId : null, teamId, await bcrypt.hash(p.data.password, 10)]);
      await audit(q, { user: req.user!, action: 'user.create', entityType: 'user', entityId: id, changes: { email: p.data.email, role: p.data.role } });
    });
    res.json({ id });
  } catch (e) { res.status(409).json({ error: /unique/i.test((e as Error).message) ? 'That email is already registered' : (e as Error).message }); }
});

api.patch('/users/:id', requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const active = !!req.body.active;
  if (req.params.id === req.user!.id && !active) return res.status(400).json({ error: 'You cannot deactivate yourself' });
  await db.query('UPDATE users SET active = $2 WHERE id = $1', [req.params.id, active]);
  await audit(db, { user: req.user!, action: active ? 'user.activate' : 'user.deactivate', entityType: 'user', entityId: req.params.id });
  res.json({ ok: true });
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
