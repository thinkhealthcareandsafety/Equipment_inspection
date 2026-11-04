import { saveFile } from './files.ts';
import {
  daysLeftIn, EQUIPMENT_LABELS, fyLabel, inQuarter, quarterFromKey, quarterLabel, quarterOf, shiftQuarter, todayISO, CLOSING_DAYS,
  type Asset, type AssetStatus, type Building, type Client, type EquipmentType, type Floor, type Inspection, type OpenDefect, type Quarter,
} from '@think/shared';

export interface ReportFilters {
  clientId: string; city: string; buildingId: string; floorId: string;
  equipmentType: EquipmentType | ''; status: AssetStatus | '';
  period: Period;
  /** A specific past quarter, e.g. "2026-Q2" (from Home's Past quarters). Overrides `period`. */
  quarterKey?: string;
}

export const EMPTY_FILTERS: ReportFilters = {
  clientId: '', city: '', buildingId: '', floorId: '', equipmentType: '', status: '', period: 'quarter',
};

export type GroupBy = 'city' | 'building' | 'floor' | 'equipmentType';
export const GROUP_LABELS: Record<GroupBy, string> = { city: 'City', building: 'Site', floor: 'Floor', equipmentType: 'Equipment type' };

export interface GroupRow {
  key: string; label: string; sub: string;
  assets: number; inspected: number; inspections: number; passed: number; passRate: number | null;
  openDefects: number; outOfService: number;
  /** Units not yet inspected in the quarter (for a finished quarter: missed). */
  todo: number;
  never: number;
  /** Percentage of units done in the quarter. */
  compliance: number;
  /** Units done in the quarter. */
  inDate: number;
  /** Of those, units that failed and are out of service. */
  doneFailed: number;
}

export interface DefectRow extends OpenDefect { asset: Asset; building?: Building; floor?: Floor }

export interface Report {
  range: { from: string | null; to: string };
  /** The quarter "done" is measured against: the current one, or the past quarter being looked at. */
  quarter: Quarter;
  /** True when that quarter is over (its numbers are final). */
  closed: boolean;
  daysLeft: number;
  kpis: {
    assets: number; inspectedInPeriod: number; inspections: number; passRate: number | null; compliance: number;
    /** Units inspected in the quarter. */
    inDate: number;
    /** Units not inspected in the quarter yet (missed, for a finished quarter). */
    todo: number;
    openDefects: number; safetyCritical: number; outOfService: number; never: number; incompleteData: number;
  };
  groups: GroupRow[];
  defects: DefectRow[];
  /** Units still to inspect in the quarter (missed, for a finished one): the work list. */
  toInspect: Asset[];
  assets: Asset[];
  inspections: Inspection[];
}

/** Inspections are quarterly, so reports work in financial-year quarters (Q3 = Oct–Dec). */
export type Period = 'quarter' | 'last_quarter' | 'year' | 'all';

export function reportQuarter(f: Pick<ReportFilters, 'period' | 'quarterKey'>, today = todayISO()): Quarter {
  const picked = f.quarterKey ? quarterFromKey(f.quarterKey) : null;
  if (picked) return picked;
  return f.period === 'last_quarter' ? shiftQuarter(quarterOf(today), -1) : quarterOf(today);
}

export function periodLabel(p: Period, today = todayISO(), quarterKey?: string): string {
  const picked = quarterKey ? quarterFromKey(quarterKey) : null;
  if (picked) return `${quarterLabel(picked)} · ${fyLabel(picked)}`;
  const now = quarterOf(today);
  if (p === 'quarter') return `${quarterLabel(now)} · this quarter`;
  if (p === 'last_quarter') return `${quarterLabel(shiftQuarter(now, -1))} · last quarter`;
  if (p === 'year') return `${fyLabel(now)} · Apr–Mar`;
  return 'All time';
}

