/**
 * Reports in two taps: pick a place (city → site → floor) and a quarter,
 * then one of five ready-made views. PDF and Excel export exactly what is shown.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { EQUIPMENT_LABELS, formatDate, relativeDue, STATUS_LABELS, todayISO, type EquipmentType } from '@think/shared';
import { useAllData, useUser } from '../lib/hooks.ts';
import { buildReport, download, EMPTY_FILTERS, periodLabel, roundText, roundTone, toCSV, type GroupBy, type Period, type ReportFilters } from '../lib/reports.ts';
import { summaryReport } from '../lib/pdf.ts';
import { saveFile } from '../lib/files.ts';
import { ASSET_STATUS, AssetStatusBadge, Badge, Bar, Button, Card, Chip, cx, DueBadge, Empty, EquipmentAvatar, InspectionStatusBadge, useToast } from '../components/ui.tsx';
import { Skeleton } from './Dashboard.tsx';

type View = 'summary' | 'due' | 'oos' | 'defects' | 'done';
const PERIODS: Period[] = ['quarter', 'last_quarter', 'year', 'all'];
const PERIOD_SHORT: Record<Period, string> = { quarter: 'This quarter', last_quarter: 'Last quarter', year: 'This year', all: 'All time' };

export function Reports() {
  const data = useAllData();
  const user = useUser();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const p = (k: string) => params.get(k) ?? '';
  const city = p('city'), buildingId = p('buildingId'), floorId = p('floorId');
  const type = p('type') as EquipmentType | '';
  const period = (p('period') || 'quarter') as Period;
  const view = (p('view') || 'summary') as View;
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    setParams(n, { replace: true });
  };

  const group: GroupBy = floorId ? 'equipmentType' : buildingId ? 'floor' : city ? 'building' : 'city';
  const filters: ReportFilters = { ...EMPTY_FILTERS, city, buildingId, floorId, equipmentType: type, period };
  const report = useMemo(() => data && buildReport(data, filters, group), [data, params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !report) return <Skeleton />;

  const bById = new Map(data.buildings.map((b) => [b.id, b]));
  const fById = new Map(data.floors.map((f) => [f.id, f]));
  const floorName = (id: string) => (id === '__none' ? 'Unassigned floor' : fById.get(id)?.name ?? '');
  const k = report.kpis;
  const place = floorId ? `${bById.get(buildingId)?.name} · ${floorName(floorId)}` : buildingId ? `${bById.get(buildingId)?.name}, ${bById.get(buildingId)?.city}` : city || 'All sites';
  const done = [...report.inspections].sort((a, b) => b.header.inspectionDate.localeCompare(a.header.inspectionDate));
  const oos = report.assets.filter((a) => a.status !== 'in_service');

  // Next level to drill into, shown as tappable chips.
  const nextLevel: { id: string; label: string; count: number; patch: Record<string, string> }[] = !city
    ? [...new Set(data.buildings.map((b) => b.city))].sort().map((c) => ({ id: c, label: c, count: data.assets.filter((a) => bById.get(a.buildingId)?.city === c).length, patch: { city: c } }))
    : !buildingId
      ? data.buildings.filter((b) => b.city === city).sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ id: b.id, label: b.name, count: data.assets.filter((a) => a.buildingId === b.id).length, patch: { buildingId: b.id } }))
      : !floorId
        ? [...data.floors.filter((f) => f.buildingId === buildingId).sort((a, b) => a.sortOrder - b.sortOrder).map((f) => ({ id: f.id, label: f.name, count: data.assets.filter((a) => a.floorId === f.id).length, patch: { floorId: f.id } })),
          { id: '__none', label: 'Unassigned', count: data.assets.filter((a) => a.buildingId === buildingId && !a.floorId).length, patch: { floorId: '__none' } }].filter((x) => x.count > 0)
        : [];

  const fileBase = `${place.replace(/[^\w]+/g, '-')}_${period}_${todayISO()}`;
  const exportPdf = async () => {
    setBusy(true);
    try {
      await saveFile(`Inspection-report_${fileBase}.pdf`, summaryReport(report, {
        title: `Inspection Report — ${place}`, groupBy: group, generatedBy: user.name,
        filters: [periodLabel(period), type ? EQUIPMENT_LABELS[type] : 'All equipment'],
      }).output('blob'));
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  const exportExcel = async () => {
    const site = (id: string) => `${bById.get(id)?.name ?? ''}, ${bById.get(id)?.city ?? ''}`;
    const rows: (string | number | null)[][] =
      view === 'summary' ? [['Name', 'Context', 'Assets', 'Inspected this period', 'Pass rate %', 'In date %', 'Open defects', 'Out of service', 'Overdue', 'Due in 14 days', 'Never inspected'],
        ...report.groups.map((g) => [g.label, g.sub, g.assets, g.inspected, g.passRate, g.compliance, g.openDefects, g.outOfService, g.overdue, g.dueSoon, g.never])]
      : view === 'due' ? [['Asset', 'Type', 'Site', 'Floor', 'Last inspected', 'Next due', 'Status'],
        ...report.toInspect.map((a) => [a.assetTag, EQUIPMENT_LABELS[a.equipmentType], site(a.buildingId), a.floorId ? floorName(a.floorId) : '', a.lastInspectionDate, a.nextDueDate, relativeDue(a.nextDueDate)])]
      : view === 'oos' ? [['Asset', 'Type', 'Site', 'Status', 'Reason'], ...oos.map((a) => [a.assetTag, EQUIPMENT_LABELS[a.equipmentType], site(a.buildingId), ASSET_STATUS[a.status].label, a.statusReason])]
      : view === 'defects' ? [['Asset', 'Site', 'Check', 'Safety-critical', 'Remark', 'Corrective action', 'Raised'],
        ...report.defects.map((d) => [d.asset.assetTag, site(d.asset.buildingId), `${d.checkNo === 'TEST' ? 'Load test' : `#${d.checkNo}`} ${d.label}`, d.safetyCritical ? 'Yes' : 'No', d.remark, d.correctiveActionRef, d.raisedAt])]
      : [['Date', 'Asset', 'Type', 'Site', 'Location', 'Technician', 'P', 'F', 'M', 'NA', 'RECT', 'Functional test', 'Result', 'Status', 'Next due'],
        ...done.map((i) => {
          const n = (s: string) => i.checks.filter((c) => c.status === s).length;
          return [i.header.inspectionDate, i.header.equipmentAssetId, EQUIPMENT_LABELS[i.templateId], i.header.customerSite, i.header.siteLocationDepartment, i.header.technician,
            n('P'), n('F'), n('M'), n('NA'), n('RECT'), i.functionalTest.result ?? '', i.result.defectsIdentified ? 'Defects' : 'Pass', i.status, i.header.nextDueDate];
        })];
    try { await download(`${view}_${fileBase}.csv`, toCSV(rows)); } catch (e) { toast((e as Error).message, 'err'); }
  };

  const tabs: { id: View; label: string; n?: number; tone?: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'due', label: 'To inspect', n: report.toInspect.length },
    { id: 'oos', label: 'Out of service', n: oos.length, tone: oos.length ? 'text-rose-600' : '' },
    { id: 'defects', label: 'Open defects', n: report.defects.length, tone: report.defects.length ? 'text-rose-600' : '' },
    { id: 'done', label: 'Inspections done', n: done.length },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Reports</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[15px]">
            <button className={cx(city ? 'text-brand-700 hover:underline' : 'font-medium')} onClick={() => set({ city: '', buildingId: '', floorId: '' })}>All sites</button>
            {city && <><ChevronRight className="h-4 w-4 text-slate-300" /><button className={cx(buildingId ? 'text-brand-700 hover:underline' : 'font-medium')} onClick={() => set({ buildingId: '', floorId: '' })}>{city}</button></>}
            {buildingId && <><ChevronRight className="h-4 w-4 text-slate-300" /><button className={cx(floorId ? 'text-brand-700 hover:underline' : 'font-medium')} onClick={() => set({ floorId: '' })}>{bById.get(buildingId)?.name}</button></>}
            {floorId && <><ChevronRight className="h-4 w-4 text-slate-300" /><span className="font-medium">{floorName(floorId)}</span></>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="dark" icon={<FileText className="h-4 w-4" />} disabled={busy} onClick={exportPdf}>PDF</Button>
          <Button icon={<FileSpreadsheet className="h-4 w-4" />} onClick={exportExcel}>Excel</Button>
        </div>
      </div>

      {/* Filters: all taps, no dropdowns */}
      <div className="mb-5 space-y-2.5">
        {nextLevel.length > 0 && (
          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {nextLevel.map((x) => <Chip key={x.id} onClick={() => set(x.patch)} count={x.count}>{x.label}</Chip>)}
          </div>
        )}
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {PERIODS.map((x) => <Chip key={x} active={period === x} onClick={() => set({ period: x === 'quarter' ? '' : x })}>{PERIOD_SHORT[x]}</Chip>)}
          <span className="mx-1 w-px shrink-0 bg-slate-200" />
          <Chip active={!type} onClick={() => set({ type: '' })}>All equipment</Chip>
          {(Object.keys(EQUIPMENT_LABELS) as EquipmentType[]).map((t) => <Chip key={t} active={type === t} onClick={() => set({ type: t })}>{EQUIPMENT_LABELS[t]}</Chip>)}
        </div>
      </div>

      {/* Four numbers that matter */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Assets" value={k.assets} sub={place} />
        <Kpi label="Round progress" value={k.inDate === 0 ? '—' : `${Math.round(k.compliance)}%`} sub={roundText(k)} tone={roundTone(k) === 'neutral' ? undefined : roundTone(k) === 'red' ? 'red' : 'green'} />
        <Kpi label={`Inspected · ${PERIOD_SHORT[period].toLowerCase()}`} value={k.inspectedInPeriod} sub={k.passRate == null ? 'No inspections yet' : `${k.passRate}% passed first time`} />
        <Kpi label="Open defects" value={k.openDefects} sub={`${k.outOfService} out of service`} tone={k.openDefects ? 'red' : 'green'} />
      </div>

      <div className="scrollbar-none -mx-4 mb-3 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => set({ view: t.id === 'summary' ? '' : t.id })}
            className={cx('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition', view === t.id ? 'border-ink-950 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {t.label}{t.n != null && <span className={cx('ml-1.5 tabular', t.tone)}>{t.n}</span>}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {view === 'summary' && (report.groups.length === 0 ? <Empty title="No assets here" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-3 sm:px-5">{group === 'city' ? 'City' : group === 'building' ? 'Site' : group === 'floor' ? 'Floor' : 'Equipment'}</th>
                <th className="px-3 py-3 text-right">Assets</th>
                <th className="hidden px-3 py-3 text-right sm:table-cell">Inspected</th>
                <th className="px-3 py-3 text-right">Defects</th>
                <th className="hidden px-3 py-3 text-right sm:table-cell">Overdue</th>
                <th className="w-36 px-4 py-3 sm:w-48 sm:px-5">Inspected</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {report.groups.map((g) => {
                  const drill: Record<string, string> = group === 'city' ? { city: g.key } : group === 'building' ? { buildingId: g.key } : group === 'floor' ? { floorId: g.key.split('|')[1] === 'none' ? '__none' : g.key.split('|')[1] } : { type: g.key };
                  return (
                    <tr key={g.key} className="cursor-pointer hover:bg-slate-50" onClick={() => set(drill)}>
                      <td className="px-4 py-3 font-medium sm:px-5"><span className="inline-flex items-center gap-1">{g.label}<ChevronRight className="h-4 w-4 text-slate-300" /></span></td>
                      <td className="px-3 py-3 text-right tabular">{g.assets}</td>
                      <td className="hidden px-3 py-3 text-right tabular sm:table-cell">{g.inspected}</td>
                      <td className={cx('px-3 py-3 text-right tabular', g.openDefects > 0 && 'font-semibold text-rose-600')}>{g.openDefects}</td>
                      <td className={cx('hidden px-3 py-3 text-right tabular sm:table-cell', g.overdue > 0 && 'font-semibold text-rose-600')}>{g.overdue}</td>
                      <td className="px-4 py-3 sm:px-5"><div className="flex items-center gap-2"><Bar value={g.compliance} tone="brand" /><span className="w-14 text-right text-xs tabular text-slate-500">{g.inDate}/{g.assets}</span></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {view === 'due' && <AssetList assets={report.toInspect} empty="Everything here is inspected and in date" right={(a) => <DueBadge nextDue={a.nextDueDate} />} sub={(a) => `${bById.get(a.buildingId)?.name}${a.floorId ? ` · ${floorName(a.floorId)}` : ''} · last ${formatDate(a.lastInspectionDate)}`} />}
        {view === 'oos' && <AssetList assets={oos} empty="Every asset is in service" right={(a) => <AssetStatusBadge status={a.status} />} sub={(a) => `${bById.get(a.buildingId)?.name} · ${a.statusReason ?? ''}`} />}

        {view === 'defects' && (report.defects.length === 0 ? <Empty title="No open defects" /> : (
          <ul className="divide-y divide-slate-100">
            {report.defects.map((d) => (
              <li key={`${d.inspectionId}-${d.checkNo}`}><Link to={`/assets/${d.asset.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                <EquipmentAvatar type={d.asset.equipmentType} tone={d.safetyCritical ? 'red' : 'amber'} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.asset.assetTag} · {d.checkNo === 'TEST' ? 'Load test' : `#${d.checkNo}`} {d.label}</div>
                  <div className="truncate text-sm text-slate-500">“{d.remark}” · {d.building?.name} · {d.correctiveActionRef || 'no CAR'} · {formatDate(d.raisedAt)}</div>
                </div>
                {d.safetyCritical && <Badge tone="red">Critical</Badge>}
              </Link></li>
            ))}
          </ul>
        ))}

        {view === 'done' && (done.length === 0 ? <Empty title={`No inspections ${PERIOD_SHORT[period].toLowerCase()}`} /> : (
          <ul className="divide-y divide-slate-100">
            {done.map((i) => {
              const f = i.checks.filter((c) => c.status === 'F').length, m = i.checks.filter((c) => c.status === 'M').length;
              return (
                <li key={i.id}><Link to={`/inspections/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <EquipmentAvatar type={i.templateId} tone={f ? 'red' : 'default'} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.header.equipmentAssetId} <span className="font-normal text-slate-500">· {formatDate(i.header.inspectionDate)}</span></div>
                    <div className="truncate text-sm text-slate-500">{i.header.customerSite}{i.header.siteLocationDepartment ? ` · ${i.header.siteLocationDepartment}` : ''} · {i.header.technician}
                      {f ? ` · ${f} ${STATUS_LABELS.F}` : ''}{m ? ` · ${m} ${STATUS_LABELS.M}` : ''}</div>
                  </div>
                  <InspectionStatusBadge status={i.status} />
                </Link></li>
              );
            })}
          </ul>
        ))}
      </Card>
      <p className="mt-3 text-xs text-slate-500">{periodLabel(period)}. "Inspected" means checked within the current 90-day cycle. PDF gives the full report for {place}; Excel exports the list on screen.</p>
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub: string; tone?: 'green' | 'amber' | 'red' }) {
  return (
    <Card className="p-4">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className={cx('mt-1 text-[26px] font-semibold leading-tight tabular', tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900')}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>
    </Card>
  );
}

function AssetList({ assets, empty, right, sub }: { assets: import('@think/shared').Asset[]; empty: string; right: (a: import('@think/shared').Asset) => React.ReactNode; sub: (a: import('@think/shared').Asset) => string }) {
  if (!assets.length) return <Empty title={empty} />;
  return (
    <ul className="divide-y divide-slate-100">
      {assets.slice(0, 500).map((a) => (
        <li key={a.id}><Link to={`/assets/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
          <EquipmentAvatar type={a.equipmentType} tone={a.status === 'out_of_service' ? 'red' : 'default'} />
          <div className="min-w-0 flex-1"><div className="font-medium">{a.assetTag} <span className="font-normal text-slate-500">· {EQUIPMENT_LABELS[a.equipmentType]}</span></div><div className="truncate text-sm text-slate-500">{sub(a)}</div></div>
          {right(a)}
        </Link></li>
      ))}
    </ul>
  );
}
