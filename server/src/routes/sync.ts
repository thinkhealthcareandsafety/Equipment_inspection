import { Router } from 'express';
import { z } from 'zod';
import type { Inspection } from '@think/shared';
import { audit, getDb, type Queryable } from '../db.ts';
import { isStaff, requireAuth, scope, type AuthUser } from '../lib/auth.ts';
import { toAsset, toBuilding, toClient, toFloor, toInspection, toLocation, toTeam } from '../lib/mappers.ts';
import { OpError, upsertInspection } from '../services/inspections.ts';

export const sync = Router();
sync.use(requireAuth);

/**
 * Incremental pull, in pages. Every table shares one change sequence, so a page is "the next PAGE changes
 * in order". This keeps each response far below the host's 4.5 MB limit however many inspections exist.
 */
const PAGE = 60;
sync.get('/pull', async (req, res) => {
  const db = await getDb();
  const u = req.user!;
  const since = Math.max(0, Number(req.query.since ?? 0) || 0);
  const head = Number((await db.query<{ v: string }>('SELECT last_value AS v FROM change_seq')).rows[0].v);
  const cid = u.role === 'client_admin' ? u.clientId : null;
  const own = (col: string) => (cid ? `AND ${col} = $3` : '');
  const ownParams = cid ? [cid] : [];

  // Where does this page end? The PAGE+1'th change tells us whether more remain.
  const seqs = (await db.query<{ seq: string }>(
    `SELECT seq FROM (
       SELECT seq FROM clients WHERE seq > $1 ${own('id')}
       UNION ALL SELECT seq FROM buildings WHERE seq > $1 ${own('client_id')}
       UNION ALL SELECT seq FROM floors WHERE seq > $1 ${own('client_id')}
       UNION ALL SELECT seq FROM locations WHERE seq > $1 ${own('client_id')}
       UNION ALL SELECT seq FROM assets WHERE seq > $1 ${own('client_id')}
       UNION ALL SELECT seq FROM inspections WHERE seq > $1 ${own('client_id')}
       UNION ALL SELECT seq FROM photos WHERE seq > $1 ${own('client_id')}
       UNION ALL SELECT seq FROM templates WHERE seq > $1
       UNION ALL SELECT seq FROM team_members WHERE seq > $1
       UNION ALL SELECT seq FROM notifications WHERE seq > $1 ${cid ? 'AND (client_id IS NULL OR client_id = $3)' : ''}
     ) c ORDER BY seq LIMIT $2`, [since, PAGE + 1, ...ownParams])).rows.map((r) => Number(r.seq));
  const hasMore = seqs.length > PAGE;
  const upTo = hasMore ? seqs[PAGE - 1] : head;

  const s = scope(u, 'client_id', 2);
  const sel = (table: string, scoped = true) =>
    db.query(`SELECT * FROM ${table} WHERE seq > $1 AND seq <= $2 ${scoped ? `AND ${s.sql}` : ''} ORDER BY seq`, [since, upTo, ...(scoped ? s.params : [])]);
  const cs = u.role === 'client_admin' ? { sql: 'id = $3', params: [u.clientId] } : { sql: 'true', params: [] };
  const [clients, buildings, floors, locations, assets, inspections, photos, templates, team, notifications] = await Promise.all([
    db.query(`SELECT * FROM clients WHERE seq > $1 AND seq <= $2 AND ${cs.sql}`, [since, upTo, ...cs.params]),
    sel('buildings'), sel('floors'), sel('locations'), sel('assets'), sel('inspections'),
    db.query(`SELECT id, inspection_id, client_id, check_no, mime, caption, created_by, created_at, seq FROM photos
              WHERE seq > $1 AND seq <= $2 AND ${s.sql}`, [since, upTo, ...s.params]),
    sel('templates', false),
    isStaff(u) ? sel('team_members', false) : Promise.resolve({ rows: [] }),
    db.query(`SELECT * FROM notifications WHERE seq > $1 AND seq <= $2 AND (client_id IS NULL OR ${s.sql}) ORDER BY seq`, [since, upTo, ...s.params]),
  ]);
  res.json({
    cursor: upTo,
    hasMore,
    full: since === 0,
    clients: clients.rows.map(toClient),
    buildings: buildings.rows.map(toBuilding),
    floors: floors.rows.map(toFloor),
    locations: locations.rows.map(toLocation),
    assets: assets.rows.map(toAsset),
    inspections: inspections.rows.map(toInspection),
    photos: photos.rows.map((r: any) => ({ id: r.id, inspectionId: r.inspection_id, checkNo: r.check_no, mime: r.mime, caption: r.caption,
      createdBy: r.created_by, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at })),
    templates: templates.rows.map((r: any) => ({ ...r.definition, active: r.active })),
    team: team.rows.map(toTeam),
    notifications: notifications.rows.map((r: any) => ({ id: r.id, clientId: r.client_id, assetId: r.asset_id, kind: r.kind, title: r.title,
      body: r.body, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at })),
  });
});

