/** All writes go through here: local DB first, then the sync outbox. */
import {
  addDays, applyDerivedResult, assetAfterInspection, DEFAULT_TEMPLATES, dueState, emptyChecks, emptyFunctionalTest,
  normalizeFunctionalTest, todayISO, uuid,
  type Asset, type ChecklistTemplate, type EquipmentType, type Inspection, type InspectionEvent, type Signature, type TeamMember, type User,
} from '@think/shared';
import { db } from './db.ts';
import { enqueue } from './sync.ts';

export async function templateFor(id: EquipmentType): Promise<ChecklistTemplate> {
  const all = await db.templates.where('id').equals(id).toArray();
  return all.sort((a, b) => b.version - a.version)[0] ?? DEFAULT_TEMPLATES[id];
}

async function technicianName(user: User): Promise<string> {
  if (user.teamMemberId) {
    const m = await db.team.get(user.teamMemberId);
    if (m?.active) return m.name;
  }
  return user.name && user.name !== 'Team' ? user.name : '';
}

export async function createInspection(asset: Asset, user: User, opts: { kind?: 'routine' | 'retest'; retestOf?: string | null } = {}): Promise<string> {
  const t = await templateFor(asset.equipmentType);
  const [building, client, floor, location_] = await Promise.all([
    db.buildings.get(asset.buildingId), db.clients.get(asset.clientId),
    asset.floorId ? db.floors.get(asset.floorId) : undefined, asset.locationId ? db.locations.get(asset.locationId) : undefined,
  ]);
  const today = todayISO();
  const tech = await technicianName(user);
  // Floor not recorded yet: reuse the location this inspector entered at the same site today (they work floor by floor).
  let location = [floor?.name, location_?.name].filter(Boolean).join(' · ');
  if (!location) {
    const recent = (await db.inspections.where('buildingId').equals(asset.buildingId).toArray())
      .filter((i) => i.createdBy === user.id && i.header.inspectionDate === today && i.header.siteLocationDepartment)
      .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0];
    location = recent?.header.siteLocationDepartment ?? '';
  }
  const now = new Date().toISOString();
  const insp: Inspection = {
    id: uuid(), clientId: asset.clientId, buildingId: asset.buildingId, assetId: asset.id,
    templateId: t.id, templateVersion: t.version, kind: opts.kind ?? 'routine', retestOf: opts.retestOf ?? null, status: 'draft',
    header: {
      customerSite: [building?.name, building?.city].filter(Boolean).join(' '),
      equipmentAssetId: asset.assetTag,
      inspectionDate: today,
      technician: tech,
      customerOrganization: client?.name ?? '',
      siteLocationDepartment: location,
      equipmentType: asset.equipmentType,
      manufacturer: asset.manufacturer ?? '',
      model: asset.model ?? '',
      serialNumber: asset.serialNumber ?? '',
      installDate: asset.installDate ?? '',
      previousMaintenanceDate: asset.lastInspectionDate ?? asset.previousMaintenanceDate ?? '',
      nextDueDate: addDays(today, t.intervalDays),
      inspectionPerformedBy: tech,
    },
    checks: emptyChecks(t),
    functionalTest: emptyFunctionalTest(),
    result: { allPassed: false, defectsIdentified: false, retestRequired: false, retestManual: false, correctiveActionRef: '' },
    technicianSignature: null, reviewerSignature: null, reviewerComment: '',
    createdBy: user.id, createdAt: now, updatedAt: now, rev: 0,
    events: [{ at: now, by: user.id, byName: user.name, action: opts.kind === 'retest' ? 'retest.start' : 'create', offline: !navigator.onLine }],
  };
  await db.inspections.put(insp);
  await enqueue({ type: 'inspection.upsert', entityId: insp.id, payload: { inspection: insp, baseRev: null } }, true);
  return insp.id;
}

