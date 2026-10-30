/**
 * Seeds an empty database: checklist templates, the JLL client and its FLS
 * inventory (331 units), the inspection team, demo logins, and the two paper
 * sample forms digitised (NKP Mumbai, 10th Floor).
 *
 *   npm run seed            – seed if empty
 *   npm run seed -- --reset – wipe the embedded database first
 */
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import bcrypt from 'bcryptjs';
import {
  addDays, applyDerivedResult, DEFAULT_TEMPLATES, emptyChecks, nextDueFrom, todayISO, uuid,
  type Asset, type CheckStatus, type Inspection,
} from '@think/shared';
import { audit, getDb } from './db.ts';
import { config } from './config.ts';
import { readGrid } from './lib/xlsx.ts';
import { importInventory } from '@think/shared';
import { commitInventory } from './services/inventory.ts';
import { upsertInspection } from './services/inspections.ts';
import { toAsset } from './lib/mappers.ts';
import type { AuthUser } from './lib/auth.ts';

const INVENTORY = new URL('./data/FLS Equipment - INDIA.xlsx', import.meta.url);

export const TEAM = [
  { name: 'Ashish Dalal', email: 'ashish.dalal@think-hs.demo', designation: 'Inspector' },
  { name: 'Shikha Dixit', email: 'shikha.dixit@think-hs.demo', designation: 'Inspector' },
  { name: 'Sumit Shah', email: 'sumit.shah@think-hs.demo', designation: 'Inspector' },
];

