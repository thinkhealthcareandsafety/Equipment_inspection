/**
 * PDF templates, generated on the device so certificates can be produced offline.
 *  1. Master Inspection & Fitness Certificate
 *  2. Equipment-specific checklist — same layout, wording and order as the paper form
 *  3. Photo evidence and change-history appendix
 *  4. Site / client summary report driven by the Reports filters
 */
import { jsPDF } from 'jspdf';
import {
  deriveResult, EQUIPMENT_LABELS, formatDate, formatDateTime, FUNCTIONAL_TEST_LABELS, HEADER_FIELDS, ORG_NAME, RESULT_LABELS,
  STATUS_LABELS, type Asset, type Building, type ChecklistTemplate, type Client, type EquipmentType, type Inspection, type Signature,
} from '@think/shared';
import type { Report } from './reports.ts';
import { GROUP_LABELS, type GroupBy } from './reports.ts';

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [100, 108, 120];
const LINE: [number, number, number] = [60, 60, 60];
const TEAL: [number, number, number] = [19, 163, 139];
const HEAD: [number, number, number] = [88, 88, 88];
const GREEN: [number, number, number] = [5, 122, 85];
const RED: [number, number, number] = [190, 18, 60];
const AMBER: [number, number, number] = [180, 83, 9];

const PAGE_W = 210, PAGE_H = 297, MX = 15, CW = PAGE_W - MX * 2;

export interface PhotoForPdf { dataUrl: string; w: number; h: number; caption: string }

function logo(doc: jsPDF, right: number, top: number) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  const hw = doc.getTextWidth('health') + 3;
  doc.setFillColor(...TEAL); doc.roundedRect(right - hw, top, hw, 4.6, 1.2, 1.2, 'F');
  doc.setTextColor(255, 255, 255); doc.text('health', right - hw + 1.5, top + 3.4);
  doc.setFontSize(13); doc.setTextColor(120, 120, 120);
  doc.text('think', right - hw - 1, top + 8.5, { align: 'right' });
}

function checkbox(doc: jsPDF, x: number, y: number, checked: boolean, label?: string, size = 3) {
  doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.rect(x, y - size + 0.4, size, size);
  if (checked) {
    doc.setDrawColor(...INK); doc.setLineWidth(0.6);
    doc.line(x + 0.6, y - size / 2 + 0.4, x + size * 0.42, y - 0.3);
    doc.line(x + size * 0.42, y - 0.3, x + size + 0.5, y - size - 0.2);
    doc.setLineWidth(0.25);
  }
  if (label) { doc.setTextColor(...INK); doc.text(label, x + size + 1.4, y); return x + size + 1.4 + doc.getTextWidth(label) + 5; }
  return x + size + 4;
}

function footer(doc: jsPDF, left: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(left, MX, PAGE_H - 12.5);
    doc.text(`Page ${i} of ${n}`, PAGE_W - MX, PAGE_H - 12.5, { align: 'right' });
  }
}

function watermark(doc: jsPDF, text: string) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(64); doc.setTextColor(235, 235, 235);
  doc.text(text, PAGE_W / 2, PAGE_H / 2 + 20, { align: 'center', angle: 35 });
}

function sigImage(doc: jsPDF, sig: Signature | null, x: number, y: number, w: number, h: number) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...INK);
  if (!sig) { doc.setTextColor(...MUTED); doc.text('Not signed', x + 1, y + h / 2 + 1); return; }
  try { doc.addImage(sig.dataUrl, 'PNG', x, y + 0.5, Math.min(w * 0.45, (h - 1) * 3.2), h - 1); } catch { /* ignore bad image */ }
  doc.text(`${sig.name}`, x + w * 0.5, y + h / 2 - 0.5);
  doc.setTextColor(...MUTED); doc.setFontSize(7);
  doc.text(formatDateTime(sig.signedAt), x + w * 0.5, y + h / 2 + 3);
}