/** Field-level change log. Consecutive edits to the same text field within a minute collapse into one event. */
function diffEvents(prev: Inspection, next: Inspection, user: User): InspectionEvent[] {
  const events = [...prev.events];
  const at = new Date().toISOString();
  const push = (action: string, field: string, from: unknown, to: unknown) => {
    if (JSON.stringify(from) === JSON.stringify(to)) return;
    const last = events.at(-1);
    if (last && last.by === user.id && last.field === field && Date.parse(at) - Date.parse(last.at) < 60_000) {
      events[events.length - 1] = { ...last, at, to };
      return;
    }
    events.push({ at, by: user.id, byName: user.name, action, field, from, to, offline: !navigator.onLine });
  };
  for (const k of Object.keys(next.header) as (keyof Inspection['header'])[]) push('header', `header.${k}`, prev.header[k], next.header[k]);
  next.checks.forEach((c) => {
    const p = prev.checks.find((x) => x.no === c.no);
    push('check', `checks.${c.no}.status`, p?.status, c.status);
    push('check', `checks.${c.no}.remark`, p?.remark, c.remark);
    push('check', `checks.${c.no}.measurement`, p?.measurement, c.measurement);
    push('check', `checks.${c.no}.photos`, p?.photoIds.length, c.photoIds.length);
  });
  for (const k of Object.keys(next.functionalTest) as (keyof Inspection['functionalTest'])[])
    push('test', `functionalTest.${k}`, prev.functionalTest[k], next.functionalTest[k]);
  push('result', 'result.retestManual', prev.result.retestManual, next.result.retestManual);
  push('result', 'result.correctiveActionRef', prev.result.correctiveActionRef, next.result.correctiveActionRef);
  return events;
}

export async function saveInspection(next: Inspection, user: User, extraEvent?: Omit<InspectionEvent, 'at' | 'by' | 'byName'>) {
  const prev = await db.inspections.get(next.id);
  if (!prev) throw new Error('Inspection not found on this device');
  if (prev.status === 'finalized') throw new Error('This inspection is finalised and locked');
  const t = await templateFor(next.templateId);
  const functionalTest = normalizeFunctionalTest(next.functionalTest, next.checks);
  let doc: Inspection = { ...next, functionalTest, updatedAt: new Date().toISOString() };
  doc.result = applyDerivedResult(t, doc);
  doc.events = diffEvents(prev, doc, user);
  if (extraEvent) doc.events.push({ ...extraEvent, at: new Date().toISOString(), by: user.id, byName: user.name, offline: !navigator.onLine });
  await db.inspections.put(doc);
  await enqueue({ type: 'inspection.upsert', entityId: doc.id, payload: { inspection: doc, baseRev: prev.rev || null } }, true);
  return doc;
}

export async function submitInspection(insp: Inspection, signature: Signature, user: User) {
  const doc = await saveInspection({ ...insp, status: 'submitted', technicianSignature: signature }, user,
    { action: 'submit', to: 'submitted' });
  // Apply the asset consequence locally straight away so the floor view is right even offline.
  const asset = await db.assets.get(insp.assetId);
  if (asset) {
    const t = await templateFor(insp.templateId);
    await db.assets.update(asset.id, { ...assetAfterInspection(t, asset, doc), updatedAt: new Date().toISOString() });
  }
  return doc;
}

export async function reviewInspection(insp: Inspection, user: User, decision: { finalize: true; signature: Signature } | { finalize: false; comment: string }) {
  const doc: Inspection = decision.finalize
    ? { ...insp, status: 'finalized', reviewerSignature: decision.signature }
    : { ...insp, status: 'returned', reviewerComment: decision.comment };
  doc.events = [...insp.events, { at: new Date().toISOString(), by: user.id, byName: user.name, action: decision.finalize ? 'finalize' : 'return',
    to: decision.finalize ? 'finalized' : decision.comment, offline: !navigator.onLine }];
  doc.updatedAt = new Date().toISOString();
  await db.inspections.put(doc);
  await enqueue({ type: 'inspection.upsert', entityId: doc.id, payload: { inspection: doc, baseRev: insp.rev || null } }, true);
}

