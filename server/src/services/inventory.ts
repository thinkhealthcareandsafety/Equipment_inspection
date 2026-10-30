import { EQUIPMENT_CODES, importInventory, slugCode, uuid, type ImportResult } from '@think/shared';
import { audit, type Queryable } from '../db.ts';
import { readGrid } from '../lib/xlsx.ts';
import type { AuthUser } from '../lib/auth.ts';

export async function previewInventory(buf: Buffer): Promise<ImportResult> {
  const { sheetName, grid } = await readGrid(buf);
  return importInventory(grid, { sheetName });
}

/**
 * Creates buildings and one asset per unit. Re-importing the same sheet is
 * idempotent: units are matched on (client, import_key) and only the inventory
 * fields are refreshed — inspection history, floor assignment and serials entered
 * in the field are never overwritten.
 */
export async function commitInventory(q: Queryable, opts: {
  clientId: string; clientCode: string; filename: string; result: ImportResult; user: AuthUser | null;
}) {
  const { clientId, clientCode, result, user } = opts;
  const batchId = uuid();
  const buildingIds = new Map<string, string>();
  const buildingCodes = new Map<string, string>();
  const usedCodes = new Set<string>();
  const existing = await q.query<{ id: string; city: string; name: string; code: string }>(
    'SELECT id, city, name, code FROM buildings WHERE client_id = $1', [clientId]);
  for (const b of existing.rows) { buildingIds.set(`${b.city}|${b.name}`, b.id); buildingCodes.set(b.id, b.code); usedCodes.add(b.code); }

  let created = 0, updated = 0;
  const counters = new Map<string, number>();
  const maxTags = await q.query<{ asset_tag: string }>('SELECT asset_tag FROM assets WHERE client_id = $1', [clientId]);
  for (const { asset_tag } of maxTags.rows) {
    const m = asset_tag.match(/^(.*)-(\d+)$/);
    if (m) counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, +m[2]));
  }

  for (const u of result.units) {
    const bKey = `${u.city}|${u.site}`;
    let buildingId = buildingIds.get(bKey);
    if (!buildingId) {
      buildingId = uuid();
      let code = slugCode(u.site, 4);
      for (let i = 2; usedCodes.has(code); i++) code = `${slugCode(u.site, 3)}${i}`;
      usedCodes.add(code);
      await q.query('INSERT INTO buildings (id, client_id, name, city, code, notes) VALUES ($1,$2,$3,$4,$5,$6)',
        [buildingId, clientId, u.site, u.city, code, u.cityNote ? `Inventory city note: ${u.cityNote}` : null]);
      buildingIds.set(bKey, buildingId);
      buildingCodes.set(buildingId, code);
    }
    const importKey = `${u.site}|${u.key}`;
    const found = await q.query<{ id: string }>('SELECT id FROM assets WHERE client_id = $1 AND import_key = $2', [clientId, importKey]);
    if (found.rows.length) {
      await q.query(
        `UPDATE assets SET manufacturer = COALESCE(manufacturer, $2), model = COALESCE(model, $3), candidate_makes = $4,
           age_raw = $5, import_source = $6, import_batch_id = $7, updated_at = now(), seq = nextval('change_seq') WHERE id = $1`,
        [found.rows[0].id, u.manufacturer, u.model, JSON.stringify(u.candidateMakes), u.ageRaw, JSON.stringify({ ...u.source, floorHint: u.floorHint }), batchId]);
      updated++;
      continue;
    }
    const prefix = `${clientCode}-${buildingCodes.get(buildingId)}-${EQUIPMENT_CODES[u.equipmentType]}`;
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    await q.query(
      `INSERT INTO assets (id, client_id, building_id, equipment_type, asset_tag, manufacturer, model, candidate_makes,
         install_date, install_date_estimated, age_raw, status, status_reason, data_flags, import_key, import_batch_id, import_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [uuid(), clientId, buildingId, u.equipmentType, `${prefix}-${String(n).padStart(3, '0')}`, u.manufacturer, u.model,
        JSON.stringify(u.candidateMakes), u.installDate, u.installDateEstimated, u.ageRaw, u.status, u.statusReason,
        JSON.stringify(u.dataFlags), importKey, batchId, JSON.stringify({ ...u.source, floorHint: u.floorHint })],
    );
    created++;
  }

  const summary = {
    created, updated, total: result.units.length, declaredTotal: result.declaredTotal, asOfDate: result.asOfDate,
    asOfDerivedFrom: result.asOfDerivedFrom, issues: result.issues, sites: result.sites,
    incomplete: result.units.filter((u) => u.dataFlags.some((f) => f !== 'SERIAL_MISSING' && f !== 'FLOOR_UNASSIGNED')).length,
  };
  await q.query('INSERT INTO import_batches (id, client_id, filename, created_by, summary) VALUES ($1,$2,$3,$4,$5)',
    [batchId, clientId, opts.filename, user?.id ?? null, JSON.stringify(summary)]);
  await audit(q, { user, action: 'inventory.import', entityType: 'import_batch', entityId: batchId, clientId,
    changes: { filename: opts.filename, created, updated } });
  return { batchId, ...summary };
}
