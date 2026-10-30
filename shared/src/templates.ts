import type { EquipmentType, InspectionHeader } from './types.ts';

/**
 * Checklist templates are plain data so they can be versioned, stored in the
 * database and edited by an administrator without a code change. The objects
 * below are the seed (version 1) definitions.
 */

export interface MeasurementSpec {
  label: string;
  unit: string;
  min?: number;
  max?: number;
  /** 'optional' – shown, not required. 'always' – required whatever the status. */
  requirement: 'optional' | 'always';
  hint?: string;
}

export interface CheckItemTemplate {
  no: number;
  label: string;
  safetyCritical: boolean;
  allowNA: boolean;
  guidance?: string;
  measurement?: MeasurementSpec;
}

export interface ChecklistTemplate {
  id: EquipmentType;
  version: number;
  title: string; // printed title, e.g. "WHEELCHAIR — EQUIPMENT-SPECIFIC CHECKLIST"
  shortName: string;
  subtitle: string;
  /** 'paper-form' = transcribed verbatim from client paper; 'drafted' = authored, awaiting client sign-off. */
  provenance: 'paper-form' | 'drafted';
  intervalDays: number;
  /** Days allowed to complete a re-test after a Fail. */
  retestWithinDays: number;
  checks: CheckItemTemplate[];
}

export const ORG_NAME = 'THINK HEALTHCARE AND SAFETY';
export const FORM_SUBTITLE = 'Complete in addition to the Master Inspection & Fitness Certificate';

/** Header rows in exactly the paper order. `linkedTo` rows mirror another row by default. */
export const HEADER_FIELDS: {
  key: keyof InspectionHeader;
  label: string;
  kind: 'text' | 'date' | 'equipmentType' | 'person';
  linkedTo?: keyof InspectionHeader;
}[] = [
  { key: 'customerSite', label: 'Customer / Site', kind: 'text' },
  { key: 'equipmentAssetId', label: 'Equipment Asset ID / Serial No.', kind: 'text' },
  { key: 'inspectionDate', label: 'Inspection Date', kind: 'date' },
  { key: 'technician', label: 'Technician', kind: 'person' },
  { key: 'customerOrganization', label: 'Customer / Organization', kind: 'text' },
  { key: 'siteLocationDepartment', label: 'Site / Location / Department', kind: 'text' },
  { key: 'equipmentType', label: 'Equipment Type', kind: 'equipmentType' },
  { key: 'manufacturer', label: 'Manufacturer / Brand', kind: 'text' },
  { key: 'model', label: 'Model', kind: 'text' },
  { key: 'serialNumber', label: 'Serial Number / Asset ID', kind: 'text' },
  { key: 'installDate', label: 'Date of Installation / Purchase', kind: 'date' },
  { key: 'previousMaintenanceDate', label: 'Previous Maintenance Date', kind: 'date' },
  // "Date of Inspection" repeats "Inspection Date" on the paper form; rendered as a linked row.
  { key: 'inspectionDate', label: 'Date of Inspection', kind: 'date', linkedTo: 'inspectionDate' },
  { key: 'nextDueDate', label: 'Next Due Date', kind: 'date' },
  { key: 'inspectionPerformedBy', label: 'Inspection Performed By', kind: 'person' },
];

const wheelchair: ChecklistTemplate = {
  id: 'wheelchair',
  version: 1,
  title: 'WHEELCHAIR — EQUIPMENT-SPECIFIC CHECKLIST',
  shortName: 'Wheelchair',
  subtitle: FORM_SUBTITLE,
  provenance: 'paper-form',
  intervalDays: 90, // "90 days" handwritten as Next Due Date on the sample form
  retestWithinDays: 7,
  checks: [
    { no: 1, label: 'Main frame, cross-bracing and seat supports', safetyCritical: false, allowNA: false,
      guidance: 'Look for cracks, bends, corrosion and loose fixings.' },
    { no: 2, label: 'Rear wheels, front castors, tyres and wheel attachment security', safetyCritical: false, allowNA: false,
      guidance: 'Check for punctures, tread wear, wobble and axle security.',
      measurement: { label: 'Tyre pressure', unit: 'psi', min: 0, max: 120, requirement: 'optional', hint: 'Pneumatic tyres only' } },
    { no: 3, label: 'Wheel locks: engagement, holding function and release', safetyCritical: true, allowNA: false,
      guidance: 'Lock must hold the chair on a slope with an occupant.' },
    { no: 4, label: 'Push handles and grips', safetyCritical: false, allowNA: false },
    { no: 5, label: 'Armrests, footrests and leg supports', safetyCritical: false, allowNA: false },
    { no: 6, label: 'Seat and backrest fabric, cushions and stitching', safetyCritical: false, allowNA: false },
    { no: 7, label: 'Folding and unfolding operation', safetyCritical: false, allowNA: true },
    { no: 8, label: 'Stability and manoeuvrability during normal use', safetyCritical: false, allowNA: false },
    { no: 9, label: 'Restraints, if provided', safetyCritical: true, allowNA: true },
    { no: 10, label: 'Safe movement and braking during functional test', safetyCritical: true, allowNA: false },
  ],
};