export async function addPhoto(insp: Inspection, checkNo: number | null, blob: Blob, user: User) {
  const id = uuid();
  await db.photos.put({ id, inspectionId: insp.id, checkNo, mime: blob.type || 'image/jpeg', caption: '', createdAt: new Date().toISOString(),
    createdBy: user.id, blob, synced: false });
  await enqueue({ type: 'photo.put', entityId: id, payload: null });
  return id;
}

export async function updateAsset(asset: Asset, patch: Partial<Pick<Asset, 'floorId' | 'locationId' | 'serialNumber' | 'manufacturer' | 'model' | 'installDate' | 'assetTag'>>) {
  const flags = new Set(asset.dataFlags);
  const next = { ...asset, ...patch };
  if (next.floorId) flags.delete('FLOOR_UNASSIGNED'); else flags.add('FLOOR_UNASSIGNED');
  if (next.serialNumber) flags.delete('SERIAL_MISSING');
  if (next.manufacturer) { flags.delete('MAKE_UNKNOWN'); flags.delete('MAKE_AMBIGUOUS'); }
  if (next.model) flags.delete('MODEL_UNKNOWN');
  await db.assets.put({ ...next, dataFlags: [...flags], updatedAt: new Date().toISOString() });
  await enqueue({ type: 'asset.update', entityId: asset.id, payload: { id: asset.id, patch } });
}

export async function upsertFloor(f: { id?: string; buildingId: string; clientId: string; name: string; sortOrder: number; deleted?: boolean }) {
  const id = f.id ?? uuid();
  if (f.deleted) await db.floors.delete(id); else await db.floors.put({ id, buildingId: f.buildingId, clientId: f.clientId, name: f.name, sortOrder: f.sortOrder });
  await enqueue({ type: 'floor.upsert', entityId: id, payload: { ...f, id } });
  return id;
}

export async function upsertLocation(l: { id?: string; floorId: string; buildingId: string; clientId: string; name: string; deleted?: boolean }) {
  const id = l.id ?? uuid();
  if (l.deleted) await db.locations.delete(id); else await db.locations.put({ id, floorId: l.floorId, buildingId: l.buildingId, clientId: l.clientId, name: l.name });
  await enqueue({ type: 'location.upsert', entityId: id, payload: { ...l, id } });
  return id;
}

export async function saveTeamMember(m: Partial<TeamMember> & { name: string }) {
  const doc: TeamMember = { id: m.id ?? uuid(), name: m.name.trim(), designation: m.designation ?? 'Inspector', phone: m.phone ?? null,
    email: m.email ?? null, active: m.active ?? true };
  await db.team.put(doc);
  await enqueue({ type: 'team.upsert', entityId: doc.id, payload: doc });
  return doc;
}

export async function removeTeamMember(m: TeamMember) {
  await saveTeamMember({ ...m, active: false });
}

/** Opens the user's open draft for this asset, or starts one (a re-test when the asset is failed). */
export async function openOrCreateInspection(asset: Asset, user: User): Promise<string> {
  const draft = await db.inspections.where('assetId').equals(asset.id)
    .filter((i) => (i.status === 'draft' || i.status === 'returned') && i.createdBy === user.id).first();
  if (draft) return draft.id;
  const needsRetest = (asset.status === 'out_of_service' || asset.status === 'retest_required') && asset.lastInspectionId;
  return createInspection(asset, user, needsRetest ? { kind: 'retest', retestOf: asset.lastInspectionId } : {});
}

/** The next unit on the same floor that still needs inspecting this cycle, so inspectors can work a floor without going back to the list. */
export async function nextDueOnFloor(current: Asset): Promise<Asset | null> {
  const all = await db.assets.where('buildingId').equals(current.buildingId).toArray();
  const due = all.filter((a) => a.id !== current.id && a.status !== 'removed' && dueState(a.nextDueDate) !== 'ok');
  const sameFloor = due.filter((a) => (a.floorId ?? null) === (current.floorId ?? null));
  // Units whose floor is not recorded yet still need inspecting, so they follow once this floor is done.
  const pool = sameFloor.length ? sameFloor : due.filter((a) => !a.floorId);
  return pool.sort((a, b) => a.assetTag.localeCompare(b.assetTag, undefined, { numeric: true }))[0] ?? null;
}