const Op = z.object({
  opId: z.string().min(8),
  type: z.enum(['inspection.upsert', 'photo.put', 'asset.update', 'floor.upsert', 'location.upsert', 'team.upsert']),
  clientAt: z.string().optional(),
  offline: z.boolean().optional(),
  payload: z.any(),
});
const Push = z.object({ deviceId: z.string().optional(), ops: z.array(Op).max(200) });

/** Applies queued offline operations in order. Each op is idempotent on opId. */
sync.post('/push', async (req, res) => {
  const parsed = Push.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Malformed sync request' });
  const u = req.user!;
  if (!isStaff(u)) return res.status(403).json({ error: 'Read-only access' });
  const db = await getDb();
  const results = [];
  for (const op of parsed.data.ops) {
    const meta = { deviceId: parsed.data.deviceId ?? null, clientAt: op.clientAt ?? null, offline: op.offline ?? false };
    try {
      const out = await db.tx(async (q) => {
        const done = await q.query<{ result: unknown }>('SELECT result FROM sync_ops WHERE op_id = $1', [op.opId]);
        if (done.rows.length) return done.rows[0].result;
        const r = await apply(q, u, op.type, op.payload, meta);
        await q.query('INSERT INTO sync_ops (op_id, user_id, result) VALUES ($1,$2,$3)', [op.opId, u.id, JSON.stringify(r)]);
        return r;
      });
      results.push({ opId: op.opId, ok: true, result: out });
    } catch (e) {
      const err = e as OpError;
      results.push({ opId: op.opId, ok: false, code: err.code ?? 'error', error: err.message, current: err.current ?? null });
      if (!(e instanceof OpError)) console.error('[sync]', op.type, e);
    }
  }
  res.json({ results });
});

type Meta = { deviceId: string | null; clientAt: string | null; offline: boolean };

