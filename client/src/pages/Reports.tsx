/**
 * Reports in two taps: pick a place (city → site → floor) and a quarter,
 * then one of five ready-made views. PDF and Excel export exactly what is shown.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Check, ChevronDown, ChevronRight, FileSpreadsheet, FileText, Layers, MapPin } from 'lucide-react';
import { EQUIPMENT_LABELS, formatDate, relativeDue, STATUS_LABELS, todayISO, type EquipmentType } from '@think/shared';
import { useAllData, useUser } from '../lib/hooks.ts';
import { buildReport, download, EMPTY_FILTERS, periodLabel, toCSV, type GroupBy, type Period, type ReportFilters } from '../lib/reports.ts';
import { summaryReport } from '../lib/pdf.ts';
import { saveFile } from '../lib/files.ts';
import { ASSET_STATUS, AssetStatusBadge, Badge, Bar, Button, Card, cx, DueBadge, Empty, EquipmentAvatar, InspectionStatusBadge, SearchField, Segmented, Sheet, useToast } from '../components/ui.tsx';
import { Skeleton } from './Dashboard.tsx';

type View = 'summary' | 'due' | 'oos' | 'defects' | 'done';
const PERIODS: Period[] = ['quarter', 'last_quarter', 'year', 'all'];
const PERIOD_SHORT: Record<Period, string> = { quarter: 'This quarter', last_quarter: 'Last quarter', year: 'This year', all: 'All time' };
const PERIOD_TINY: Record<Period, string> = { quarter: 'This qtr', last_quarter: 'Last qtr', year: 'This year', all: 'All time' };

export function Reports() {
  const data = useAllData();
  const user = useUser();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<'place' | 'type' | null>(null);
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
  const oos = report.assets.filter((a) => a.status === 'out_of_service');
  const pctDone = k.assets ? Math.round((k.inDate / k.assets) * 100) : 0;

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
    { id: 'summary', label: group === 'city' ? 'By city' : group === 'building' ? 'By site' : group === 'floor' ? 'By floor' : 'By equipment' },
    { id: 'due', label: 'Still to inspect', n: report.toInspect.length },
    { id: 'oos', label: 'Do not use', n: oos.length, tone: oos.length ? 'text-rose-600' : '' },
    { id: 'defects', label: 'Problems found', n: report.defects.length, tone: report.defects.length ? 'text-rose-600' : '' },
    { id: 'done', label: 'Inspections done', n: done.length },
  ];

  const ringPct = pctDone;
  const R = 54, C = 2 * Math.PI * R;
  const stat = (id: View, label: string, short: string, value: number, hint: string, tone: 'amber' | 'red' | 'slate') => (
    <button key={id} type="button" onClick={() => set({ view: view === id ? '' : id })}
      className={cx('group flex min-w-0 flex-col rounded-[16px] px-3 py-3 text-left transition duration-150 hover:bg-black/[.035] active:scale-[.98] sm:px-4',
        view === id && 'bg-black/[.045]')}>
      <span className="text-[13px] font-medium text-slate-500"><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></span>
      <span className={cx('mt-1 text-[32px] font-bold leading-none tracking-[-0.03em] tabular sm:text-[36px]',
        value === 0 ? 'text-slate-300' : tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-900')}>{value}</span>
      <span className="mt-2 hidden text-[12.5px] leading-snug text-slate-500 sm:line-clamp-2">{hint}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl">
      {/* Title, scope in words, export */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em] text-slate-500">{periodLabel(period)}</div>
          <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[34px]">Reports</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[15px] text-slate-500">
            <button className={cx(city ? 'text-brand-700 hover:underline' : 'font-medium text-slate-700')} onClick={() => set({ city: '', buildingId: '', floorId: '' })}>All sites</button>
            {city && <><ChevronRight className="h-4 w-4 text-slate-300" /><button className={cx(buildingId ? 'text-brand-700 hover:underline' : 'font-medium text-slate-700')} onClick={() => set({ buildingId: '', floorId: '' })}>{city}</button></>}
            {buildingId && <><ChevronRight className="h-4 w-4 text-slate-300" /><button className={cx(floorId ? 'text-brand-700 hover:underline' : 'font-medium text-slate-700')} onClick={() => set({ floorId: '' })}>{bById.get(buildingId)?.name}</button></>}
            {floorId && <><ChevronRight className="h-4 w-4 text-slate-300" /><span className="font-medium text-slate-700">{floorName(floorId)}</span></>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="dark" className="flex-1 sm:flex-none" icon={<FileText className="h-4 w-4" />} disabled={busy} onClick={exportPdf}>{busy ? 'Preparing…' : 'PDF report'}</Button>
          <Button className="flex-1 sm:flex-none" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={exportExcel}>Excel</Button>
        </div>
      </div>

      {/* One toolbar: where, what, when */}
      <div className="mb-5 flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="flex gap-2">
          <PickerButton icon={<MapPin className="h-[18px] w-[18px]" />} label={place} active={!!city} onClick={() => setPicker('place')} />
          <PickerButton icon={<Layers className="h-[18px] w-[18px]" />} label={type ? EQUIPMENT_LABELS[type] : 'All equipment'} active={!!type} onClick={() => setPicker('type')} />
        </div>
        <div className="lg:ml-auto lg:w-[420px]">
          <Segmented value={period} onChange={(x) => set({ period: x === 'quarter' ? '' : x })}
            options={PERIODS.map((x) => ({ value: x, label: <><span className="sm:hidden">{PERIOD_TINY[x]}</span><span className="hidden sm:inline">{PERIOD_SHORT[x]}</span></> }))} />
        </div>
      </div>

      {/* The report's cover: one ring, one sentence, three numbers */}
      <Card className="mb-6 overflow-hidden">
        <div className="grid items-center gap-5 p-5 sm:p-6 md:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex items-center gap-5">
            <div className="relative grid h-[124px] w-[124px] shrink-0 place-items-center">
              <svg viewBox="0 0 124 124" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="62" cy="62" r={R} fill="none" stroke="rgb(0 0 0 / 0.06)" strokeWidth="11" />
                <circle cx="62" cy="62" r={R} fill="none" stroke="var(--color-brand-500)" strokeWidth="11" strokeLinecap={ringPct >= 3 ? 'round' : 'butt'}
                  strokeDasharray={`${(ringPct / 100) * C} ${C}`} className="transition-[stroke-dasharray] duration-700 ease-out" />
              </svg>
              <div className="text-center">
                <div className="text-[30px] font-bold leading-none tracking-[-0.03em] tabular">{ringPct}<span className="text-[17px] font-semibold text-slate-400">%</span></div>
                <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">in date</div>
              </div>
            </div>
            <div className="min-w-0 md:hidden">
              <div className="text-[22px] font-bold leading-tight tracking-[-0.02em]">{k.inDate} of {k.assets}</div>
              <div className="text-[15px] text-slate-500">units inspected</div>
            </div>
          </div>
          <div className="min-w-0">
            <p data-summary className="hidden text-[20px] font-semibold leading-snug tracking-[-0.015em] text-slate-900 md:block">
              {k.inDate} of {k.assets} units inspected{type ? ` (${EQUIPMENT_LABELS[type]})` : ''}
              <span className="font-normal text-slate-500"> · {place}</span>
            </p>
            <p className="mt-1 hidden text-[15px] text-slate-500 md:block">
              {oos.length > 0 ? <><span className="font-semibold text-rose-600">{oos.length} {oos.length === 1 ? 'unit' : 'units'} must not be used</span> until re-tested. </> : 'Every unit can be used. '}
              {report.toInspect.length > 0 ? `${report.toInspect.length} still need inspecting.` : 'Nothing is waiting.'}
            </p>
            <div className="-mx-2 grid grid-cols-3 gap-1 border-t border-black/[.06] pt-3 md:mx-0 md:mt-4 md:-ml-4 md:border-0 md:pt-0">
              {stat('due', 'Still to inspect', 'To inspect', report.toInspect.length, 'Never inspected, overdue or due soon', 'amber')}
              {stat('oos', 'Do not use', 'Do not use', oos.length, 'Out of service until re-tested', 'red')}
              {stat('defects', 'Problems', 'Problems', report.defects.length, report.defects.length ? `${k.safetyCritical} on safety checks` : 'None open', 'red')}
            </div>
          </div>
        </div>
      </Card>

      {/* What to list */}
      <div className="scrollbar-none -mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-0.5 rounded-[11px] bg-black/[.06] p-[3px]">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => set({ view: t.id === 'summary' ? '' : t.id })}
              className={cx('flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 text-[14px] font-semibold transition-all duration-200',
                view === t.id ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.04)]' : 'text-slate-600 hover:text-slate-900')}>
              {t.label}{t.n != null && <span className={cx('tabular text-[13px]', t.tone || 'text-slate-400')}>{t.n}</span>}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {view === 'summary' && (report.groups.length === 0 ? <Empty title="No assets here" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-3 sm:px-5">{group === 'city' ? 'City' : group === 'building' ? 'Site' : group === 'floor' ? 'Floor' : 'Equipment'}</th>
                <th className="w-40 px-3 py-3 sm:w-56">Inspected</th>
                <th className="whitespace-nowrap px-3 py-3 text-right"><span className="sm:hidden">Out</span><span className="hidden sm:inline">Do not use</span></th>
                <th className="px-4 py-3 text-right sm:px-5">Problems</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {report.groups.map((g) => {
                  const drill: Record<string, string> = group === 'city' ? { city: g.key } : group === 'building' ? { buildingId: g.key } : group === 'floor' ? { floorId: g.key.split('|')[1] === 'none' ? '__none' : g.key.split('|')[1] } : { type: g.key };
                  return (
                    <tr key={g.key} className="cursor-pointer hover:bg-slate-50" onClick={() => set(drill)}>
                      <td className="px-4 py-3 font-medium sm:px-5"><span className="inline-flex items-center gap-1">{g.label}<ChevronRight className="h-4 w-4 text-slate-300" /></span></td>
                      <td className="px-3 py-3"><div className="flex items-center gap-2"><Bar value={g.compliance} tone="brand" /><span className="shrink-0 text-xs tabular text-slate-500">{g.inDate} of {g.assets}</span></div></td>
                      <td className={cx('px-3 py-3 text-right tabular', g.outOfService > 0 ? 'font-semibold text-rose-600' : 'text-slate-400')}>{g.outOfService}</td>
                      <td className={cx('px-4 py-3 text-right tabular sm:px-5', g.openDefects > 0 ? 'font-semibold text-rose-600' : 'text-slate-400')}>{g.openDefects}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {view === 'due' && <AssetList assets={report.toInspect} empty="Everything here is inspected and in date" right={(a) => <DueBadge nextDue={a.nextDueDate} />} sub={(a) => `${bById.get(a.buildingId)?.name}${a.floorId ? ` · ${floorName(a.floorId)}` : ''} · last ${formatDate(a.lastInspectionDate)}`} />}
        {view === 'oos' && <AssetList assets={oos} empty="Every unit can be used" right={(a) => <AssetStatusBadge status={a.status} />} sub={(a) => `${bById.get(a.buildingId)?.name} · ${a.statusReason ?? ''}`} />}

        {view === 'defects' && (report.defects.length === 0 ? <Empty title="No open problems" /> : (
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
      <p className="mt-3 px-1 text-[13px] leading-relaxed text-slate-500">"In date" means inspected in the last 90 days. <strong>PDF report</strong> is the full report for {place} to send the client; <strong>Excel</strong> downloads the list on screen.</p>

      <PlaceSheet open={picker === 'place'} onClose={() => setPicker(null)} data={data} city={city} buildingId={buildingId}
        onPick={(patch) => { set({ city: '', buildingId: '', floorId: '', ...patch }); setPicker(null); }} />
      <Sheet open={picker === 'type'} onClose={() => setPicker(null)} title="Equipment">
        <Card className="divide-y overflow-hidden !bg-white">
          {(['', ...Object.keys(EQUIPMENT_LABELS)] as (EquipmentType | '')[]).map((t) => (
            <button key={t || 'all'} onClick={() => { set({ type: t }); setPicker(null); }} className="row-press flex w-full items-center gap-3 px-4 py-3.5 text-left">
              {t ? <EquipmentAvatar type={t} /> : <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-slate-500 text-white"><Layers className="h-5 w-5" /></span>}
              <span className="flex-1 text-[17px] font-medium">{t ? EQUIPMENT_LABELS[t] : 'All equipment'}</span>
              <span className="text-[14px] tabular text-slate-400">{t ? data.assets.filter((a) => a.equipmentType === t).length : data.assets.length}</span>
              {type === t && <Check className="h-5 w-5 text-brand-600" />}
            </button>
          ))}
        </Card>
      </Sheet>
    </div>
  );
}

function PickerButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cx('flex h-10 min-w-0 items-center gap-2 rounded-[12px] pl-3 pr-2.5 text-[15px] font-semibold transition duration-150 active:scale-[.97]',
        active ? 'bg-brand-500/[.12] text-brand-700' : 'bg-white text-slate-800 shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.04)] hover:bg-slate-50')}>
      <span className={active ? 'text-brand-600' : 'text-slate-400'}>{icon}</span>
      <span className="truncate">{label}</span>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
    </button>
  );
}

type AllData = NonNullable<ReturnType<typeof useAllData>>;

/** Pick where the report covers: everything, a city, or one site. */
function PlaceSheet({ open, onClose, data, city, buildingId, onPick }: {
  open: boolean; onClose: () => void; data: AllData; city: string; buildingId: string; onPick: (patch: Record<string, string>) => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const cities = [...new Set(data.buildings.map((b) => b.city))].sort();
  const count = (pred: (bId: string) => boolean) => data.assets.filter((a) => pred(a.buildingId)).length;
  const row = (key: string, title: string, sub: string, n: number, selected: boolean, patch: Record<string, string>, strong = false) => (
    <button key={key} onClick={() => onPick(patch)} className="row-press flex w-full items-center gap-3 px-4 py-3 text-left">
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-[17px]', strong ? 'font-semibold' : 'font-medium')}>{title}</div>
        {sub && <div className="text-[13px] text-slate-500">{sub}</div>}
      </div>
      <span className="text-[14px] tabular text-slate-400">{n}</span>
      {selected && <Check className="h-5 w-5 text-brand-600" />}
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Which sites?">
      <SearchField id="place-search" value={q} onChange={setQ} placeholder="Search a city or site" />
      <div className="mt-4 space-y-5">
        {!term && (
          <Card className="divide-y overflow-hidden !bg-white">
            {row('all', 'All sites', `${data.buildings.length} sites in ${cities.length} cities`, data.assets.length, !city, {}, true)}
          </Card>
        )}
        {cities.map((c) => {
          const sites = data.buildings.filter((b) => b.city === c && (!term || `${b.name} ${b.city}`.toLowerCase().includes(term))).sort((a, b) => a.name.localeCompare(b.name));
          if (!sites.length) return null;
          return (
            <div key={c}>
              <div className="mb-1.5 px-1 text-[13px] font-semibold uppercase tracking-[0.04em] text-slate-500">{c}</div>
              <Card className="divide-y overflow-hidden !bg-white">
                {sites.length > 1 && row(`city-${c}`, `All of ${c}`, `${sites.length} sites`, count((id) => data.buildings.find((b) => b.id === id)?.city === c), city === c && !buildingId, { city: c }, true)}
                {sites.map((b) => row(b.id, b.name, '', count((id) => id === b.id), buildingId === b.id, { city: c, buildingId: b.id }))}
              </Card>
            </div>
          );
        })}
      </div>
    </Sheet>
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
