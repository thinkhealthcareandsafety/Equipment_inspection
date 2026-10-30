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
  equipment_type text NOT NULL CHECK (equipment_type IN ('wheelchair','scoop_stretcher','folding_stretcher','generic_stretcher')),
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

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','inspector','reviewer','client_admin')),
  client_id uuid REFERENCES clients(id), team_member_id uuid REFERENCES team_members(id),
  password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE IF NOT EXISTS sync_ops (
  op_id text PRIMARY KEY, user_id uuid, applied_at timestamptz NOT NULL DEFAULT now(), result jsonb
);
`;

async function migrate(q: Queryable) {
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await q.query(stmt);
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