async function apply(q: Queryable, u: AuthUser, type: string, p: any, meta: Meta): Promise<unknown> {
  switch (type) {
    case 'inspection.upsert':
      return upsertInspection(q, u, p.inspection as Inspection, p.baseRev ?? null, meta);

    case 'photo.put': {
      const insp = (await q.query<{ client_id: string; status: string }>('SELECT client_id, status FROM inspections WHERE id = $1', [p.inspectionId])).rows[0];
      if (!insp) throw new OpError('invalid', 'Photo belongs to an inspection that has not synced yet');
      const data = Buffer.from(String(p.data), 'base64');
      if (data.length > 8 * 1024 * 1024) throw new OpError('invalid', 'Photo too large');
      await q.query(`INSERT INTO photos (id, inspection_id, client_id, check_no, mime, caption, data, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [p.id, p.inspectionId, insp.client_id, p.checkNo ?? null, p.mime ?? 'image/jpeg', p.caption ?? '', data, u.id]);
      await audit(q, { user: u, action: 'photo.add', entityType: 'inspection', entityId: p.inspectionId, clientId: insp.client_id,
        changes: { photoId: p.id, checkNo: p.checkNo }, ...meta });
      return { id: p.id };
    }

    case 'asset.update': {
      const row = (await q.query('SELECT * FROM assets WHERE id = $1 FOR UPDATE', [p.id])).rows[0];
      if (!row) throw new OpError('not_found', 'Asset not found');
      const before = toAsset(row);
      const allowed = ['floorId', 'locationId', 'serialNumber', 'manufacturer', 'model', 'installDate', 'assetTag'] as const;
      const cols: Record<string, string> = { floorId: 'floor_id', locationId: 'location_id', serialNumber: 'serial_number',
        manufacturer: 'manufacturer', model: 'model', installDate: 'install_date', assetTag: 'asset_tag' };
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const sets: string[] = []; const params: unknown[] = [p.id];
      for (const k of allowed) {
        if (!(k in (p.patch ?? {}))) continue;
        const v = p.patch[k] === '' ? null : p.patch[k];
        if ((before as any)[k] === v) continue;
        changes[k] = { from: (before as any)[k], to: v };
        params.push(v); sets.push(`${cols[k]} = $${params.length}`);
      }
      // Clear data-quality flags that the field update resolves.
      const flags = new Set(before.dataFlags);
      const after = { ...before, ...Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.to])) };
      if (after.floorId) flags.delete('FLOOR_UNASSIGNED'); else flags.add('FLOOR_UNASSIGNED');
      if (after.serialNumber) flags.delete('SERIAL_MISSING');
      if (after.manufacturer) { flags.delete('MAKE_UNKNOWN'); flags.delete('MAKE_AMBIGUOUS'); }
      if (after.model) flags.delete('MODEL_UNKNOWN');
      if ('installDate' in changes && after.installDate) { flags.delete('AGE_UNKNOWN'); flags.delete('AGE_ESTIMATED'); flags.delete('AGE_AMBIGUOUS'); params.push(false); sets.push(`install_date_estimated = $${params.length}`); }
      params.push(JSON.stringify([...flags])); sets.push(`data_flags = $${params.length}`);
      if (!Object.keys(changes).length) return toAsset(row);
      await q.query(`UPDATE assets SET ${sets.join(', ')}, updated_at = now(), seq = nextval('change_seq') WHERE id = $1`, params);
      await audit(q, { user: u, action: 'asset.update', entityType: 'asset', entityId: p.id, clientId: before.clientId, changes, ...meta });
      return toAsset((await q.query('SELECT * FROM assets WHERE id = $1', [p.id])).rows[0]);
    }

    case 'floor.upsert': {
      const b = (await q.query<{ client_id: string }>('SELECT client_id FROM buildings WHERE id = $1', [p.buildingId])).rows[0];
      if (!b) throw new OpError('not_found', 'Building not found');
      await q.query(`INSERT INTO floors (id, building_id, client_id, name, sort_order, deleted) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET name = $4, sort_order = $5, deleted = $6, seq = nextval('change_seq')`,
        [p.id, p.buildingId, b.client_id, String(p.name).trim(), p.sortOrder ?? 0, !!p.deleted]);
      await audit(q, { user: u, action: p.deleted ? 'floor.delete' : 'floor.upsert', entityType: 'floor', entityId: p.id, clientId: b.client_id, changes: { name: p.name }, ...meta });
      return { id: p.id };
    }

    case 'location.upsert': {
      const f = (await q.query<{ building_id: string; client_id: string }>('SELECT building_id, client_id FROM floors WHERE id = $1', [p.floorId])).rows[0];
      if (!f) throw new OpError('not_found', 'Floor not found');
      await q.query(`INSERT INTO locations (id, floor_id, building_id, client_id, name, deleted) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET name = $5, deleted = $6, seq = nextval('change_seq')`,
        [p.id, p.floorId, f.building_id, f.client_id, String(p.name).trim(), !!p.deleted]);
      await audit(q, { user: u, action: p.deleted ? 'location.delete' : 'location.upsert', entityType: 'location', entityId: p.id, clientId: f.client_id, changes: { name: p.name }, ...meta });
      return { id: p.id };
    }

    case 'team.upsert': {
      const name = String(p.name ?? '').trim();
      if (!name) throw new OpError('invalid', 'Name is required');
      const prev = (await q.query('SELECT * FROM team_members WHERE id = $1', [p.id])).rows[0];
      // Deleting is a soft delete: past inspections keep the person's name and signature.
      await q.query(`INSERT INTO team_members (id, name, designation, phone, email, active) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET name=$2, designation=$3, phone=$4, email=$5, active=$6, seq=nextval('change_seq')`,
        [p.id, name, p.designation || 'Inspector', p.phone || null, p.email || null, p.active !== false]);
      await audit(q, { user: u, action: !prev ? 'team.add' : p.active === false ? 'team.remove' : 'team.update', entityType: 'team_member',
        entityId: p.id, changes: { name, designation: p.designation, before: prev ? toTeam(prev) : null }, ...meta });
      return { id: p.id };
    }
  }
  throw new OpError('invalid', `Unknown operation ${type}`);
}