const scoop: ChecklistTemplate = {
  id: 'scoop_stretcher',
  version: 1,
  title: 'SCOOP STRETCHER — EQUIPMENT-SPECIFIC CHECKLIST',
  shortName: 'Scoop Stretcher',
  subtitle: FORM_SUBTITLE,
  provenance: 'paper-form',
  intervalDays: 90, // not printed on the scoop form – defaults to the wheelchair interval (configurable)
  retestWithinDays: 7,
  checks: [
    { no: 1, label: 'Both halves inspected for cracks, bending and deformation', safetyCritical: true, allowNA: false },
    { no: 2, label: 'Head and foot-end joining mechanisms', safetyCritical: false, allowNA: false },
    { no: 3, label: 'Locking pins, catches, latches and release controls', safetyCritical: true, allowNA: false },
    { no: 4, label: 'Secure engagement and alignment of both halves', safetyCritical: false, allowNA: false },
    { no: 5, label: 'Length adjustment and locking, where applicable', safetyCritical: false, allowNA: true,
      measurement: { label: 'Extended length', unit: 'mm', min: 1000, max: 2500, requirement: 'optional' } },
    { no: 6, label: 'Handles, handgrips and lifting points', safetyCritical: false, allowNA: false },
    { no: 7, label: 'Patient restraints and anchor points', safetyCritical: true, allowNA: false },
    { no: 8, label: 'Assembly and disassembly performed smoothly', safetyCritical: false, allowNA: false },
    { no: 9, label: 'All locks confirmed fully engaged before handling', safetyCritical: true, allowNA: false },
    { no: 10, label: 'Functional test completed as per manufacturer instructions', safetyCritical: false, allowNA: false },
  ],
};

// No paper form was supplied for the next two types. They follow the same 10-item
// structure and wording style and are marked 'drafted' until the client confirms them.
const folding: ChecklistTemplate = {
  id: 'folding_stretcher',
  version: 1,
  title: 'FOLDABLE STRETCHER — EQUIPMENT-SPECIFIC CHECKLIST',
  shortName: 'Foldable Stretcher',
  subtitle: FORM_SUBTITLE,
  provenance: 'drafted',
  intervalDays: 90,
  retestWithinDays: 7,
  checks: [
    { no: 1, label: 'Poles and frame inspected for cracks, bending and corrosion', safetyCritical: true, allowNA: false },
    { no: 2, label: 'Folding hinges, joints and pivot fixings', safetyCritical: false, allowNA: false },
    { no: 3, label: 'Locking braces / spreader bars engage and hold when open', safetyCritical: true, allowNA: false },
    { no: 4, label: 'Canvas / fabric bed: tears, fraying, stitching and pole attachment', safetyCritical: false, allowNA: false },
    { no: 5, label: 'Handles and handgrips', safetyCritical: false, allowNA: false },
    { no: 6, label: 'Feet, stands and ground-contact points', safetyCritical: false, allowNA: true },
    { no: 7, label: 'Patient restraint straps, buckles and anchor points', safetyCritical: true, allowNA: false },
    { no: 8, label: 'Folding and unfolding operation', safetyCritical: false, allowNA: false },
    { no: 9, label: 'All locks confirmed fully engaged before handling', safetyCritical: true, allowNA: false },
    { no: 10, label: 'Functional test completed as per manufacturer instructions', safetyCritical: false, allowNA: false },
  ],
};

const generic: ChecklistTemplate = {
  id: 'generic_stretcher',
  version: 1,
  title: 'STRETCHER — EQUIPMENT-SPECIFIC CHECKLIST',
  shortName: 'Stretcher',
  subtitle: FORM_SUBTITLE,
  provenance: 'drafted',
  intervalDays: 90,
  retestWithinDays: 7,
  checks: [
    { no: 1, label: 'Frame and structure inspected for cracks, bending and deformation', safetyCritical: true, allowNA: false },
    { no: 2, label: 'Patient platform, mattress and covers', safetyCritical: false, allowNA: false },
    { no: 3, label: 'Handles, handgrips and lifting points', safetyCritical: false, allowNA: false },
    { no: 4, label: 'Wheels, castors and brakes, where fitted', safetyCritical: true, allowNA: true },
    { no: 5, label: 'Side rails / guards and their latches, where fitted', safetyCritical: false, allowNA: true },
    { no: 6, label: 'Patient restraints and anchor points', safetyCritical: true, allowNA: false },
    { no: 7, label: 'Adjustment mechanisms (backrest, height, leg section), where applicable', safetyCritical: false, allowNA: true },
    { no: 8, label: 'Stability during normal use and patient transfer', safetyCritical: false, allowNA: false },
    { no: 9, label: 'Labels, load rating and identification legible', safetyCritical: false, allowNA: false },
    { no: 10, label: 'Functional test completed as per manufacturer instructions', safetyCritical: false, allowNA: false },
  ],
};

export const DEFAULT_TEMPLATES: Record<EquipmentType, ChecklistTemplate> = {
  wheelchair,
  scoop_stretcher: scoop,
  folding_stretcher: folding,
  generic_stretcher: generic,
};

export const FUNCTIONAL_TEST_LABELS = {
  section: 'Functional Test / Load Test Record (where applicable)',
  required: 'Test required by manufacturer / standard?',
  reference: 'Reference',
  method: 'Test method / procedure reference',
  criteria: 'Specified test load / criteria (if applicable)',
  observations: 'Actual test result / observations',
  result: 'Pass / Fail',
};

export const RESULT_LABELS = {
  section: 'Equipment-Specific Result',
  allPassed: 'All equipment-specific checks passed',
  defectsIdentified: 'Defect(s) identified',
  retestRequired: 'Re-test required',
  correctiveActionRef: 'Defect / corrective action reference',
  technicianSignature: 'Technician signature / date',
  reviewerSignature: 'Reviewer signature / date',
};
