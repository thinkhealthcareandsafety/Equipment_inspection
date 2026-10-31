import type {
  Asset, AssetStatus, CheckEntry, FunctionalTest, Inspection, InspectionHeader, InspectionResult, OpenDefect,
} from './types.ts';
import type { ChecklistTemplate } from './templates.ts';
import { addDays, isISODate } from './dates.ts';

export interface Issue {
  path: string; // e.g. "checks.3.remark", "functionalTest.result"
  message: string;
  severity: 'error' | 'warning';
}

export function emptyFunctionalTest(): FunctionalTest {
  return {
    required: null, reference: '', method: '', criteria: '', observations: '',
    result: null, specifiedLoadKg: null, actualLoadKg: null,
  };
}

export function emptyChecks(t: ChecklistTemplate): CheckEntry[] {
  return t.checks.map((c) => ({ no: c.no, status: null, remark: '', measurement: null, photoIds: [] }));
}

export interface DerivedResult {
  allPassed: boolean;
  defectsIdentified: boolean;
  retestAuto: boolean;
  failedChecks: number[];
  rectifiedChecks: number[];
  maintenanceChecks: number[];
  safetyCriticalFails: number[];
  testFailed: boolean;
  outOfService: boolean;
  complete: boolean;
}

/** Applies the paper form's logic to the current entries. Pure and deterministic. */
export function deriveResult(t: ChecklistTemplate, checks: CheckEntry[], ft: FunctionalTest): DerivedResult {
  const byNo = new Map(checks.map((c) => [c.no, c]));
  const failed: number[] = [];
  const rect: number[] = [];
  const maint: number[] = [];
  const critical: number[] = [];
  let complete = true;
  for (const item of t.checks) {
    const e = byNo.get(item.no);
    if (!e?.status) { complete = false; continue; }
    if (e.status === 'F') {
      failed.push(item.no);
      if (item.safetyCritical) critical.push(item.no);
    }
    if (e.status === 'RECT') rect.push(item.no);
    if (e.status === 'M') maint.push(item.no);
  }
  // The functional test only exists once every check is answered and none is Fail (see functionalTestGate).
  const gate = functionalTestGate(t, checks).gate;
  const testFailed = gate === 'open' && ft.required === 'yes' && ft.result === 'fail';
  if (gate === 'open' && (ft.required === null || (ft.required === 'yes' && !ft.result))) complete = false;
  const defects = failed.length > 0 || rect.length > 0 || testFailed;
  return {
    allPassed: complete && !defects,
    defectsIdentified: defects,
    retestAuto: failed.length > 0 || testFailed,
    failedChecks: failed,
    rectifiedChecks: rect,
    maintenanceChecks: maint,
    safetyCriticalFails: critical,
    testFailed,
    // A failed load test is treated like a safety-critical failure: the unit cannot be trusted with a patient.
    outOfService: critical.length > 0 || testFailed,
    complete,
  };
}

/** Recomputes the result block, keeping the inspector's manual inputs. */
export function applyDerivedResult(t: ChecklistTemplate, insp: Pick<Inspection, 'checks' | 'functionalTest' | 'result'>): InspectionResult {
  const d = deriveResult(t, insp.checks, insp.functionalTest);
  return {
    ...insp.result,
    allPassed: d.allPassed,
    defectsIdentified: d.defectsIdentified,
    retestRequired: d.retestAuto || insp.result.retestManual,
  };
}

export function functionalTestBlockers(checks: CheckEntry[]): number[] {
  return checks.filter((c) => c.status === 'F').map((c) => c.no);
}

export type TestGate = 'locked' | 'blocked' | 'open';

/**
 * The Functional / Load Test record follows the checklist:
 *  - locked:  some check is still unanswered, so the test cannot be recorded yet
 *  - blocked: a check is Fail, so the test is not performed (the unit already fails)
 *  - open:    every check is answered and none is Fail (P, M, NA or RECT), so the test Pass / Fail applies
 */
