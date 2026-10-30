// Core domain types shared by the API server and the offline-first client.

export type EquipmentType = 'wheelchair' | 'scoop_stretcher' | 'folding_stretcher' | 'generic_stretcher';

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  wheelchair: 'Wheelchair',
  scoop_stretcher: 'Scoop Stretcher',
  folding_stretcher: 'Foldable Stretcher',
  generic_stretcher: 'Stretcher',
};

export const EQUIPMENT_CODES: Record<EquipmentType, string> = {
  wheelchair: 'WC',
  scoop_stretcher: 'SS',
  folding_stretcher: 'FS',
  generic_stretcher: 'ST',
};

export type Role = 'admin' | 'inspector' | 'reviewer' | 'client_admin';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  inspector: 'Inspector',
  reviewer: 'Reviewer',
  client_admin: 'Client Admin',
};

/**
 * P / F / NA / RECT as printed on the paper form, plus M (Maintenance) which
 * inspectors already hand-write on the sheet ("P/F/M"). M = usable, but needs
 * servicing; it does not block a Pass.
 */
export type CheckStatus = 'P' | 'F' | 'M' | 'NA' | 'RECT';

export const CHECK_STATUSES: CheckStatus[] = ['P', 'F', 'M', 'NA', 'RECT'];

export const STATUS_LABELS: Record<CheckStatus, string> = {
  P: 'Pass',
  F: 'Fail',
  M: 'Maintenance',
  NA: 'Not applicable',
  RECT: 'Rectified',
};

export type AssetStatus = 'in_service' | 'out_of_service' | 'retest_required' | 'removed';

export type DataFlag =
  | 'MAKE_UNKNOWN'
  | 'MAKE_AMBIGUOUS'
  | 'MODEL_UNKNOWN'
  | 'AGE_UNKNOWN'
  | 'AGE_ESTIMATED'
  | 'AGE_AMBIGUOUS'
  | 'SERIAL_MISSING'
  | 'FLOOR_UNASSIGNED'
  | 'TYPE_INFERRED'
  | 'QTY_RECONCILED'
  | 'TAKEN_FOR_REPLACEMENT';

export const DATA_FLAG_LABELS: Record<DataFlag, string> = {
  MAKE_UNKNOWN: 'Make not recorded',
  MAKE_AMBIGUOUS: 'Make is one of several listed',
  MODEL_UNKNOWN: 'Model not recorded',
  AGE_UNKNOWN: 'Age / purchase date not recorded',
  AGE_ESTIMATED: 'Purchase date estimated from age',
  AGE_AMBIGUOUS: 'Age range shared across units',
  SERIAL_MISSING: 'No manufacturer serial number',
  FLOOR_UNASSIGNED: 'Floor / location not yet assigned',
  TYPE_INFERRED: 'Equipment type inferred from description',
  QTY_RECONCILED: 'Quantity split was reconciled by the importer',
  TAKEN_FOR_REPLACEMENT: 'Inventory says "taken for replacement"',
};

export interface Client { id: string; name: string; code: string; seq?: number }

export interface Building {
  id: string; clientId: string; name: string; city: string; code: string;
  address?: string | null; notes?: string | null; seq?: number;
}

export interface Floor { id: string; buildingId: string; clientId: string; name: string; sortOrder: number; seq?: number }

export interface Location { id: string; floorId: string; buildingId: string; clientId: string; name: string; seq?: number }

export interface OpenDefect {
  inspectionId: string;
  checkNo: number | 'TEST';
  label: string;
  remark: string;
  safetyCritical: boolean;
  correctiveActionRef: string;
  raisedAt: string;
}

export interface Asset {
  id: string;
  clientId: string;
  buildingId: string;
  floorId: string | null;
  locationId: string | null;
  equipmentType: EquipmentType;
  assetTag: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  candidateMakes: string[];
  installDate: string | null; // YYYY-MM-DD
  installDateEstimated: boolean;
  ageRaw: string | null;
  status: AssetStatus;
  statusReason: string | null;
  dataFlags: DataFlag[];
  openDefects: OpenDefect[];
  lastInspectionId: string | null;
  lastInspectionDate: string | null;
  lastResult: 'pass' | 'defects' | 'fail' | null;
  nextDueDate: string | null;
  previousMaintenanceDate: string | null;
  importSource: { sheet: string; row: number; raw: Record<string, string> } | null;
  updatedAt: string;
  seq?: number;
}

export interface Signature {
  name: string;
  userId: string;
  dataUrl: string; // PNG data URL
  signedAt: string; // ISO timestamp
}

export interface CheckEntry {
  no: number;
  status: CheckStatus | null;
  remark: string;
  measurement: number | null;
  photoIds: string[];
}

export interface FunctionalTest {
  required: 'yes' | 'no' | null;
  reference: string;
  method: string;
  criteria: string;
  observations: string;
  result: 'pass' | 'fail' | 'na' | null;
  specifiedLoadKg: number | null;
  actualLoadKg: number | null;
}

export interface InspectionResult {
  allPassed: boolean;
  defectsIdentified: boolean;
  retestRequired: boolean;
  retestManual: boolean; // inspector ticked it in addition to auto-derived
  correctiveActionRef: string;
}

/** Header fields — keys mirror the paper form rows, in order. */
export interface InspectionHeader {
  customerSite: string;
  equipmentAssetId: string;
  inspectionDate: string;
  technician: string;
  customerOrganization: string;
  siteLocationDepartment: string;
  equipmentType: EquipmentType;
  manufacturer: string;
  model: string;
  serialNumber: string;
  installDate: string;
  previousMaintenanceDate: string;
  nextDueDate: string;
  inspectionPerformedBy: string;
}

export type InspectionStatus = 'draft' | 'submitted' | 'returned' | 'finalized';

export interface InspectionEvent {
  at: string;
  by: string;
  byName: string;
  action: string; // e.g. "check.status", "header.model", "submit"
  field?: string;
  from?: unknown;
  to?: unknown;
  offline?: boolean;
}

export interface Inspection {
  id: string;
  clientId: string;
  buildingId: string;
  assetId: string;
  templateId: EquipmentType;
  templateVersion: number;
  kind: 'routine' | 'retest';
  retestOf: string | null;
  status: InspectionStatus;
  header: InspectionHeader;
  checks: CheckEntry[];
  functionalTest: FunctionalTest;
  result: InspectionResult;
  technicianSignature: Signature | null;
  reviewerSignature: Signature | null;
  reviewerComment: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  rev: number;
  events: InspectionEvent[];
  seq?: number;
}

export interface PhotoMeta {
  id: string;
  inspectionId: string;
  checkNo: number | null;
  mime: string;
  caption: string;
  createdAt: string;
  createdBy: string;
}

export interface TeamMember {
  id: string;
  name: string;
  designation: string; // Inspector / Senior Inspector / Trainer / Reviewer
  phone: string | null;
  email: string | null;
  active: boolean;
  seq?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
  teamMemberId: string | null;
}