export async function seedIfEmpty(): Promise<boolean> {
  const db = await getDb();
  const live = config.seedMode === 'production';
  const n = Number((await db.query<{ n: string }>('SELECT count(*) AS n FROM clients')).rows[0].n);
  if (n > 0) return false;
  console.log(`[seed] Empty database — seeding templates, inventory and ${live ? 'team (live mode, no demo logins)' : 'demo data'}…`);
  const hash = await bcrypt.hash(config.demoPassword, 10);

  for (const t of Object.values(DEFAULT_TEMPLATES)) {
    await db.query('INSERT INTO templates (id, version, definition) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [t.id, t.version, JSON.stringify(t)]);
  }

  const clientId = uuid();
  await db.query('INSERT INTO clients (id, name, code) VALUES ($1,$2,$3)', [clientId, 'JLL', 'JLL']);

  const { sheetName, grid } = await readGrid(await readFile(INVENTORY));
  const result = importInventory(grid, { sheetName });
  const imported = await db.tx((q) => commitInventory(q, { clientId, clientCode: 'JLL', filename: 'FLS Equipment - INDIA.xlsx', result, user: null }));
  console.log(`[seed] Imported ${imported.created} assets across ${imported.sites.length} sites (as of ${imported.asOfDate}).`);

  if (live) {
    // Inspectors appear in the Technician picker straight away.
    for (const m of TEAM) await db.query('INSERT INTO team_members (id, name, designation) VALUES ($1,$2,$3)', [uuid(), m.name, m.designation]);
    await audit(db, { action: 'seed', entityType: 'system', changes: { assets: imported.created, mode: 'production' } });
    console.log('[seed] Done (live mode).');
    return true;
  }

  const users: Record<string, AuthUser> = {};
  const addUser = async (key: string, email: string, name: string, role: AuthUser['role'], opts: { clientId?: string; designation?: string } = {}) => {
    let teamMemberId: string | null = null;
    if (role === 'inspector' || role === 'reviewer') {
      teamMemberId = uuid();
      await db.query('INSERT INTO team_members (id, name, designation, email) VALUES ($1,$2,$3,$4)', [teamMemberId, name, opts.designation ?? 'Inspector', email]);
    }
    const id = uuid();
    await db.query('INSERT INTO users (id, email, name, role, client_id, team_member_id, password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, email, name, role, opts.clientId ?? null, teamMemberId, hash]);
    users[key] = { id, email, name, role, clientId: opts.clientId ?? null, teamMemberId };
  };
  for (const m of TEAM) await addUser(m.name, m.email, m.name, 'inspector', { designation: m.designation });
  await addUser('reviewer', 'reviewer@think-hs.demo', 'Technical Reviewer', 'reviewer', { designation: 'Reviewer' });
  await addUser('admin', 'admin@think-hs.demo', 'Think Administrator', 'admin');
  await addUser('client', 'jll.admin@jll.demo', 'JLL Facilities Admin', 'client_admin', { clientId });

  await seedPaperSamples(clientId, users['Ashish Dalal'], users.reviewer);
  await audit(db, { action: 'seed', entityType: 'system', changes: { assets: imported.created } });
  console.log(`[seed] Done. Demo password for all *.demo accounts: ${config.demoPassword}`);
  return true;
}

/** The two photographed paper forms, entered as the app would have captured them. */
async function seedPaperSamples(clientId: string, tech: AuthUser, reviewer: AuthUser) {
  const db = await getDb();
  const nkp = (await db.query<{ id: string }>(`SELECT id FROM buildings WHERE client_id = $1 AND name = 'NKP'`, [clientId])).rows[0];
  if (!nkp) return;
  const floorId = uuid();
  await db.query('INSERT INTO floors (id, building_id, client_id, name, sort_order) VALUES ($1,$2,$3,$4,$5)', [floorId, nkp.id, clientId, '10th Floor', 10]);
  for (const [i, name] of ['Ground Floor', '1st Floor', '2nd Floor'].entries()) {
    await db.query('INSERT INTO floors (id, building_id, client_id, name, sort_order) VALUES ($1,$2,$3,$4,$5)', [uuid(), nkp.id, clientId, name, i]);
  }
  const pick = async (type: string, n: number): Promise<Asset[]> => {
    const rows = (await db.query(`SELECT * FROM assets WHERE building_id = $1 AND equipment_type = $2 ORDER BY asset_tag LIMIT $3`, [nkp.id, type, n])).rows;
    for (const r of rows) {
      const flags = (r.data_flags as string[]).filter((f) => f !== 'FLOOR_UNASSIGNED');
      await db.query(`UPDATE assets SET floor_id = $2, data_flags = $3, seq = nextval('change_seq') WHERE id = $1`, [r.id, floorId, JSON.stringify(flags)]);
    }
    return (await db.query(`SELECT * FROM assets WHERE id = ANY($1)`, [rows.map((r) => r.id)])).rows.map(toAsset);
  };
  const [wheelchair] = await pick('wheelchair', 1);
  const scoops = await pick('scoop_stretcher', 3);
  const date = addDays(todayISO(), -2);
  const sig = signaturePng();
  const meta = { deviceId: 'seed', clientAt: null, offline: false };

  const make = (asset: Asset, statuses: Record<number, [CheckStatus, string?]>, ft: Inspection['functionalTest'], car = ''): Inspection => {
    const t = DEFAULT_TEMPLATES[asset.equipmentType];
    const checks = emptyChecks(t).map((c) => ({ ...c, status: statuses[c.no]?.[0] ?? 'P', remark: statuses[c.no]?.[1] ?? '' }));
    const insp: Inspection = {
      id: uuid(), clientId, buildingId: nkp.id, assetId: asset.id, templateId: t.id, templateVersion: t.version, kind: 'routine', retestOf: null,
      status: 'submitted',
      header: {
        customerSite: 'NKP Mumbai', equipmentAssetId: asset.assetTag, inspectionDate: date, technician: tech.name,
        customerOrganization: 'JLL', siteLocationDepartment: '10th Floor', equipmentType: asset.equipmentType,
        manufacturer: asset.manufacturer ?? '', model: asset.model ?? '', serialNumber: asset.serialNumber ?? '',
        installDate: asset.installDate ?? '', previousMaintenanceDate: '', nextDueDate: nextDueFrom(date, t),
        inspectionPerformedBy: tech.name,
      },
      checks, functionalTest: ft,
      result: { allPassed: false, defectsIdentified: false, retestRequired: false, retestManual: false, correctiveActionRef: car },
      technicianSignature: { name: tech.name, userId: tech.id, dataUrl: sig, signedAt: `${date}T11:20:00.000Z` },
      reviewerSignature: null, reviewerComment: '', createdBy: tech.id, createdAt: `${date}T10:45:00.000Z`, updatedAt: `${date}T11:20:00.000Z`,
      rev: 0, events: [{ at: `${date}T11:20:00.000Z`, by: tech.id, byName: tech.name, action: 'note', to: 'Digitised from the paper sample form' }],
    };
    insp.result = applyDerivedResult(t, insp);
    return insp;
  };

  // Wheelchair sample: item 3 marked ✗ with remark "puncher" (puncture); test required: No; next due 90 days.
  await db.tx((q) => upsertInspection(q, tech, make(wheelchair, { 3: ['F', 'Puncture noted (paper remark: "puncher")'] },
    { required: 'no', reference: '', method: '', criteria: '', observations: '', result: 'na', specifiedLoadKg: null, actualLoadKg: null },
    'CAR-NKP-0001'), null, meta));

  // Scoop stretcher sample: "3 Stretchers", all items ticked, functional test Pass.
  for (const s of scoops) {
    const insp = make(s, {}, { required: 'yes', reference: 'Manufacturer instructions', method: 'Assemble, lock, lift with both halves engaged',
      criteria: 'As per manufacturer', observations: 'All locks engaged; no movement between halves', result: 'pass', specifiedLoadKg: null, actualLoadKg: null });
    const saved = await db.tx((q) => upsertInspection(q, tech, insp, null, meta));
    await db.tx((q) => upsertInspection(q, reviewer, { ...saved, status: 'finalized',
      reviewerSignature: { name: reviewer.name, userId: reviewer.id, dataUrl: sig, signedAt: `${date}T15:05:00.000Z` } }, saved.rev, meta));
  }
}

/** A small hand-drawn-looking PNG used as the demo signature image. */
function signaturePng(): string {
  const w = 320, h = 100;
  const px = new Uint8Array(w * h * 4);
  const plot = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const xx = Math.round(x + dx), yy = Math.round(y + dy);
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const i = (yy * w + xx) * 4; px[i] = 20; px[i + 1] = 33; px[i + 2] = 61; px[i + 3] = 255;
    }
  };
  for (let t = 0; t <= 1; t += 0.0005) {
    const x = 20 + t * 280;
    const y = 55 + Math.sin(t * 19) * 22 * (1 - t * 0.6) + Math.cos(t * 47) * 6;
    plot(x, y);
  }
  for (let t = 0; t <= 1; t += 0.002) plot(40 + t * 240, 82 + Math.sin(t * 3) * 2);
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), Buffer.from(data)]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  (async () => {
    if (process.argv.includes('--reset') && !config.databaseUrl) await rm(path.resolve(config.pgliteDir), { recursive: true, force: true });
    const seeded = await seedIfEmpty();
    if (!seeded) console.log('[seed] Database already has data; use --reset to start over (embedded DB only).');
    process.exit(0);
  })();
}
