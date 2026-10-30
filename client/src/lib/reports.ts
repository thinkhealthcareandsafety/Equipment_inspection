import { saveFile } from './files.ts';
import {
  diffDays, dueState, EQUIPMENT_LABELS, todayISO,
  type Asset, type AssetStatus, type Building, type Client, type DueState, type EquipmentType, type Floor, type Inspection, type OpenDefect,
} from '@think/shared';

export interface ReportFilters {
  clientId: string; city: string; buildingId: string; floorId: string;
  equipmentType: EquipmentType | ''; status: AssetStatus | ''; due: DueState | '';
  period: Period; from: string; to: string;
}

export const EMPTY_FILTERS: ReportFilters = {
  clientId: '', city: '', buildingId: '', floorId: '', equipmentType: '', status: '', due: '', period: 'quarter', from: '', to: '',
};

export type GroupBy = 'city' | 'building' | 'floor' | 'equipmentType';
export const GROUP_LABELS: Record<GroupBy, string> = { city: 'City', building: 'Site', floor: 'Floor', equipmentType: 'Equipment type' };

export interface GroupRow {
  key: string; label: string; sub: string;
  assets: number; inspected: number; inspections: number; passed: number; passRate: number | null;
  openDefects: number; outOfService: number; overdue: number; dueSoon: number; never: number; compliance: number;
}

export interface DefectRow extends OpenDefect { asset: Asset; building?: Building; floor?: Floor }

export interface Report {
  range: { from: string | null; to: string };
  kpis: {
    assets: number; inspectedInPeriod: number; inspections: number; passRate: number | null; compliance: number;
    openDefects: number; safetyCritical: number; outOfService: number; overdue: number; dueSoon: number; never: number; incompleteData: number;
  };
  groups: GroupRow[];
  defects: DefectRow[];
  due: Asset[];
  /** Overdue, due within 14 days, or never inspected — the inspector's work list. */
  toInspect: Asset[];
  assets: Asset[];
  inspections: Inspection[];
}

