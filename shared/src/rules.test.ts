import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, assetAfterInspection, blocking, DEFAULT_TEMPLATES, deriveResult, emptyChecks, emptyFunctionalTest,
  normalizeFunctionalTest, validateInspection, type Asset, type CheckStatus, type Inspection,
} from './index.ts';

const t = DEFAULT_TEMPLATES.wheelchair;
const sig = { name: 'Ashish Dalal', userId: 'u1', dataUrl: 'data:image/png;base64,', signedAt: '2026-10-30T10:00:00Z' };

function make(statuses: Partial<Record<number, CheckStatus>>, remarks: Record<number, string> = {}): Inspection {
  return {
    id: 'i1', clientId: 'c', buildingId: 'b', assetId: 'a', templateId: 'wheelchair', templateVersion: 1, kind: 'routine', retestOf: null,
    status: 'draft',
    header: { customerSite: 'NKP Mumbai', equipmentAssetId: 'JLL-NKP-WC-001', inspectionDate: '2026-10-30', technician: 'Ashish Dalal',
      customerOrganization: 'JLL', siteLocationDepartment: '10th Floor', equipmentType: 'wheelchair', manufacturer: '', model: '', serialNumber: '',
      installDate: '', previousMaintenanceDate: '', nextDueDate: addDays('2026-10-30', 90), inspectionPerformedBy: 'Ashish Dalal' },
    checks: emptyChecks(t).map((c) => ({ ...c, status: statuses[c.no] ?? 'P', remark: remarks[c.no] ?? '' })),
    functionalTest: { ...emptyFunctionalTest(), required: 'no', result: 'na' },
    result: { allPassed: false, defectsIdentified: false, retestRequired: false, retestManual: false, correctiveActionRef: '' },
    technicianSignature: sig, reviewerSignature: null, reviewerComment: '', createdBy: 'u1', createdAt: '', updatedAt: '', rev: 0, events: [],
  };
}

test('quarterly: next due is inspection date + 90 days for every checklist', () => {
  for (const tpl of Object.values(DEFAULT_TEMPLATES)) assert.equal(tpl.intervalDays, 90);
  assert.equal(addDays('2026-10-30', 90), '2027-01-28');
});

test('Fail and Maintenance and Rectified need a remark', () => {
  for (const s of ['F', 'M', 'RECT'] as CheckStatus[]) {
    const errs = blocking(validateInspection(t, make({ 4: s }), true));
    assert.ok(errs.some((e) => e.path === 'checks.4.remark'), `remark required for ${s}`);
  }
});

test('functional test cannot pass when any check is Fail, but can with Maintenance', () => {
  const failing = make({ 4: 'F' }, { 4: 'Grip torn' });
  failing.functionalTest = { ...failing.functionalTest, required: 'yes', method: 'Push test', observations: 'ok', result: 'pass' };
  failing.result.correctiveActionRef = 'CAR-1';
  assert.ok(blocking(validateInspection(t, failing)).some((e) => e.path === 'functionalTest.result'));
  assert.equal(normalizeFunctionalTest(failing.functionalTest, failing.checks).result, null);

  const maint = make({ 4: 'M' }, { 4: 'Grip worn — replace at next service' });
  maint.functionalTest = { ...maint.functionalTest, required: 'yes', method: 'Push test', observations: 'ok', result: 'pass' };
  assert.deepEqual(blocking(validateInspection(t, maint)), []);
  const d = deriveResult(t, maint.checks, maint.functionalTest);
  assert.equal(d.defectsIdentified, false);
  assert.deepEqual(d.maintenanceChecks, [4]);
});

test('safety-critical fail (wheel locks) takes the asset out of service and needs a CAR', () => {
  const insp = make({ 3: 'F' }, { 3: 'Puncture' });
  assert.ok(blocking(validateInspection(t, insp)).some((e) => e.path === 'result.correctiveActionRef'));
  insp.result.correctiveActionRef = 'CAR-NKP-0001';
  insp.result.retestRequired = true;
  assert.deepEqual(blocking(validateInspection(t, insp)), []);
  const after = assetAfterInspection(t, { lastInspectionDate: null, previousMaintenanceDate: null } as Asset, insp);
  assert.equal(after.status, 'out_of_service');
  assert.equal(after.openDefects.length, 1);
  assert.equal(after.nextDueDate, '2027-01-28');
});

test('non-critical fail keeps the asset in service but requires a re-test', () => {
  const insp = make({ 4: 'F' }, { 4: 'Grip loose' });
  insp.result = { ...insp.result, retestRequired: true, correctiveActionRef: 'CAR-2' };
  assert.equal(assetAfterInspection(t, { lastInspectionDate: null, previousMaintenanceDate: null } as Asset, insp).status, 'retest_required');
});

test('NA is rejected where the form does not allow it', () => {
  assert.ok(blocking(validateInspection(t, make({ 3: 'NA' }))).some((e) => e.path === 'checks.3.status'));
});
