import {
  assetAfterInspection, blocking, DEFAULT_TEMPLATES, validateInspection,
  type ChecklistTemplate, type EquipmentType, type Inspection,
} from '@think/shared';
import { audit, type Queryable } from '../db.ts';
import type { AuthUser } from '../lib/auth.ts';
import { toAsset, toInspection } from '../lib/mappers.ts';

export class OpError extends Error {
  constructor(public code: 'conflict' | 'forbidden' | 'invalid' | 'not_found', message: string, public current?: unknown) { super(message); }
}

export async function loadTemplate(q: Queryable, id: EquipmentType, version: number): Promise<ChecklistTemplate> {
  const r = await q.query<{ definition: ChecklistTemplate }>('SELECT definition FROM templates WHERE id = $1 AND version = $2', [id, version]);
  return r.rows[0]?.definition ?? DEFAULT_TEMPLATES[id];
}

const ALLOWED: Record<string, Record<string, string[]>> = {
  // role → from-status → allowed to-statuses
  inspector: { new: ['draft', 'submitted'], draft: ['draft', 'submitted'], returned: ['draft', 'returned', 'submitted'] },
  reviewer: { new: ['draft', 'submitted'], draft: ['draft', 'submitted'], returned: ['draft', 'returned', 'submitted'], submitted: ['finalized', 'returned'] },
  admin: { new: ['draft', 'submitted'], draft: ['draft', 'submitted'], returned: ['draft', 'returned', 'submitted'], submitted: ['finalized', 'returned'] },
};

/**
 * Applies an inspection upsert coming from a device. Enforces the workflow
 * (draft → submitted → finalized, or returned back to the inspector), locks
 * finalised records, validates against the template on submit, and updates the
 * asset's service status when an inspection is submitted.
 */
export async function upsertInspection(q: Queryable, user: AuthUser, incoming: Inspection, baseRev: number | null,
  meta: { deviceId: string | null; clientAt: string | null; offline: boolean }) {
  const cur = (await q.query('SELECT * FROM inspections WHERE id = $1 FOR UPDATE', [incoming.id])).rows[0];
  const current = cur ? toInspection(cur) : null;
  const from = current?.status ?? 'new';
  const to = incoming.status;
  if (!ALLOWED[user.role]?.[from]?.includes(to)) {
    throw new OpError(current?.status === 'finalized' ? 'conflict' : 'forbidden',
      current?.status === 'finalized' ? 'This inspection is finalised and locked.' : `Cannot move an inspection from ${from} to ${to}.`, current);
  }
  if (user.role === 'inspector' && current && current.createdBy !== user.id) throw new OpError('forbidden', 'Only the creating inspector can edit this draft.', current);

  const assetRow = (await q.query('SELECT * FROM assets WHERE id = $1 FOR UPDATE', [incoming.assetId])).rows[0];
  if (!assetRow) throw new OpError('not_found', 'Asset not found');
  const asset = toAsset(assetRow);
  const template = await loadTemplate(q, incoming.templateId, incoming.templateVersion);

  // Reviewer actions only touch the review fields; everything the inspector recorded stays as submitted.
  let next: Inspection = incoming;
  if (from === 'submitted' && current) {
    next = { ...current, status: to as Inspection['status'], reviewerSignature: incoming.reviewerSignature, reviewerComment: incoming.reviewerComment,
      events: mergeEvents(current.events, incoming.events) };
    if (to === 'finalized' && !next.reviewerSignature) throw new OpError('invalid', 'Reviewer signature is required to finalise.');
    if (to === 'returned' && !next.reviewerComment.trim()) throw new OpError('invalid', 'Add a comment explaining what to correct.');
  } else {
    if (to === 'submitted') {
      const errs = blocking(validateInspection(template, incoming, true));
      if (errs.length) throw new OpError('invalid', `Cannot submit: ${errs.map((e) => `${e.path} – ${e.message}`).join('; ')}`);
    }
    if (current && baseRev != null && current.rev > baseRev) {
      // Concurrent edit of a draft: last write wins, but both histories are preserved and the conflict is audited.
      await audit(q, { user, action: 'inspection.conflict', entityType: 'inspection', entityId: incoming.id, clientId: asset.clientId,
        changes: { serverRev: current.rev, baseRev }, ...meta });
    }
    next = { ...incoming, clientId: asset.clientId, buildingId: asset.buildingId, events: mergeEvents(current?.events ?? [], incoming.events),
      createdBy: current?.createdBy ?? user.id, createdAt: current?.createdAt ?? incoming.createdAt };
  }

  const rev = (current?.rev ?? 0) + 1;
  const { id, clientId, buildingId, assetId, templateId, templateVersion, kind, retestOf, status } = next;
  const doc = { ...next, rev };
  if (current) {
    await q.query(
      `UPDATE inspections SET status=$2, doc=$3, inspection_date=$4, kind=$5, retest_of=$6, rev=$7, updated_at=now(), seq=nextval('change_seq') WHERE id=$1`,
      [id, status, JSON.stringify(doc), next.header.inspectionDate || null, kind, retestOf, rev]);
  } else {
    await q.query(
      `INSERT INTO inspections (id, client_id, building_id, asset_id, template_id, template_version, kind, retest_of, status, inspection_date, doc, created_by, rev)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, clientId, buildingId, assetId, templateId, templateVersion, kind, retestOf, status, next.header.inspectionDate || null,
        JSON.stringify(doc), next.createdBy, rev]);
  }

  if (from !== to || !current) {
    await audit(q, { user, action: `inspection.${to}`, entityType: 'inspection', entityId: id, clientId,
      changes: { from, to, asset: asset.assetTag }, ...meta });
  } else {
    await audit(q, { user, action: 'inspection.update', entityType: 'inspection', entityId: id, clientId,
      changes: { fields: (incoming.events ?? []).filter((e) => !(current.events ?? []).some((c) => c.at === e.at && c.action === e.action)).length }, ...meta });
  }

  // Submission is the moment the asset's state changes: a safety-critical fail takes it out of service immediately.
  if (to === 'submitted' && from !== 'submitted') {
    const newer = asset.lastInspectionDate && asset.lastInspectionId !== id && asset.lastInspectionDate > next.header.inspectionDate;
    if (!newer) {
      const a = assetAfterInspection(template, asset, next);
      await q.query(
        `UPDATE assets SET status=$2, status_reason=$3, open_defects=$4, last_inspection_id=$5, last_inspection_date=$6,
           last_result=$7, next_due_date=$8, previous_maintenance_date=$9, updated_at=now(), seq=nextval('change_seq') WHERE id=$1`,
        [asset.id, a.status, a.statusReason, JSON.stringify(a.openDefects), a.lastInspectionId, a.lastInspectionDate, a.lastResult,
          a.nextDueDate, a.previousMaintenanceDate]);
      if (a.status !== asset.status) {
        await audit(q, { user, action: 'asset.status', entityType: 'asset', entityId: asset.id, clientId,
          changes: { from: asset.status, to: a.status, reason: a.statusReason, inspectionId: id } });
      }
    }
  }
  const saved = (await q.query('SELECT * FROM inspections WHERE id = $1', [id])).rows[0];
  return toInspection(saved);
}

function mergeEvents(a: Inspection['events'], b: Inspection['events']) {
  const seen = new Set<string>();
  return [...(a ?? []), ...(b ?? [])]
    .filter((e) => { const k = `${e.at}|${e.by}|${e.action}|${e.field ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => x.at.localeCompare(y.at));
}