export function functionalTestGate(t: ChecklistTemplate, checks: CheckEntry[]): { gate: TestGate; failed: number[] } {
  const failed = functionalTestBlockers(checks);
  if (failed.length) return { gate: 'blocked', failed };
  const allAnswered = t.checks.every((i) => checks.find((c) => c.no === i.no)?.status);
  return { gate: allAnswered ? 'open' : 'locked', failed };
}

/**
 * Keeps the test record consistent with the gate. When a check is Fail the test is "not performed" (recorded as
 * Not applicable, with no Yes/No answer). When "Test required" is No the remaining test fields do not apply.
 */
export function normalizeFunctionalTest(ft: FunctionalTest, checks: CheckEntry[], t: ChecklistTemplate): FunctionalTest {
  const { gate } = functionalTestGate(t, checks);
  if (gate === 'blocked') return { ...ft, required: null, result: 'na', specifiedLoadKg: null, actualLoadKg: null };
  if (gate === 'open' && ft.required === null && ft.result === 'na') return { ...ft, result: null }; // the check that failed was corrected
  if (ft.required === 'no') return { ...ft, result: 'na', specifiedLoadKg: null, actualLoadKg: null };
  if (ft.required === 'yes' && ft.result === 'na') return { ...ft, result: null };
  return ft;
}

export function validateInspection(t: ChecklistTemplate, insp: Inspection, forSubmit = true): Issue[] {
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message, severity: 'error' });
  const h = insp.header;

  if (forSubmit) {
    const required: (keyof InspectionHeader)[] = ['customerSite', 'equipmentAssetId', 'inspectionDate', 'technician',
      'customerOrganization', 'siteLocationDepartment', 'nextDueDate', 'inspectionPerformedBy'];
    for (const k of required) if (!String(h[k] ?? '').trim()) err(`header.${k}`, 'Required');
    if (h.inspectionDate && !isISODate(h.inspectionDate)) err('header.inspectionDate', 'Invalid date');
    if (h.nextDueDate && h.inspectionDate && h.nextDueDate < h.inspectionDate) err('header.nextDueDate', 'Must be after the inspection date');
  }

  for (const item of t.checks) {
    const e = insp.checks.find((c) => c.no === item.no);
    const p = `checks.${item.no}`;
    if (!e?.status) { if (forSubmit) err(`${p}.status`, 'Select P / F / NA / RECT'); continue; }
    if (e.status === 'NA' && !item.allowNA) err(`${p}.status`, 'NA is not permitted for this check');
    if ((e.status === 'F' || e.status === 'RECT' || e.status === 'M') && !e.remark.trim())
      err(`${p}.remark`, e.status === 'F' ? 'A remark is required for a Fail' : e.status === 'M' ? 'Describe the maintenance needed' : 'Describe what was rectified');
    if (item.measurement) {
      const m = item.measurement;
      if (e.measurement == null) {
        if (m.requirement === 'always' && e.status !== 'NA') err(`${p}.measurement`, `${m.label} is required`);
      } else if ((m.min != null && e.measurement < m.min) || (m.max != null && e.measurement > m.max)) {
        issues.push({ path: `${p}.measurement`, message: `Outside expected range ${m.min ?? ''}–${m.max ?? ''} ${m.unit}`, severity: 'warning' });
      }
    }
    if (e.status === 'F' && e.photoIds.length === 0)
      issues.push({ path: `${p}.photo`, message: 'Add a photo of the defect as evidence', severity: 'warning' });
  }

  const ft = insp.functionalTest;
  if (functionalTestGate(t, insp.checks).gate === 'open') {
    if (forSubmit && !ft.required) err('functionalTest.required', 'Answer Yes or No');
    if (ft.required === 'yes') {
      if (forSubmit && !ft.method.trim()) err('functionalTest.method', 'Required when a test is required');
      if (forSubmit && !ft.observations.trim()) err('functionalTest.observations', 'Record the actual result');
      if (forSubmit && (!ft.result || ft.result === 'na')) err('functionalTest.result', 'Select Pass or Fail');
      if (ft.result === 'fail' && !ft.observations.trim()) err('functionalTest.observations', 'Describe the failure');
    }
  }

  const d = deriveResult(t, insp.checks, ft);
  if ((d.failedChecks.length > 0 || d.testFailed) && !insp.result.correctiveActionRef.trim())
    err('result.correctiveActionRef', 'A corrective action reference is required when a defect fails');
  if (insp.kind === 'retest' && !insp.retestOf) err('retestOf', 'Re-test must reference the failed inspection');

  if (forSubmit && !insp.technicianSignature) err('technicianSignature', 'Technician signature required');
  return issues;
}

