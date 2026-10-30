/**
 * Home: find anything in one search, continue open work, and see only the
 * numbers that need action. Each number opens the matching report.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, ClipboardCheck, MapPin } from 'lucide-react';
import { dueState, EQUIPMENT_LABELS, formatDate, todayISO } from '@think/shared';
import { can, useAllData, useUser } from '../lib/hooks.ts';
import { buildReport, EMPTY_FILTERS, roundText, roundTone } from '../lib/reports.ts';
import { Bar, Card, cx, Empty, EquipmentAvatar, InspectionStatusBadge, SearchField } from '../components/ui.tsx';

export function Dashboard() {
  const user = useUser();
  const data = useAllData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const report = useMemo(() => data && buildReport(data, EMPTY_FILTERS, 'building'), [data]);
  if (!data || !report) return <Skeleton />;
  if (!data.assets.length) return <Empty title="Downloading your sites…" icon={<ClipboardCheck className="h-6 w-6" />}>The first sync downloads every site and asset so you can work offline.</Empty>;

  const bById = new Map(data.buildings.map((b) => [b.id, b]));
  const k = report.kpis;
  const toInspect = report.toInspect.length;
  const mine = data.inspections.filter((i) => (i.status === 'draft' || i.status === 'returned') && i.createdBy === user.id)
    .sort((a, b) => Number(b.status === 'returned') - Number(a.status === 'returned') || b.updatedAt.localeCompare(a.updatedAt));
  const reviewQueue = can.review(user.role) ? data.inspections.filter((i) => i.status === 'submitted') : [];

  // Sites with the most work to do this cycle.
  const sites = data.buildings.map((b) => {
    const list = data.assets.filter((a) => a.buildingId === b.id);
    return { b, todo: list.filter((a) => dueState(a.nextDueDate) !== 'ok').length, oos: list.filter((a) => a.status === 'out_of_service').length, total: list.length };
  }).filter((s) => s.todo || s.oos).sort((a, b) => b.oos - a.oos || b.todo - a.todo).slice(0, 6);

  const term = q.trim().toLowerCase();
  const results = term.length < 2 ? [] : [
    ...data.buildings.filter((b) => `${b.name} ${b.city}`.toLowerCase().includes(term)).slice(0, 4).map((b) => ({ key: b.id, to: `/sites/${b.id}`, title: b.name, sub: `Site · ${b.city}`, type: null })),
    ...data.assets.filter((a) => `${a.assetTag} ${a.serialNumber ?? ''} ${a.manufacturer ?? ''}`.toLowerCase().includes(term)).slice(0, 6)
      .map((a) => ({ key: a.id, to: `/assets/${a.id}`, title: a.assetTag, sub: `${EQUIPMENT_LABELS[a.equipmentType]} · ${bById.get(a.buildingId)?.name}`, type: a.equipmentType })),
  ];

  const rt = roundTone(k);
  const tiles = [
    { label: 'This round', value: k.inDate, sub: roundText(k), tone: rt, bar: k.compliance, to: '/reports' },
    { label: 'To inspect', value: toInspect, sub: k.overdue ? `${k.overdue} overdue` : 'None overdue', tone: k.overdue ? 'red' : 'neutral', to: '/reports?view=due' },
    { label: 'Out of service', value: k.outOfService, sub: 'Do not use until re-tested', tone: k.outOfService ? 'red' : 'green', to: '/reports?view=oos' },
    { label: 'Open defects', value: k.openDefects, sub: `${k.safetyCritical} safety-critical`, tone: k.openDefects ? 'red' : 'green', to: '/reports?view=defects' },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] text-slate-500">{formatDate(todayISO())}</div>
      <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-0.03em]">{user.name === 'Team' ? 'Hello' : `Hello, ${user.name.split(' ')[0]}`}</h1>
      <div className="mt-1 text-[16px] text-slate-500">{data.buildings.length} sites · {k.assets} assets</div>

      <div className="relative mt-5">
        <SearchField id="home-search" value={q} onChange={setQ} placeholder="Search asset ID, site or make" />
        {results.length > 0 && (
          <Card className="animate-pop absolute inset-x-0 top-full z-20 mt-2 overflow-hidden shadow-lift">
            <div className="divide-y">
              {results.map((r) => (
                <Link key={r.key} to={r.to} className="row-press flex items-center gap-3 px-4 py-2.5">
                  {r.type ? <EquipmentAvatar type={r.type} /> : <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-slate-500 text-white"><MapPin className="h-[22px] w-[22px]" /></div>}
                  <div><div className="text-[17px] font-medium">{r.title}</div><div className="text-[14px] text-slate-500">{r.sub}</div></div>
                </Link>
              ))}
            </div>
          </Card>
        )}
        {term.length >= 2 && results.length === 0 && <div className="mt-2 px-1 text-[15px] text-slate-500">Nothing matches “{q}”.</div>}
      </div>

      {reviewQueue.length > 0 && <WorkList title={`Waiting for your review · ${reviewQueue.length}`} items={reviewQueue} />}
      {can.inspect(user.role) && mine.length > 0 && <WorkList title="Continue" items={mine} />}

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <button key={t.label} data-tile={t.label} onClick={() => nav(t.to)} className="card p-4 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift active:scale-[.98]">
            <div className="text-[13px] font-medium text-slate-500">{t.label}</div>
            <div data-value className={cx('mt-1.5 flex h-[38px] items-baseline text-[34px] font-bold leading-none tracking-[-0.03em] tabular', t.tone === 'red' ? 'text-rose-600' : t.tone === 'green' ? 'text-emerald-600' : 'text-slate-900')}>{t.value}{t.label === 'This round' && <span className="text-[17px] font-medium tracking-normal text-slate-400"> / {k.assets}</span>}</div>
            {'bar' in t && <div className="mt-2.5"><Bar value={t.bar} tone="brand" /></div>}
            <div className="mt-2 text-[13px] text-slate-500">{t.sub}</div>
          </button>
        ))}
      </div>

      <div className="mb-2 mt-8 flex items-baseline justify-between px-1">
        <div className="text-[13px] font-medium uppercase tracking-[0.04em] text-slate-500">Sites with work to do</div>
        <Link to="/sites" className="text-[15px] font-medium text-brand-700">See all</Link>
      </div>
      <Card className="overflow-hidden">
        {sites.length === 0 ? <Empty title="All sites are up to date" /> : (
          <div className="divide-y">
            {sites.map(({ b, todo, oos, total }) => (
              <Link key={b.id} to={`/sites/${b.id}`} className="row-press flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1"><div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{b.name}</div><div className="text-[14px] text-slate-500">{b.city} · {total} assets</div></div>
                {oos > 0 && <span className="rounded-full bg-rose-500/[.12] px-2.5 py-1 text-[12px] font-semibold text-rose-600">{oos} out of service</span>}
                <span className="text-[15px] font-medium tabular text-slate-500">{todo}</span>
                <ChevronRight className="h-5 w-5 text-slate-300" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function WorkList({ title, items }: { title: string; items: import('@think/shared').Inspection[] }) {
  return (
    <>
      <div className="mb-2 mt-7 px-1 text-[13px] font-medium uppercase tracking-[0.04em] text-slate-500">{title}</div>
      <Card className="overflow-hidden">
        <div className="divide-y">
          {items.slice(0, 5).map((i) => (
            <Link key={i.id} to={`/inspections/${i.id}`} className="row-press flex items-center gap-3 px-4 py-3">
              <EquipmentAvatar type={i.templateId} tone={i.status === 'returned' ? 'amber' : 'default'} />
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold tracking-[-0.01em]">{i.header.equipmentAssetId}</div>
                <div className="truncate text-[14px] text-slate-500">{i.header.customerSite}{i.header.siteLocationDepartment ? ` · ${i.header.siteLocationDepartment}` : ''} · {i.checks.filter((c) => c.status).length}/{i.checks.length} checks</div>
              </div>
              <InspectionStatusBadge status={i.status} />
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

export function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 rounded-lg bg-slate-200" />
      <div className="h-12 rounded-2xl bg-slate-200/70" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-2xl bg-slate-200/70" />)}</div>
    </div>
  );
}
