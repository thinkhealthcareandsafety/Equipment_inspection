/**
 * Database access. Production uses PostgreSQL (DATABASE_URL). With no
 * DATABASE_URL the server runs on an embedded PGlite instance (real Postgres
 * compiled to WASM, persisted to ./.data) so the app works with zero installs.
 * Both expose the same query(text, params) → { rows } contract.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  if (config.databaseUrl) {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: config.databaseUrl, max: config.poolMax, idleTimeoutMillis: 10_000 });
    db = {
      query: (text, params) => pool.query(text, params as unknown[]) as never,
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn({ query: (t, p) => c.query(t, p as unknown[]) as never });
          await c.query('COMMIT');
          return r;
        } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = config.pgliteDir === 'memory://' ? 'memory://' : path.resolve(config.pgliteDir);
    if (dir !== 'memory://') mkdirSync(dir, { recursive: true });
    const lite = await PGlite.create(dir);
    let chain: Promise<unknown> = Promise.resolve();
    db = {
      query: (text, params) => lite.query(text, params) as never,
      // PGlite is single-connection; serialise transactions.
      tx(fn) {
        const run = chain.then(() => lite.transaction((t) => fn({ query: (q, p) => t.query(q, p) as never })));
        chain = run.catch(() => undefined);
        return run;
      },
      close: () => lite.close(),
    };
  }
  await migrate(db);
  return db;
}

const SCHEMA = /* sql */ `
CREATE SEQUENCE IF NOT EXISTS change_seq;

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY, name text NOT NULL, code text NOT NULL UNIQUE,
  settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);

CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES clients(id),
  name text NOT NULL, city text NOT NULL, code text NOT NULL, address text, notes text,
  seq bigint NOT NULL DEFAULT nextval('change_seq'),
  UNIQUE (client_id, city, name)
);

CREATE TABLE IF NOT EXISTS floors (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings(id), client_id uuid NOT NULL,
  name text NOT NULL, sort_order int NOT NULL DEFAULT 0, deleted boolean NOT NULL DEFAULT false,
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY, floor_id uuid NOT NULL REFERENCES floors(id), building_id uuid NOT NULL, client_id uuid NOT NULL,
  name text NOT NULL, deleted boolean NOT NULL DEFAULT false,
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  building_id uuid NOT NULL REFERENCES buildings(id),
  floor_id uuid REFERENCES floors(id),
  location_id uuid REFERENCES locations(id),
  equipment_type text NOT NULL CHECK (equipment_type IN ('wheelchair','scoop_stretcher','folding_stretcher')),
  asset_tag text NOT NULL,
  serial_number text, manufacturer text, model text,
  candidate_makes jsonb NOT NULL DEFAULT '[]',
  install_date text, install_date_estimated boolean NOT NULL DEFAULT false, age_raw text,
  status text NOT NULL DEFAULT 'in_service', status_reason text,
  data_flags jsonb NOT NULL DEFAULT '[]',
  open_defects jsonb NOT NULL DEFAULT '[]',
  last_inspection_id uuid, last_inspection_date text, last_result text,
  next_due_date text, previous_maintenance_date text,
  import_key text, import_batch_id uuid, import_source jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL DEFAULT nextval('change_seq'),
  UNIQUE (client_id, asset_tag),
  UNIQUE (client_id, import_key)
);
CREATE INDEX IF NOT EXISTS assets_building ON assets(building_id);
CREATE INDEX IF NOT EXISTS assets_seq ON assets(seq);

CREATE TABLE IF NOT EXISTS templates (
  id text NOT NULL, version int NOT NULL, definition jsonb NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL DEFAULT nextval('change_seq'),
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY, name text NOT NULL, designation text NOT NULL DEFAULT 'Inspector',
  phone text, email text, active boolean NOT NULL DEFAULT true,
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);

CREATE TABLE IF NOT EXISTS inspections (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  building_id uuid NOT NULL REFERENCES buildings(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  template_id text NOT NULL, template_version int NOT NULL,
  kind text NOT NULL DEFAULT 'routine', retest_of uuid,
  status text NOT NULL DEFAULT 'draft',
  inspection_date text,
  doc jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rev int NOT NULL DEFAULT 1,
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);
CREATE INDEX IF NOT EXISTS inspections_asset ON inspections(asset_id);
CREATE INDEX IF NOT EXISTS inspections_seq ON inspections(seq);

CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY, inspection_id uuid NOT NULL, client_id uuid NOT NULL, check_no int,
  mime text NOT NULL, caption text NOT NULL DEFAULT '', data bytea NOT NULL,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
  user_id uuid, user_name text, role text,
  action text NOT NULL, entity_type text NOT NULL, entity_id text,
  client_id uuid, changes jsonb, device_id text, client_at text, offline boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_log(entity_id);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY, client_id uuid, asset_id uuid, kind text NOT NULL,
  title text NOT NULL, body text NOT NULL, dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), emailed_at timestamptz,
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY, client_id uuid NOT NULL, filename text NOT NULL, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), summary jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY, client_id uuid NOT NULL, building_id uuid NOT NULL REFERENCES buildings(id),
  visit_date text NOT NULL, inspector text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned', created_by uuid, created_by_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);
CREATE INDEX IF NOT EXISTS visits_seq ON visits(seq);

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS contacts jsonb NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY, client_id uuid NOT NULL, building_id uuid NOT NULL REFERENCES buildings(id),
  kind text NOT NULL DEFAULT 'purchase_order', number text NOT NULL DEFAULT '', doc_date text, note text NOT NULL DEFAULT '',
  file_name text, mime text, size int, data bytea,
  created_by uuid, created_by_name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  seq bigint NOT NULL DEFAULT nextval('change_seq')
);
CREATE INDEX IF NOT EXISTS documents_seq ON documents(seq);

CREATE TABLE IF NOT EXISTS app_flags (
  key text PRIMARY KEY, value jsonb, at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_ops (
  op_id text PRIMARY KEY, user_id uuid, applied_at timestamptz NOT NULL DEFAULT now(), result jsonb
);
`;