export function periodRange(f: Pick<ReportFilters, 'period' | 'quarterKey'>, today = todayISO()): { from: string | null; to: string } {
  const picked = f.quarterKey ? quarterFromKey(f.quarterKey) : null;
  if (picked) return { from: picked.from, to: picked.to < today ? picked.to : today };
  const now = quarterOf(today);
  switch (f.period) {
    case 'quarter': return { from: now.from, to: today };
    case 'last_quarter': { const q = shiftQuarter(now, -1); return { from: q.from, to: q.to }; }
    case 'year': return { from: shiftQuarter(now, -(now.n - 1)).from, to: today };
    default: return { from: null, to: today };
  }
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const signed = (i: Inspection) => i.status === 'submitted' || i.status === 'finalized';

export function buildReport(
  data: { assets: Asset[]; buildings: Building[]; floors: Floor[]; inspections: Inspection[]; clients: Client[] },
  f: ReportFilters, groupBy: GroupBy, today = todayISO(),
): Report {
  const bById = new Map(data.buildings.map((b) => [b.id, b]));
  const fById = new Map(data.floors.map((x) => [x.id, x]));
  const range = periodRange(f, today);
  const quarter = reportQuarter(f, today);
  const closed = quarter.to < today;
  const daysLeft = closed ? 0 : daysLeftIn(quarter, today);
  const assets = data.assets.filter((a) => {
    const b = bById.get(a.buildingId);
    if (a.status === 'removed') return false;
    if (f.clientId && a.clientId !== f.clientId) return false;
    if (f.city && b?.city !== f.city) return false;
    if (f.buildingId && a.buildingId !== f.buildingId) return false;
    if (f.floorId && (f.floorId === '__none' ? a.floorId : a.floorId !== f.floorId)) return false;
    if (f.equipmentType && a.equipmentType !== f.equipmentType) return false;
    if (f.status && a.status !== f.status) return false;
    return true;
  });
  const assetIds = new Set(assets.map((a) => a.id));
  const inspections = data.inspections.filter((i) => assetIds.has(i.assetId) && signed(i)
    && (!range.from || i.header.inspectionDate >= range.from) && i.header.inspectionDate <= range.to);
  // Done = a signed inspection inside the quarter. For the current quarter the unit's own last date also counts,
  // so a unit signed on this device shows as done straight away.
  const doneIds = new Set(data.inspections.filter((i) => signed(i) && inQuarter(i.header.inspectionDate, quarter)).map((i) => i.assetId));
  const isDone = (a: Asset) => doneIds.has(a.id) || (!closed && inQuarter(a.lastInspectionDate, quarter));

  const keyOf = (a: Asset): [string, string, string] => {
    const b = bById.get(a.buildingId);
    switch (groupBy) {
      case 'city': return [b?.city ?? '—', b?.city ?? '—', ''];
      case 'building': return [a.buildingId, b?.name ?? '—', b?.city ?? ''];
      case 'floor': {
        const fl = a.floorId ? fById.get(a.floorId) : undefined;
        return [`${a.buildingId}|${a.floorId ?? 'none'}`, fl?.name ?? 'Unassigned floor', b ? `${b.name}, ${b.city}` : ''];
      }
      case 'equipmentType': return [a.equipmentType, EQUIPMENT_LABELS[a.equipmentType], ''];
    }
  };

  const inspByAsset = new Map<string, Inspection[]>();
  for (const i of inspections) inspByAsset.set(i.assetId, [...(inspByAsset.get(i.assetId) ?? []), i]);

  const groups = new Map<string, GroupRow>();
  for (const a of assets) {
    const [key, label, sub] = keyOf(a);
    const g = groups.get(key) ?? { key, label, sub, assets: 0, inspected: 0, inspections: 0, passed: 0, passRate: null,
      openDefects: 0, outOfService: 0, todo: 0, never: 0, compliance: 0, inDate: 0, doneFailed: 0 };
    g.assets++;
    const ins = inspByAsset.get(a.id) ?? [];
    if (ins.length) g.inspected++;
    g.inspections += ins.length;
    g.passed += ins.filter((i) => !i.result.defectsIdentified).length;
    g.openDefects += a.openDefects.length;
    if (a.status === 'out_of_service') g.outOfService++;
    if (!a.lastInspectionDate) g.never++;
    if (isDone(a)) { g.inDate++; if (a.status === 'out_of_service') g.doneFailed++; } else g.todo++;
    groups.set(key, g);
  }
  const rows = [...groups.values()].map((g) => ({ ...g, passRate: g.inspections ? pct(g.passed, g.inspections) : null, compliance: pct(g.inDate, g.assets) }))
    .sort((a, b) => (a.sub + a.label).localeCompare(b.sub + b.label, undefined, { numeric: true }));

  const defects: DefectRow[] = assets.flatMap((a) => a.openDefects.map((d) => ({ ...d, asset: a, building: bById.get(a.buildingId), floor: a.floorId ? fById.get(a.floorId) : undefined })))
    .sort((x, y) => Number(y.safetyCritical) - Number(x.safetyCritical) || x.raisedAt.localeCompare(y.raisedAt));
  const siteName = (a: Asset) => `${bById.get(a.buildingId)?.city ?? ''} ${bById.get(a.buildingId)?.name ?? ''}`;
  const toInspect = assets.filter((a) => !isDone(a))
    .sort((x, y) => siteName(x).localeCompare(siteName(y)) || x.assetTag.localeCompare(y.assetTag, undefined, { numeric: true }));

  const passed = inspections.filter((i) => !i.result.defectsIdentified).length;
  const done = assets.length - toInspect.length;

  return {
    range, quarter, closed, daysLeft,
    kpis: {
      assets: assets.length,
      inspectedInPeriod: new Set(inspections.map((i) => i.assetId)).size,
      inspections: inspections.length,
      passRate: inspections.length ? pct(passed, inspections.length) : null,
      compliance: pct(done, assets.length),
      inDate: done,
      todo: toInspect.length,
      openDefects: defects.length,
      safetyCritical: defects.filter((d) => d.safetyCritical).length,
      outOfService: assets.filter((a) => a.status === 'out_of_service').length,
      never: assets.filter((a) => !a.lastInspectionDate).length,
      incompleteData: assets.filter((a) => a.dataFlags.some((x) => x !== 'SERIAL_MISSING' && x !== 'FLOOR_UNASSIGNED')).length,
    },
    groups: rows, defects, toInspect, assets, inspections,
  };
}

/** True when the quarter is in its last two weeks and work is left. */
export const closingSoon = (r: Pick<Report, 'closed' | 'daysLeft' | 'kpis'>) => !r.closed && r.daysLeft <= CLOSING_DAYS && r.kpis.todo > 0;

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

/** CSV with a byte-order mark so Excel opens the text correctly. */
export function download(name: string, csv: string) {
  return saveFile(name, new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
}
