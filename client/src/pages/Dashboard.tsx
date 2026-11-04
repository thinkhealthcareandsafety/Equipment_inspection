/**
 * Home, in plain words. It answers three questions:
 *  1. Where do we stand?   one sentence and one progress bar for the quarter
 *  2. What do I do now?    pick a site, find a unit, or scan its QR label
 *  3. What needs me?       approvals, unfinished inspections, units that must not be used
 * Then the round by city, today's work and the sites with the most left to do.
 */
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, ChevronRight, ClipboardCheck, LifeBuoy, PenLine, ScanLine, ShieldAlert } from 'lucide-react';
import { dueState, EQUIPMENT_LABELS, formatDate, isMine, isOpen, todayISO } from '@think/shared';
import { can, useAllData, useUser } from '../lib/hooks.ts';
import { buildReport, EMPTY_FILTERS, periodLabel } from '../lib/reports.ts';
import { Button, Card, cx, Empty, InspectionStatusBadge } from '../components/ui.tsx';
import { GlobalSearch } from '../components/GlobalSearch.tsx';

export function Dashboard() {
  const user = useUser();
  const data = useAllData();
  const nav = useNavigate();
  const report = useMemo(() => data && buildReport(data, EMPTY_FILTERS, 'building'), [data]);
  const byCity = useMemo(() => data && buildReport(data, EMPTY_FILTERS, 'city').groups.slice().sort((a, b) => b.assets - a.assets), [data]);
  if (!data || !report) return <Skeleton />;
  if (!data.assets.length) return <Empty title="Downloading your sites…" icon={<ClipboardCheck className="h-6 w-6" />}>The first sync downloads every site and unit so you can work offline.</Empty>;

  const bById = new Map(data.buildings.map((b) => [b.id, b]));
  const k = report.kpis;
  const total = k.assets;
  const done = k.inDate;
  const outList = data.assets.filter((a) => a.status === 'out_of_service');
  const overdue = data.assets.filter((a) => a.status !== 'out_of_service' && dueState(a.nextDueDate) === 'overdue').length;
  const mine = data.inspections.filter((i) => isOpen(i) && isMine(i, user))
    .sort((a, b) => Number(b.status === 'returned') - Number(a.status === 'returned') || b.updatedAt.localeCompare(a.updatedAt));
  const reviewQueue = can.review(user.role) ? data.inspections.filter((i) => i.status === 'submitted') : [];

  // Today's work by person
  const today = todayISO();
  const people = [...data.inspections.filter((i) => (i.status === 'submitted' || i.status === 'finalized') && i.header.inspectionDate === today).reduce((m, i) => {
    const name = i.header.technician || 'Unknown';
    const r = m.get(name) ?? { name, count: 0, fails: 0 };
    r.count++; if (i.result.defectsIdentified) r.fails++;
    return m.set(name, r);
  }, new Map<string, { name: string; count: number; fails: number }>()).values()].sort((a, b) => b.count - a.count);

  // Sites with the most left to do
  const sites = data.buildings.map((b) => {
    const list = data.assets.filter((a) => a.buildingId === b.id);
    return { b, todo: list.filter((a) => dueState(a.nextDueDate) !== 'ok').length, oos: list.filter((a) => a.status === 'out_of_service').length, total: list.length };
  }).filter((s) => s.todo || s.oos).sort((a, b) => b.oos - a.oos || b.todo - a.todo).slice(0, 5);

  const pct = total ? Math.round((done / total) * 100) : 0;
  const quarter = periodLabel('quarter');
  const attention = reviewQueue.length + mine.length + outList.length + (overdue ? 1 : 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] text-slate-500">{formatDate(todayISO())}</div>
      <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[34px]">{user.name === 'Team' ? 'Hello' : `Hello, ${user.name.split(' ')[0]}`}</h1>

      {/* 1. Where do we stand */}
      <p data-summary className="mt-2 max-w-2xl text-[17px] leading-relaxed text-slate-600">
        {done === 0 ? <>No unit has been inspected yet this quarter. <strong className="text-slate-900">{total} units</strong> at {data.buildings.length} sites are waiting.</>
          : <><strong className="text-slate-900">{done} of {total} units</strong> are inspected and in date ({pct}%).</>}
        {outList.length > 0 && <> <span className="font-semibold text-rose-600">{outList.length} {outList.length === 1 ? 'unit is' : 'units are'} out of service</span> and must not be used.</>}
      </p>

      {/* 2. What do I do now */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:flex">
        <Button size="lg" variant="primary" className="whitespace-nowrap !px-3 sm:!px-6" icon={<Building2 className="h-5 w-5 shrink-0" />} onClick={() => nav('/sites')}>Pick a site</Button>
        <Button size="lg" className="whitespace-nowrap !px-3 sm:!px-6" icon={<ScanLine className="h-5 w-5 shrink-0" />} onClick={() => window.dispatchEvent(new Event('think:scan'))}>Scan label</Button>
      </div>
      <div className="mt-3"><GlobalSearch data={data} /></div>
      <Link to="/help" className="mt-3 inline-flex items-center gap-1.5 px-1 text-[15px] font-medium text-brand-700"><LifeBuoy className="h-4 w-4" />New here? How to use the app</Link>

      {/* 3. What needs me */}
      {attention > 0 && (
        <>
          <Caption>Needs attention</Caption>
          <Card className="overflow-hidden">
            <div className="divide-y">
              {reviewQueue.length > 0 && (
                <Row to="/inspections" tone="blue" icon={<PenLine className="h-5 w-5" />}
                  title={`${reviewQueue.length} ${reviewQueue.length === 1 ? 'inspection is' : 'inspections are'} waiting for your approval`}
                  sub="Open, check and approve to issue the certificate" />
              )}
              {mine.slice(0, 3).map((i) => (
                <Row key={i.id} to={`/inspections/${i.id}`} tone={i.status === 'returned' ? 'amber' : 'slate'} icon={<ClipboardCheck className="h-5 w-5" />}
                  title={`${i.status === 'returned' ? 'Fix and resubmit' : 'Finish'}: ${i.header.equipmentAssetId}`}
                  sub={`${i.header.customerSite} · ${i.checks.filter((c) => c.status).length} of ${i.checks.length} checks done`}
                  right={<InspectionStatusBadge status={i.status} />} />
              ))}
              {outList.slice(0, 4).map((a) => (
                <Row key={a.id} to={`/assets/${a.id}`} tone="red" icon={<ShieldAlert className="h-5 w-5" />}
                  title={`Do not use: ${a.assetTag}`}
                  sub={`${EQUIPMENT_LABELS[a.equipmentType]} · ${bById.get(a.buildingId)?.name}, ${bById.get(a.buildingId)?.city} · ${a.statusReason ?? 'Out of service'}`} />
              ))}
              {outList.length > 4 && <Row to="/reports?view=oos" tone="red" icon={<ShieldAlert className="h-5 w-5" />} title={`${outList.length - 4} more out of service`} sub="See the full list" />}
              {overdue > 0 && <Row to="/reports?view=due" tone="amber" icon={<ClipboardCheck className="h-5 w-5" />} title={`${overdue} ${overdue === 1 ? 'unit is' : 'units are'} overdue for inspection`} sub="Last inspected more than 90 days ago" />}
            </div>
          </Card>
        </>
      )}

      {/* This quarter, by city */}
      <Caption right={<Link to="/reports" className="text-[15px] font-medium text-brand-700">See report</Link>}>{quarter} · tap a city to see its sites</Caption>
      <Card className="overflow-hidden">
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[17px] font-semibold">{done} of {total} inspected</div>
            <div className="text-[15px] tabular text-slate-500">{pct}%</div>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-200/80">
            <span className="h-full bg-emerald-500" style={{ width: `${(Math.max(0, done - outList.length) / Math.max(total, 1)) * 100}%` }} />
            <span className="h-full bg-rose-500" style={{ width: `${(outList.length / Math.max(total, 1)) * 100}%` }} />
          </div>
        </div>
        <div className="divide-y border-t">
          {(byCity ?? []).map((c) => (
            <Link key={c.key} to={`/sites?city=${encodeURIComponent(c.label)}`} data-city={c.label} className="row-press grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <div className="truncate text-[16px] font-medium">{c.label}</div>
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-200/80" role="img" aria-label={`${c.inDate} of ${c.assets} inspected, ${c.outOfService} out of service`}>
                <span className="h-full bg-emerald-500" style={{ width: `${(Math.max(0, c.inDate - c.outOfService) / Math.max(c.assets, 1)) * 100}%` }} />
                <span className="h-full bg-rose-500" style={{ width: `${(c.outOfService / Math.max(c.assets, 1)) * 100}%` }} />
              </div>
              <div className="text-right text-[14px] tabular text-slate-500">{c.inDate} of {c.assets}</div>
            </Link>
          ))}
        </div>
      </Card>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Inspected</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-500" />Out of service</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-200" />Still to do</span>
      </div>

      {people.length > 0 && (
        <>
          <Caption>Inspected today</Caption>
          <Card className="overflow-hidden">
            <div className="divide-y">
              {people.map((p) => (
                <div key={p.name} className="flex items-center gap-3 px-4 py-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/[.13] text-[13px] font-semibold text-brand-700">{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</div>
                  <div className="min-w-0 flex-1 truncate text-[16px] font-semibold">{p.name}</div>
                  <div className="text-[14px] tabular text-slate-500">{p.count} {p.count === 1 ? 'unit' : 'units'}{p.fails > 0 && <span className="font-semibold text-rose-600"> · {p.fails} with problems</span>}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <Caption right={<Link to="/sites" className="text-[15px] font-medium text-brand-700">All sites</Link>}>Sites with the most left to do</Caption>
      <Card className="overflow-hidden">
        {sites.length === 0 ? <Empty title="Every site is up to date" /> : (
          <div className="divide-y">
            {sites.map(({ b, todo, oos, total: n }) => (
              <Link key={b.id} to={`/sites/${b.id}`} className="row-press flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1"><div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{b.name}</div><div className="text-[14px] text-slate-500">{b.city} · {todo} of {n} still to inspect</div></div>
                {oos > 0 && <span className="rounded-full bg-rose-500/[.12] px-2.5 py-1 text-[12px] font-semibold text-rose-600">{oos} do not use</span>}
                <ChevronRight className="h-5 w-5 text-slate-300" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Caption({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-8 flex items-baseline justify-between gap-3 px-1">
      <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-slate-500">{children}</div>
      {right}
    </div>
  );
}

const TONES = { red: 'bg-rose-500/[.12] text-rose-600', amber: 'bg-amber-500/[.16] text-amber-700', blue: 'bg-sky-500/[.14] text-sky-700', slate: 'bg-black/[.06] text-slate-600' } as const;

function Row({ to, tone, icon, title, sub, right }: { to: string; tone: keyof typeof TONES; icon: ReactNode; title: string; sub: string; right?: ReactNode }) {
  return (
    <Link to={to} className="row-press flex items-center gap-3 px-4 py-3">
      <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-[11px]', TONES[tone])}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.01em]">{title}</div>
        <div className="line-clamp-2 text-[14px] text-slate-500">{sub}</div>
      </div>
      {right}
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
    </Link>
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
