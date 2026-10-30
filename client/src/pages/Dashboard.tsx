/**
 * Home: find anything in one search, continue open work, and see only the
 * numbers that need action. Each number opens the matching report.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, ClipboardCheck, MapPin, Search } from 'lucide-react';
import { dueState, EQUIPMENT_LABELS, formatDate, todayISO } from '@think/shared';
import { can, useAllData, useUser } from '../lib/hooks.ts';
import { buildReport, EMPTY_FILTERS } from '../lib/reports.ts';
import { Card, cx, Empty, EquipmentAvatar, InspectionStatusBadge } from '../components/ui.tsx';

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

  const tiles = [
    { label: 'To inspect', value: toInspect, sub: `${k.overdue} overdue · ${k.never} never inspected`, tone: k.overdue ? 'red' : toInspect ? 'amber' : 'green', to: '/reports?view=due' },
    { label: 'Out of service', value: k.outOfService, sub: 'Do not use until re-tested', tone: k.outOfService ? 'red' : 'green', to: '/reports?view=oos' },
    { label: 'Open defects', value: k.openDefects, sub: `${k.safetyCritical} safety-critical`, tone: k.openDefects ? 'red' : 'green', to: '/reports?view=defects' },
    { label: 'In date', value: `${k.compliance}%`, sub: `of ${k.assets} assets`, tone: k.compliance >= 90 ? 'green' : k.compliance >= 60 ? 'amber' : 'red', to: '/reports' },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Hello, {user.name.split(' ')[0]}</h1>
      <div className="mt-0.5 text-slate-500">{formatDate(todayISO())} · {data.buildings.length} sites · {k.assets} assets</div>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input id="home-search" className="input h-13 rounded-2xl pl-12 text-base" placeholder="Search asset ID, site or make" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <Card className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden shadow-lift">
            {results.map((r) => (
              <Link key={r.key} to={r.to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                {r.type ? <EquipmentAvatar type={r.type} /> : <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500"><MapPin className="h-5 w-5" /></div>}
                <div><div className="font-medium">{r.title}</div><div className="text-sm text-slate-500">{r.sub}</div></div>
              </Link>
            ))}
          </Card>
        )}
        {term.length >= 2 && results.length === 0 && <div className="mt-2 text-sm text-slate-500">Nothing matches “{q}”.</div>}
      </div>

      {reviewQueue.length > 0 && <WorkList title={`Waiting for your review (${reviewQueue.length})`} items={reviewQueue} />}
      {can.inspect(user.role) && mine.length > 0 && <WorkList title="Continue" items={mine} />}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <button key={t.label} onClick={() => nav(t.to)} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="text-[13px] text-slate-500">{t.label}</div>
            <div className={cx('mt-1 text-3xl font-semibold tabular', t.tone === 'red' ? 'text-rose-600' : t.tone === 'amber' ? 'text-amber-600' : 'text-emerald-600')}>{t.value}</div>
            <div className="mt-1 text-xs text-slate-500">{t.sub}</div>
          </button>
        ))}
      </div>

      <div className="mt-6 mb-2 flex items-center justify-between">
        <div className="font-semibold">Sites with work to do</div>
        <Link to="/sites" className="text-sm font-medium text-brand-700">All sites</Link>
      </div>
      <Card className="overflow-hidden">
        {sites.length === 0 ? <Empty title="All sites are up to date" /> : (
          <ul className="divide-y divide-slate-100">
            {sites.map(({ b, todo, oos, total }) => (
              <li key={b.id}><Link to={`/sites/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                <div className="min-w-0 flex-1"><div className="font-medium">{b.name}</div><div className="text-sm text-slate-500">{b.city} · {total} assets</div></div>
                {oos > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">{oos} out of service</span>}
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 tabular">{todo} to inspect</span>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function WorkList({ title, items }: { title: string; items: import('@think/shared').Inspection[] }) {
  return (
    <>
      <div className="mt-6 mb-2 font-semibold">{title}</div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {items.slice(0, 5).map((i) => (
            <li key={i.id}><Link to={`/inspections/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
              <EquipmentAvatar type={i.templateId} tone={i.status === 'returned' ? 'amber' : 'default'} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{i.header.equipmentAssetId}</div>
                <div className="truncate text-sm text-slate-500">{i.header.customerSite}{i.header.siteLocationDepartment ? ` · ${i.header.siteLocationDepartment}` : ''} · {i.checks.filter((c) => c.status).length}/{i.checks.length} checks</div>
              </div>
              <InspectionStatusBadge status={i.status} />
            </Link></li>
          ))}
        </ul>
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