async function migrate(d: Db) {
  for (const stmt of SCHEMA.split(';').map((x) => x.trim()).filter(Boolean)) await d.query(stmt);
  await retireGenericStretcher(d);
  await clearTrialInspections(d);
}

/**
 * Going live (November 2026). Every inspection recorded before this version first starts in production was a
 * trial. Once, and in production only, they are discarded (soft delete: kept on the server for the audit trail,
 * hidden on every device after its next sync) and their units go back to "never inspected", exactly as imported.
 * The app_flags row makes it run once; claiming it inside the transaction stops two cold starts doing it twice.
 * CLEAR_TRIAL_INSPECTIONS=1 runs it elsewhere (local testing).
 */
export async function clearTrialInspections(d: Db, force = false) {
  if (!force && process.env.VERCEL_ENV !== 'production' && process.env.CLEAR_TRIAL_INSPECTIONS !== '1') return null;
  return d.tx(async (q) => {
    const claimed = await q.query(`INSERT INTO app_flags (key, value) VALUES ('trial_inspections_cleared', '{}') ON CONFLICT (key) DO NOTHING RETURNING key`);
    if (!claimed.rows.length) return null;
    const before = (await q.query<{ id: string; asset_id: string; status: string; inspection_date: string | null }>(
      `SELECT id, asset_id, status, inspection_date FROM inspections WHERE status <> 'discarded' AND created_at < now()`)).rows;
    const assetsBefore = (await q.query(
      `SELECT id, asset_tag, status, status_reason, open_defects, last_inspection_id, last_inspection_date, last_result, next_due_date, previous_maintenance_date
       FROM assets WHERE last_inspection_id IS NOT NULL OR open_defects <> '[]'::jsonb OR status = 'retest_required'
         OR id IN (SELECT asset_id FROM inspections WHERE created_at < now())`)).rows;
    await q.query(`UPDATE inspections SET status = 'discarded', doc = jsonb_set(doc, '{status}', '"discarded"'), updated_at = now(), seq = nextval('change_seq')
      WHERE status <> 'discarded' AND created_at < now()`);
    await q.query(`UPDATE assets SET
        status = CASE WHEN data_flags @> '["TAKEN_FOR_REPLACEMENT"]'::jsonb THEN 'out_of_service' ELSE 'in_service' END,
        status_reason = CASE WHEN data_flags @> '["TAKEN_FOR_REPLACEMENT"]'::jsonb THEN 'Inventory notes this unit was taken for replacement' ELSE NULL END,
        open_defects = '[]', last_inspection_id = NULL, last_inspection_date = NULL, last_result = NULL, next_due_date = NULL,
        previous_maintenance_date = NULL, updated_at = now(), seq = nextval('change_seq')
      WHERE id = ANY($1::uuid[])`, [assetsBefore.map((a: any) => a.id)]);
    const summary = { inspections: before.length, assets: assetsBefore.length };
    await q.query(`UPDATE app_flags SET value = $1 WHERE key = 'trial_inspections_cleared'`, [JSON.stringify(summary)]);
    await audit(q, { action: 'trial.clear', entityType: 'system', changes: { ...summary, inspections: before, assets: assetsBefore } });
    console.log(`[go-live] Cleared ${before.length} trial inspection(s); ${assetsBefore.length} unit(s) back to never inspected.`);
    return summary;
  });
}