/** Inspections are quarterly, so reports work in calendar quarters. */
export type Period = 'quarter' | 'last_quarter' | 'year' | 'all';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function quarterOf(iso: string, offset = 0) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1;
  let q = Math.floor(m / 3) + offset, yy = y;
  while (q < 0) { q += 4; yy--; }
  const from = `${yy}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  const endMonth = q * 3 + 3;
  const last = new Date(Date.UTC(yy, endMonth, 0)).getUTCDate();
  return { from, to: `${yy}-${String(endMonth).padStart(2, '0')}-${last}`, label: `${MON[q * 3]}–${MON[q * 3 + 2]} ${yy}` };
}

export function periodLabel(p: Period, today = todayISO()): string {
  if (p === 'quarter') return `This quarter (${quarterOf(today).label})`;
  if (p === 'last_quarter') return `Last quarter (${quarterOf(today, -1).label})`;
  if (p === 'year') return `This year (${today.slice(0, 4)})`;
  return 'All time';
}

export function periodRange(f: Pick<ReportFilters, 'period'>, today = todayISO()): { from: string | null; to: string } {
  switch (f.period) {
    case 'quarter': { const q = quarterOf(today); return { from: q.from, to: today }; }
    case 'last_quarter': { const q = quarterOf(today, -1); return { from: q.from, to: q.to }; }
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default: return { from: null, to: today };
  }
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function buildReport(
  data: { assets: Asset[]; buildings: Building[]; floors: Floor[]; inspections: Inspection[]; clients: Client[] },
  f: ReportFilters, groupBy: GroupBy, today = todayISO(),
): Report {
  const bById = new Map(data.buildings.map((b) => [b.id, b]));
  const fById = new Map(data.floors.map((x) => [x.id, x]));
  const range = periodRange(f, today);
  const assets = data.assets.filter((a) => {
    const b = bById.get(a.buildingId);
    if (f.clientId && a.clientId !== f.clientId) return false;
    if (f.city && b?.city !== f.city) return false;
    if (f.buildingId && a.buildingId !== f.buildingId) return false;
    if (f.floorId && (f.floorId === '__none' ? a.floorId : a.floorId !== f.floorId)) return false;
    if (f.equipmentType && a.equipmentType !== f.equipmentType) return false;
    if (f.status && a.status !== f.status) return false;
    if (f.due && dueState(a.nextDueDate, today) !== f.due) return false;
    return true;
  });
  const assetIds = new Set(assets.map((a) => a.id));
  const inspections = data.inspections.filter((i) => assetIds.has(i.assetId) && (i.status === 'submitted' || i.status === 'finalized')
    && (!range.from || i.header.inspectionDate >= range.from) && i.header.inspectionDate <= range.to);

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
      openDefects: 0, outOfService: 0, overdue: 0, dueSoon: 0, never: 0, compliance: 0 };
    g.assets++;
    const ins = inspByAsset.get(a.id) ?? [];
    if (ins.length) g.inspected++;
    g.inspections += ins.length;
    g.passed += ins.filter((i) => !i.result.defectsIdentified).length;
    g.openDefects += a.openDefects.length;
    if (a.status === 'out_of_service') g.outOfService++;
    const d = dueState(a.nextDueDate, today);
    if (d === 'overdue') g.overdue++;
    if (d === 'due_soon') g.dueSoon++;
    if (d === 'never') g.never++;
    if (d === 'ok' || d === 'due_soon') g.compliance++;
    groups.set(key, g);
  }
  const rows = [...groups.values()].map((g) => ({ ...g, passRate: g.inspections ? pct(g.passed, g.inspections) : null, compliance: pct(g.compliance, g.assets) }))
    .sort((a, b) => (a.sub + a.label).localeCompare(b.sub + b.label, undefined, { numeric: true }));

  const defects: DefectRow[] = assets.flatMap((a) => a.openDefects.map((d) => ({ ...d, asset: a, building: bById.get(a.buildingId), floor: a.floorId ? fById.get(a.floorId) : undefined })))
    .sort((x, y) => Number(y.safetyCritical) - Number(x.safetyCritical) || x.raisedAt.localeCompare(y.raisedAt));
  const due = assets.filter((a) => ['overdue', 'due_soon'].includes(dueState(a.nextDueDate, today)))
    .sort((x, y) => (x.nextDueDate ?? '').localeCompare(y.nextDueDate ?? ''));
  const rank = { overdue: 0, due_soon: 1, never: 2, ok: 3 } as const;
  const toInspect = assets.filter((a) => dueState(a.nextDueDate, today) !== 'ok' && a.status !== 'removed')
    .sort((x, y) => rank[dueState(x.nextDueDate, today)] - rank[dueState(y.nextDueDate, today)] || (x.nextDueDate ?? '').localeCompare(y.nextDueDate ?? '')
      || x.assetTag.localeCompare(y.assetTag, undefined, { numeric: true }));

  const states = assets.map((a) => dueState(a.nextDueDate, today));
  const passed = inspections.filter((i) => !i.result.defectsIdentified).length;

  return {
    range,
    kpis: {
      assets: assets.length,
      inspectedInPeriod: new Set(inspections.map((i) => i.assetId)).size,
      inspections: inspections.length,
      passRate: inspections.length ? pct(passed, inspections.length) : null,
      compliance: pct(states.filter((s) => s === 'ok' || s === 'due_soon').length, assets.length),
      openDefects: defects.length,
      safetyCritical: defects.filter((d) => d.safetyCritical).length,
      outOfService: assets.filter((a) => a.status === 'out_of_service').length,
      overdue: states.filter((s) => s === 'overdue').length,
      dueSoon: states.filter((s) => s === 'due_soon').length,
      never: states.filter((s) => s === 'never').length,
      incompleteData: assets.filter((a) => a.dataFlags.some((x) => x !== 'SERIAL_MISSING' && x !== 'FLOOR_UNASSIGNED')).length,
    },
    groups: rows, defects, due, toInspect, assets, inspections,
  };
}

export function daysOverdue(a: Asset, today = todayISO()) {
  return a.nextDueDate ? -diffDays(a.nextDueDate, today) : null;
}

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