export const blocking = (issues: Issue[]) => issues.filter((i) => i.severity === 'error');

export function nextDueFrom(inspectionDate: string, t: ChecklistTemplate): string {
  return addDays(inspectionDate, t.intervalDays);
}

/**
 * The asset's state after an inspection is submitted. Rules:
 *  • safety-critical Fail or failed load test → out of service until a re-test passes
 *  • any other Fail → stays in service, flagged "re-test required"
 *  • a clean re-test (or a clean routine inspection) restores service and closes open defects
 */
export function assetAfterInspection(t: ChecklistTemplate, asset: Asset, insp: Inspection): Pick<Asset,
  'status' | 'statusReason' | 'openDefects' | 'lastInspectionId' | 'lastInspectionDate' | 'lastResult' | 'nextDueDate' | 'previousMaintenanceDate'> {
  const d = deriveResult(t, insp.checks, insp.functionalTest);
  const defects: OpenDefect[] = [];
  const raisedAt = insp.header.inspectionDate;
  for (const no of d.failedChecks) {
    const item = t.checks.find((c) => c.no === no)!;
    const e = insp.checks.find((c) => c.no === no)!;
    defects.push({ inspectionId: insp.id, checkNo: no, label: item.label, remark: e.remark, safetyCritical: item.safetyCritical,
      correctiveActionRef: insp.result.correctiveActionRef, raisedAt });
  }
  if (d.testFailed) {
    defects.push({ inspectionId: insp.id, checkNo: 'TEST', label: 'Functional / load test', remark: insp.functionalTest.observations,
      safetyCritical: true, correctiveActionRef: insp.result.correctiveActionRef, raisedAt });
  }
  let status: AssetStatus = 'in_service';
  let reason: string | null = null;
  if (d.outOfService) {
    status = 'out_of_service';
    const items = d.safetyCriticalFails.map((n) => `#${n}`).concat(d.testFailed ? ['load test'] : []);
    reason = `Safety-critical failure (${items.join(', ')}) — out of service until a re-test passes`;
  } else if (insp.result.retestRequired) {
    status = 'retest_required';
    reason = d.failedChecks.length ? `Failed check ${d.failedChecks.map((n) => `#${n}`).join(', ')} — re-test required` : 'Re-test requested by inspector';
  }
  return {
    status,
    statusReason: reason,
    openDefects: defects,
    lastInspectionId: insp.id,
    lastInspectionDate: insp.header.inspectionDate,
    lastResult: d.outOfService ? 'fail' : d.defectsIdentified ? 'defects' : 'pass',
    nextDueDate: insp.header.nextDueDate || nextDueFrom(insp.header.inspectionDate, t),
    previousMaintenanceDate: asset.lastInspectionDate ?? asset.previousMaintenanceDate,
  };
}

export function canEdit(insp: Inspection, role: string, userId: string): boolean {
  if (insp.status === 'finalized') return false;
  if (insp.status === 'submitted') return false;
  if (role === 'client_admin') return false;
  if (role === 'inspector') return insp.createdBy === userId;
  return role === 'admin' || role === 'reviewer';
}