/** Shrinks the font until `text` fits `width` (never below 6pt). */
function fitText(doc: jsPDF, text: string, width: number, size: number) {
  doc.setFontSize(size);
  while (size > 6 && doc.getTextWidth(text) > width) { size -= 0.25; doc.setFontSize(size); }
}

/** Two-column bordered table row: bold label | value. Returns the row height used. */
function kvRow(doc: jsPDF, x: number, y: number, lw: number, vw: number, label: string, value: string, h = 6.2) {
  doc.setDrawColor(...LINE); doc.setLineWidth(0.25);
  doc.rect(x, y, lw, h); doc.rect(x + lw, y, vw, h);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK);
  fitText(doc, label, lw - 3, 8.5);
  doc.text(label, x + 1.5, y + h / 2 + 1.2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(value || '', vw - 3) as string[];
  doc.text(lines[0] ?? '', x + lw + 1.5, y + h / 2 + 1.2);
}

export interface PackContext { asset?: Asset; building?: Building; client?: Client; template: ChecklistTemplate; photos: PhotoForPdf[] }

function verdict(t: ChecklistTemplate, insp: Inspection) {
  const d = deriveResult(t, insp.checks, insp.functionalTest);
  if (d.outOfService) return { label: 'NOT FIT FOR USE — OUT OF SERVICE', note: 'Safety-critical defect. Remove from use until a re-test passes.', color: RED };
  if (insp.result.retestRequired) return { label: 'FIT FOR USE — RE-TEST REQUIRED', note: `Non-critical defect recorded. Re-test within ${t.retestWithinDays} days.`, color: AMBER };
  if (d.rectifiedChecks.length) return { label: 'FIT FOR USE — DEFECTS RECTIFIED', note: 'Defects were rectified on site at the time of inspection.', color: GREEN };
  if (d.maintenanceChecks.length) return { label: 'FIT FOR USE — MAINTENANCE ADVISED', note: `Maintenance advised on check ${d.maintenanceChecks.map((n) => `#${n}`).join(', ')}.`, color: [3, 105, 161] as [number, number, number] };
  return { label: 'FIT FOR USE', note: 'All equipment-specific checks passed.', color: GREEN };
}

export function certificateNumber(insp: Inspection, ctx: Pick<PackContext, 'client' | 'building'>) {
  return ['THS', ctx.client?.code ?? 'CL', ctx.building?.code ?? 'ST', insp.header.inspectionDate.replace(/-/g, ''), insp.id.slice(0, 6).toUpperCase()].join('-');
}

function drawCertificate(doc: jsPDF, insp: Inspection, ctx: PackContext) {
  const t = ctx.template;
  if (insp.status !== 'finalized') watermark(doc, insp.status === 'submitted' ? 'PENDING REVIEW' : 'DRAFT');
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.8); doc.rect(8, 8, PAGE_W - 16, PAGE_H - 16);
  doc.setLineWidth(0.2); doc.rect(10, 10, PAGE_W - 20, PAGE_H - 20);
  logo(doc, PAGE_W - MX - 2, 15);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(70, 70, 70);
  doc.text(ORG_NAME, PAGE_W / 2, 32, { align: 'center' });
  doc.setFontSize(17); doc.setTextColor(...INK);
  doc.text('MASTER INSPECTION & FITNESS CERTIFICATE', PAGE_W / 2, 41, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(`Certificate No. ${certificateNumber(insp, ctx)}`, PAGE_W / 2, 47, { align: 'center' });

  const v = verdict(t, insp);
  doc.setFillColor(...v.color); doc.roundedRect(MX, 53, CW, 15, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(v.label, PAGE_W / 2, 60, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(v.note, PAGE_W / 2, 65, { align: 'center' });

  const h = insp.header;
  const left: [string, string][] = [
    ['Customer / Organization', h.customerOrganization], ['Customer / Site', h.customerSite],
    ['City', ctx.building?.city ?? ''], ['Site / Location / Department', h.siteLocationDepartment],
    ['Equipment Type', EQUIPMENT_LABELS[h.equipmentType]], ['Equipment Asset ID', h.equipmentAssetId],
    ['Serial Number', h.serialNumber || 'Not recorded'], ['Manufacturer / Brand', h.manufacturer || 'Not recorded'],
  ];
  const right: [string, string][] = [
    ['Model', h.model || 'Not recorded'], ['Date of Installation / Purchase', formatDate(h.installDate) + (ctx.asset?.installDateEstimated ? ' (est.)' : '')],
    ['Previous Maintenance Date', formatDate(h.previousMaintenanceDate)], ['Date of Inspection', formatDate(h.inspectionDate)],
    ['Inspection Type', insp.kind === 'retest' ? 'Re-test' : 'Routine inspection'], ['Next Due Date', formatDate(h.nextDueDate)],
    ['Technician', h.technician], ['Inspection Performed By', h.inspectionPerformedBy],
  ];
  let y = 76;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text('Equipment & Site', MX, y); y += 3;
  for (let i = 0; i < left.length; i++) {
    kvRow(doc, MX, y, 41, 49, left[i][0], left[i][1], 7);
    kvRow(doc, MX + 90, y, 44, 46, right[i][0], right[i][1], 7);
    y += 7;
  }

  y += 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Inspection Summary', MX, y); y += 3;
  const counts = { P: 0, F: 0, M: 0, NA: 0, RECT: 0 } as Record<string, number>;
  insp.checks.forEach((c) => { if (c.status) counts[c.status]++; });
  const tiles: [string, string, [number, number, number]][] = [
    ['Pass', String(counts.P), GREEN], ['Fail', String(counts.F), counts.F ? RED : MUTED], ['Maintenance', String(counts.M), counts.M ? [3, 105, 161] : MUTED], ['N/A', String(counts.NA), MUTED],
    ['Rectified', String(counts.RECT), counts.RECT ? AMBER : MUTED],
    ['Functional test', insp.functionalTest.required === 'no' ? 'Not req.' : insp.functionalTest.result === 'pass' ? 'Pass' : insp.functionalTest.result === 'fail' ? 'Fail' : '—',
      insp.functionalTest.result === 'fail' ? RED : INK],
  ];
  const tw = CW / tiles.length;
  tiles.forEach(([label, value, color], i) => {
    const x = MX + i * tw;
    doc.setDrawColor(210, 214, 220); doc.setLineWidth(0.3); doc.roundedRect(x + 1, y, tw - 2, 17, 1.5, 1.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...color); doc.text(value, x + tw / 2, y + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(label, x + tw / 2, y + 14, { align: 'center' });
  });
  y += 23;
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(`Checklist: ${t.title} (template v${t.version}${t.provenance === 'drafted' ? ', drafted — awaiting client confirmation' : ''})`, MX, y);
  y += 6;

  const d = deriveResult(t, insp.checks, insp.functionalTest);
  const defects = [...d.failedChecks, ...d.maintenanceChecks, ...d.rectifiedChecks].sort((a, b) => a - b);
  if (defects.length || d.testFailed) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text('Defects & Corrective Action', MX, y); y += 2;
    for (const no of defects) {
      const item = t.checks.find((c) => c.no === no)!; const e = insp.checks.find((c) => c.no === no)!;
      const text = doc.splitTextToSize(`#${no} ${item.label} — ${STATUS_LABELS[e.status!]}${item.safetyCritical ? ' (safety-critical)' : ''}: ${e.remark}`, CW - 4) as string[];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...(e.status === 'F' ? RED : e.status === 'M' ? [3, 105, 161] as [number, number, number] : AMBER));
      doc.text(text, MX + 2, y + 4); y += text.length * 4 + 1;
    }
    if (d.testFailed) { doc.setTextColor(...RED); doc.text(`Functional / load test failed: ${insp.functionalTest.observations}`, MX + 2, y + 4); y += 5; }
    doc.setTextColor(...INK);
    doc.text(`Corrective action reference: ${insp.result.correctiveActionRef || '—'}`, MX + 2, y + 4); y += 8;
  }

  y = Math.max(y + 2, 205);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text('Declaration', MX, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const decl = doc.splitTextToSize(`This is to certify that the equipment described above was inspected on ${formatDate(h.inspectionDate)} in accordance with the attached equipment-specific checklist and, at the time of inspection, was found ${v.label.startsWith('NOT') ? 'NOT FIT FOR USE' : 'FIT FOR USE'}. This certificate is valid until ${formatDate(h.nextDueDate)} unless the equipment is damaged, modified or fails a user check before that date.`, CW) as string[];
  doc.text(decl, MX, y); y += decl.length * 4 + 4;

  const sw = CW / 2 - 3;
  for (const [i, [label, sig]] of ([['Technician signature / date', insp.technicianSignature], ['Reviewer signature / date', insp.reviewerSignature]] as const).entries()) {
    const x = MX + i * (sw + 6);
    doc.setDrawColor(...LINE); doc.rect(x, y, sw, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(label, x + 1.5, y + 3.5);
    sigImage(doc, sig, x + 1.5, y + 4.5, sw - 3, 14);
  }
  y += 26;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text('This certificate must be read together with the attached Equipment-Specific Checklist.', PAGE_W / 2, y, { align: 'center' });
}

function drawChecklist(doc: jsPDF, insp: Inspection, ctx: PackContext) {
  const t = ctx.template;
  if (insp.status !== 'finalized') watermark(doc, insp.status === 'submitted' ? 'PENDING REVIEW' : 'DRAFT');
  logo(doc, PAGE_W - MX - 2, 12);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(70, 70, 70);
  doc.text(ORG_NAME, PAGE_W / 2, 26, { align: 'center' });
  doc.setFontSize(15); doc.setTextColor(...INK);
  doc.text(t.title, PAGE_W / 2, 33, { align: 'center' });
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(t.subtitle, PAGE_W / 2, 38.5, { align: 'center' });

  let y = 42;
  const lw = 72, vw = CW - lw, rh = 5.4;
  for (const f of HEADER_FIELDS) {
    if (f.kind === 'equipmentType') {
      kvRow(doc, MX, y, lw, vw, f.label, '', rh);
      doc.setFontSize(8.5);
      let x = MX + lw + 2;
      for (const type of ['wheelchair', 'scoop_stretcher', 'folding_stretcher', 'generic_stretcher'] as EquipmentType[]) {
        x = checkbox(doc, x, y + rh / 2 + 1.3, insp.header.equipmentType === type, EQUIPMENT_LABELS[type], 2.8) - 2;
      }
    } else {
      const raw = String(insp.header[f.key] ?? '');
      kvRow(doc, MX, y, lw, vw, f.label, f.kind === 'date' ? (raw ? formatDate(raw) : '') : raw, rh);
    }
    y += rh;
  }

  y += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK); doc.text('Equipment-Specific Checks', MX, y); y += 2.5;
  const cols = [11, 89, 33, CW - 133];
  const xs = cols.map((_, i) => MX + cols.slice(0, i).reduce((s, w) => s + w, 0));
  doc.setFillColor(...HEAD); doc.rect(MX, y, CW, 5.2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
  ['No.', 'Inspection / Functional Test', 'Status (P/F/M/NA/RECT)', 'Remarks / Measurements'].forEach((h, i) => { fitText(doc, h, cols[i] - 3, 7.5); doc.text(h, xs[i] + 1.5, y + 3.6); });
  y += 5.2;
  for (const item of t.checks) {
    const e = insp.checks.find((c) => c.no === item.no);
    const meas = item.measurement && e?.measurement != null ? `${item.measurement.label}: ${e.measurement} ${item.measurement.unit}` : '';
    const photos = e?.photoIds.length ? `[${e.photoIds.length} photo${e.photoIds.length > 1 ? 's' : ''}]` : '';
    doc.setFontSize(8);
    const remark = doc.splitTextToSize([e?.remark, meas, photos].filter(Boolean).join(' · '), cols[3] - 3) as string[];
    const label = doc.splitTextToSize(item.label + (item.safetyCritical ? ' *' : ''), cols[1] - 3) as string[];
    const h = Math.max(5.6, Math.max(remark.length, label.length) * 3.5 + 2);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.25);
    cols.forEach((w, i) => doc.rect(xs[i], y, w, h));
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
    doc.text(String(item.no), xs[0] + 1.5, y + 3.9);
    doc.text(label, xs[1] + 1.5, y + 3.9);
    if (e?.status) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...(e.status === 'F' ? RED : e.status === 'RECT' ? AMBER : e.status === 'M' ? [3, 105, 161] as [number, number, number] : e.status === 'P' ? GREEN : MUTED));
      doc.text(e.status, xs[2] + cols[2] / 2, y + 3.9, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.text(remark, xs[3] + 1.5, y + 3.9);
    y += h;
  }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.8); doc.setTextColor(...MUTED);
  doc.text('P = Pass · F = Fail · M = Maintenance · NA = Not applicable · RECT = Rectified.   * Safety-critical: a Fail places the equipment out of service until a re-test passes.', MX, y + 3.2);

  y += 7.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(FUNCTIONAL_TEST_LABELS.section, MX, y); y += 2.5;
  const ft = insp.functionalTest;
  const flw = 74, fvw = CW - flw, frh = 5.5;
  kvRow(doc, MX, y, flw, fvw, FUNCTIONAL_TEST_LABELS.required, '', frh);
  doc.setFontSize(8.5);
  let x = checkbox(doc, MX + flw + 2, y + frh / 2 + 1.3, ft.required === 'yes', 'Yes', 2.8);
  x = checkbox(doc, x - 2, y + frh / 2 + 1.3, ft.required === 'no', 'No', 2.8);
  doc.setFont('helvetica', 'normal'); doc.text(`Reference: ${ft.reference || ''}`, x, y + frh / 2 + 1.2);
  y += frh;
  const na = ft.required === 'no' ? 'N/A — not required' : '';
  kvRow(doc, MX, y, flw, fvw, FUNCTIONAL_TEST_LABELS.method, ft.method || na, frh); y += frh;
  kvRow(doc, MX, y, flw, fvw, FUNCTIONAL_TEST_LABELS.criteria,
    [ft.criteria, ft.specifiedLoadKg != null ? `${ft.specifiedLoadKg} kg` : ''].filter(Boolean).join(' · ') || na, frh); y += frh;
  kvRow(doc, MX, y, flw, fvw, FUNCTIONAL_TEST_LABELS.observations,
    [ft.observations, ft.actualLoadKg != null ? `Applied ${ft.actualLoadKg} kg` : ''].filter(Boolean).join(' · ') || na, frh); y += frh;
  kvRow(doc, MX, y, flw, fvw, FUNCTIONAL_TEST_LABELS.result, '', frh);
  x = checkbox(doc, MX + flw + 2, y + frh / 2 + 1.3, ft.result === 'pass', 'Pass', 2.8);
  x = checkbox(doc, x - 2, y + frh / 2 + 1.3, ft.result === 'fail', 'Fail', 2.8);
  checkbox(doc, x - 2, y + frh / 2 + 1.3, ft.result === 'na', 'Not applicable', 2.8);
  y += frh + 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(RESULT_LABELS.section, MX, y); y += 5.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  x = checkbox(doc, MX, y, insp.result.allPassed, RESULT_LABELS.allPassed, 3);
  x = checkbox(doc, x, y, insp.result.defectsIdentified, RESULT_LABELS.defectsIdentified, 3);
  checkbox(doc, x, y, insp.result.retestRequired, RESULT_LABELS.retestRequired, 3);
  y += 4;
  kvRow(doc, MX, y, flw, fvw, RESULT_LABELS.correctiveActionRef, insp.result.correctiveActionRef, frh); y += frh;
  for (const [label, sig] of [[RESULT_LABELS.technicianSignature, insp.technicianSignature], [RESULT_LABELS.reviewerSignature, insp.reviewerSignature]] as const) {
    if (y + 11 > PAGE_H - 15) { doc.addPage(); y = 20; }
    kvRow(doc, MX, y, flw, fvw, label, '', 11);
    sigImage(doc, sig, MX + flw + 1.5, y + 0.5, fvw - 3, 10);
    y += 11;
  }
  if (insp.reviewerComment && insp.status !== 'finalized') {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...AMBER);
    doc.text(`Reviewer comment: ${insp.reviewerComment}`, MX, y + 5);
  }
}

function drawAppendix(doc: jsPDF, insp: Inspection, ctx: PackContext) {
  if (ctx.photos.length) {
    doc.addPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text('Photo Evidence', MX, 20);
    const colW = (CW - 6) / 2; let y = 26; let col = 0; let rowH = 0;
    for (const p of ctx.photos) {
      const h = Math.min(70, colW * (p.h / p.w));
      const w = h * (p.w / p.h);
      if (y + h + 10 > PAGE_H - 14) { doc.addPage(); y = 20; col = 0; }
      const x = MX + col * (colW + 6);
      try { doc.addImage(p.dataUrl, 'JPEG', x, y, w, h); } catch { /* skip unreadable */ }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      doc.text(doc.splitTextToSize(p.caption, colW) as string[], x, y + h + 4);
      rowH = Math.max(rowH, h + 10);
      if (col === 1) { y += rowH; rowH = 0; col = 0; } else col = 1;
    }
  }
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text('Change History (Audit Trail)', MX, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(`Inspection ${insp.id} · ${insp.events.length} recorded change(s)`, MX, 25);
  table(doc, 30, [{ title: 'When', w: 34 }, { title: 'By', w: 34 }, { title: 'Change', w: CW - 68 }],
    insp.events.map((e) => [formatDateTime(e.at), e.byName + (e.offline ? ' (offline)' : ''), describeEvent(e)]));
}

export function describeEvent(e: Inspection['events'][number]): string {
  const v = (x: unknown) => (x == null || x === '' ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x));
  switch (e.action) {
    case 'create': return 'Inspection started';
    case 'retest.start': return 'Re-test started';
    case 'submit': return 'Signed by technician and submitted for review';
    case 'finalize': return 'Reviewed, signed and finalised (locked)';
    case 'return': return `Returned to inspector: ${v(e.to)}`;
    case 'note': return v(e.to);
    default: return `${e.field ?? e.action}: ${v(e.from)} → ${v(e.to)}`;
  }
}

interface Col { title: string; w: number; align?: 'left' | 'right' | 'center' }

/** Paginating table with repeated header. Returns the y after the table. */
function table(doc: jsPDF, y: number, cols: Col[], rows: string[][], opts: { zebra?: boolean; color?: (r: number, c: number) => [number, number, number] | null } = {}) {
  const head = () => {
    doc.setFillColor(...INK); doc.rect(MX, y, CW, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    let x = MX;
    for (const c of cols) { doc.text(c.title, c.align === 'right' ? x + c.w - 1.5 : x + 1.5, y + 4, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w; }
    y += 6;
  };
  head();
  doc.setFontSize(7.5);
  rows.forEach((r, ri) => {
    doc.setFont('helvetica', 'normal');
    const wrapped = r.map((cell, i) => doc.splitTextToSize(cell ?? '', cols[i].w - 3) as string[]);
    const h = Math.max(5.5, Math.max(...wrapped.map((w) => w.length)) * 3.3 + 2.2);
    if (y + h > PAGE_H - 14) { doc.addPage(); y = 16; head(); doc.setFontSize(7.5); }
    if (opts.zebra !== false && ri % 2 === 1) { doc.setFillColor(246, 247, 249); doc.rect(MX, y, CW, h, 'F'); }
    doc.setDrawColor(228, 231, 236); doc.setLineWidth(0.2); doc.line(MX, y + h, MX + CW, y + h);
    let x = MX;
    wrapped.forEach((lines, i) => {
      const col = opts.color?.(ri, i);
      doc.setTextColor(...(col ?? INK));
      doc.setFont('helvetica', col ? 'bold' : 'normal');
      doc.text(lines, cols[i].align === 'right' ? x + cols[i].w - 1.5 : x + 1.5, y + 3.8, { align: cols[i].align === 'right' ? 'right' : 'left' });
      x += cols[i].w;
    });
    y += h;
  });
  return y;
}

export function inspectionPack(insp: Inspection, ctx: PackContext): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `${ctx.template.shortName} inspection ${insp.header.equipmentAssetId}`, author: ORG_NAME, creator: 'Think Inspect' });
  drawCertificate(doc, insp, ctx);
  doc.addPage();
  drawChecklist(doc, insp, ctx);
  drawAppendix(doc, insp, ctx);
  footer(doc, `${ORG_NAME} · ${insp.header.equipmentAssetId} · ${formatDate(insp.header.inspectionDate)} · ${insp.status.toUpperCase()}`);
  return doc;
}