/**
 * There are three products. Earlier builds had a fourth, a plain "Stretcher". Move those units to Foldable
 * Stretcher (flagged as inferred) and, where nothing has been inspected yet, renumber their asset IDs to match.
 * Safe to run repeatedly.
 */
async function retireGenericStretcher(q: Queryable) {
  await q.query(`DELETE FROM templates WHERE id = 'generic_stretcher'`);
  const legacy = (await q.query<{ id: string; building_id: string; asset_tag: string; data_flags: string[] }>(
    `SELECT id, building_id, asset_tag, data_flags FROM assets WHERE equipment_type = 'generic_stretcher' ORDER BY building_id, asset_tag`)).rows;
  if (!legacy.length) return;
  const next = new Map<string, number>();
  for (const a of legacy) {
    if (!next.has(a.building_id)) {
      const tags = (await q.query<{ asset_tag: string }>(`SELECT asset_tag FROM assets WHERE building_id = $1 AND equipment_type = 'folding_stretcher'`, [a.building_id])).rows;
      next.set(a.building_id, Math.max(0, ...tags.map((t) => Number(t.asset_tag.match(/-(\d+)$/)?.[1] ?? 0))));
    }
    const inspected = (await q.query(`SELECT 1 FROM inspections WHERE asset_id = $1 LIMIT 1`, [a.id])).rows.length > 0;
    let tag = a.asset_tag;
    if (!inspected && /-ST-\d+$/.test(tag)) { const n = (next.get(a.building_id) ?? 0) + 1; next.set(a.building_id, n); tag = tag.replace(/-ST-\d+$/, `-FS-${String(n).padStart(3, '0')}`); }
    const flags = [...new Set([...(a.data_flags ?? []), 'TYPE_INFERRED'])];
    await q.query(`UPDATE assets SET equipment_type = 'folding_stretcher', asset_tag = $2, data_flags = $3, updated_at = now(), seq = nextval('change_seq') WHERE id = $1`,
      [a.id, tag, JSON.stringify(flags)]);
  }
}

export async function audit(q: Queryable, e: {
  user?: { id: string; name: string; role: string } | null; action: string; entityType: string; entityId?: string | null;
  clientId?: string | null; changes?: unknown; deviceId?: string | null; clientAt?: string | null; offline?: boolean;
}) {
  await q.query(
    `INSERT INTO audit_log (user_id,user_name,role,action,entity_type,entity_id,client_id,changes,device_id,client_at,offline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [e.user?.id ?? null, e.user?.name ?? 'system', e.user?.role ?? 'system', e.action, e.entityType, e.entityId ?? null,
      e.clientId ?? null, e.changes == null ? null : JSON.stringify(e.changes), e.deviceId ?? null, e.clientAt ?? null, e.offline ?? false],
  );
}
