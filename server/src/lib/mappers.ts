import type { Asset, Building, Client, Floor, Inspection, Location, TeamMember } from '@think/shared';

type Row = Record<string, any>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const num = (v: unknown) => (v == null ? undefined : Number(v));

export const toClient = (r: Row): Client => ({ id: r.id, name: r.name, code: r.code, seq: num(r.seq) });

export const toBuilding = (r: Row): Building => ({
  id: r.id, clientId: r.client_id, name: r.name, city: r.city, code: r.code, address: r.address, notes: r.notes, seq: num(r.seq),
});

export const toFloor = (r: Row): Floor & { deleted: boolean } => ({
  id: r.id, buildingId: r.building_id, clientId: r.client_id, name: r.name, sortOrder: r.sort_order, deleted: r.deleted, seq: num(r.seq),
});

export const toLocation = (r: Row): Location & { deleted: boolean } => ({
  id: r.id, floorId: r.floor_id, buildingId: r.building_id, clientId: r.client_id, name: r.name, deleted: r.deleted, seq: num(r.seq),
});

export const toAsset = (r: Row): Asset => ({
  id: r.id, clientId: r.client_id, buildingId: r.building_id, floorId: r.floor_id, locationId: r.location_id,
  equipmentType: r.equipment_type, assetTag: r.asset_tag, serialNumber: r.serial_number, manufacturer: r.manufacturer,
  model: r.model, candidateMakes: r.candidate_makes ?? [], installDate: r.install_date,
  installDateEstimated: r.install_date_estimated, ageRaw: r.age_raw, status: r.status, statusReason: r.status_reason,
  dataFlags: r.data_flags ?? [], openDefects: r.open_defects ?? [], lastInspectionId: r.last_inspection_id,
  lastInspectionDate: r.last_inspection_date, lastResult: r.last_result, nextDueDate: r.next_due_date,
  previousMaintenanceDate: r.previous_maintenance_date, importSource: r.import_source, updatedAt: iso(r.updated_at)!, seq: num(r.seq),
});

export const toInspection = (r: Row): Inspection => ({
  ...(r.doc as Inspection),
  id: r.id, clientId: r.client_id, buildingId: r.building_id, assetId: r.asset_id, status: r.status,
  rev: r.rev, createdBy: r.created_by, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!, seq: num(r.seq),
});

export const toTeam = (r: Row): TeamMember => ({
  id: r.id, name: r.name, designation: r.designation, phone: r.phone, email: r.email, active: r.active, seq: num(r.seq),
});