/** A blank paper-equivalent checklist for printing in the field. */
export function blankChecklist(template: ChecklistTemplate): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const blank = {
    id: '', status: 'finalized', header: Object.fromEntries(HEADER_FIELDS.map((f) => [f.key, ''])) as unknown as Inspection['header'],
    checks: template.checks.map((c) => ({ no: c.no, status: null, remark: '', measurement: null, photoIds: [] })),
    functionalTest: { required: null, reference: '', method: '', criteria: '', observations: '', result: null, specifiedLoadKg: null, actualLoadKg: null },
    result: { allPassed: false, defectsIdentified: false, retestRequired: false, retestManual: false, correctiveActionRef: '' },
    technicianSignature: null, reviewerSignature: null, reviewerComment: '', events: [],
  } as unknown as Inspection;
  blank.header.equipmentType = template.id;
  drawChecklist(doc, blank, { template, photos: [] });
  return doc;
}

export function summaryReport(r: Report, opts: { title: string; filters: string[]; groupBy: GroupBy; generatedBy: string }): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(...INK); doc.rect(0, 0, PAGE_W, 38, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(150, 220, 205); doc.text(ORG_NAME, MX, 13);
  doc.setFontSize(18); doc.setTextColor(255, 255, 255); doc.text(opts.title, MX, 23);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(200, 205, 215);
  doc.text(`Period: ${r.range.from ? `${formatDate(r.range.from)} – ` : 'All time to '}${formatDate(r.range.to)}   ·   Generated ${formatDateTime(new Date().toISOString())} by ${opts.generatedBy}`, MX, 31);

  let y = 46;
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  const ft = doc.splitTextToSize(`Filters: ${opts.filters.length ? opts.filters.join(' · ') : 'None (all assets)'}`, CW) as string[];
  doc.text(ft, MX, y); y += ft.length * 3.6 + 3;

  const k = r.kpis;
  const tiles: [string, string, [number, number, number]][] = [
    ['Assets in scope', String(k.assets), INK],
    ['Compliance (in date)', `${k.compliance}%`, k.compliance >= 90 ? GREEN : k.compliance >= 60 ? AMBER : RED],
    ['Pass rate (period)', k.passRate == null ? '—' : `${k.passRate}%`, INK],
    ['Inspections (period)', String(k.inspections), INK],
    ['Open defects', String(k.openDefects), k.openDefects ? RED : GREEN],
    ['Out of service', String(k.outOfService), k.outOfService ? RED : GREEN],
    ['Overdue', String(k.overdue), k.overdue ? RED : GREEN],
    ['Due in 14 days', String(k.dueSoon), k.dueSoon ? AMBER : INK],
    ['Never inspected', String(k.never), k.never ? AMBER : INK],
    ['Incomplete records', String(k.incompleteData), MUTED],
  ];
  const tw = CW / 5;
  tiles.forEach(([label, value, color], i) => {
    const x = MX + (i % 5) * tw, ty = y + Math.floor(i / 5) * 21;
    doc.setDrawColor(222, 226, 232); doc.setLineWidth(0.3); doc.roundedRect(x + 0.8, ty, tw - 1.6, 18, 1.8, 1.8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...color); doc.text(value, x + 4, ty + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(label, x + 4, ty + 14.5);
  });
  y += 46;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...INK);
  doc.text(`Breakdown by ${GROUP_LABELS[opts.groupBy].toLowerCase()}`, MX, y); y += 3;
  const nameW = 50;
  y = table(doc, y, [
    { title: GROUP_LABELS[opts.groupBy], w: nameW }, { title: 'Assets', w: 13, align: 'right' }, { title: 'Inspected', w: 15, align: 'right' },
    { title: 'Pass rate', w: 15, align: 'right' }, { title: 'Defects', w: 14, align: 'right' }, { title: 'Out of svc', w: 15, align: 'right' },
    { title: 'Overdue', w: 14, align: 'right' }, { title: 'Due 14d', w: 13, align: 'right' }, { title: 'Never', w: 12, align: 'right' },
    { title: 'Compliance', w: CW - nameW - 111, align: 'right' },
  ], [...r.groups.map((g) => [g.sub ? `${g.label} — ${g.sub}` : g.label, String(g.assets), String(g.inspected), g.passRate == null ? '—' : `${g.passRate}%`,
    String(g.openDefects), String(g.outOfService), String(g.overdue), String(g.dueSoon), String(g.never), `${g.compliance}%`]),
  ['Total', String(k.assets), String(k.inspectedInPeriod), k.passRate == null ? '—' : `${k.passRate}%`, String(k.openDefects), String(k.outOfService),
    String(k.overdue), String(k.dueSoon), String(k.never), `${k.compliance}%`]],
  { color: (ri, ci) => {
    const g = r.groups[ri];
    if (!g) return INK; // totals row
    const v = ci === 4 ? g.openDefects : ci === 5 ? g.outOfService : ci === 6 ? g.overdue : 0;
    return v > 0 ? RED : null;
  } });

  y += 8;
  if (y > PAGE_H - 40) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...INK); doc.text(`Open defects (${r.defects.length})`, MX, y); y += 3;
  if (r.defects.length) {
    y = table(doc, y, [{ title: 'Asset', w: 32 }, { title: 'Site / floor', w: 38 }, { title: 'Check', w: 48 }, { title: 'Remark', w: 38 }, { title: 'Raised', w: CW - 156 }],
      r.defects.map((d) => [d.asset.assetTag, `${d.building?.name ?? ''}${d.floor ? ` · ${d.floor.name}` : ''}`,
        `${d.checkNo === 'TEST' ? 'Load test' : `#${d.checkNo}`} ${d.label}${d.safetyCritical ? ' (critical)' : ''}`, d.remark, formatDate(d.raisedAt)]),
      { color: (ri, ci) => (ci === 2 && r.defects[ri].safetyCritical ? RED : null) });
  } else { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text('No open defects.', MX, y + 5); y += 8; }

  y += 8;
  if (y > PAGE_H - 40) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...INK); doc.text(`Assets overdue or due within 14 days (${r.due.length})`, MX, y); y += 3;
  if (r.due.length) {
    table(doc, y, [{ title: 'Asset', w: 34 }, { title: 'Type', w: 28 }, { title: 'Make', w: 46 }, { title: 'Last inspected', w: 26 }, { title: 'Next due', w: CW - 134 }],
      r.due.slice(0, 400).map((a) => [a.assetTag, EQUIPMENT_LABELS[a.equipmentType], a.manufacturer ?? (a.candidateMakes.join(' / ') || 'Not recorded'),
        formatDate(a.lastInspectionDate), formatDate(a.nextDueDate)]),
      { color: (ri, ci) => (ci === 4 && (r.due[ri].nextDueDate ?? '') < new Date().toISOString().slice(0, 10) ? RED : null) });
  } else { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text('Nothing due in the next 14 days.', MX, y + 5); }

  footer(doc, `${ORG_NAME} · ${opts.title}`);
  return doc;
}
