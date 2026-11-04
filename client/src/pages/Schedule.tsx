/**
 * The quarter's plan: which site is visited on which day, and by whom. Sites that still have units to inspect
 * but no visit yet are listed underneath with a Plan button, so nothing is forgotten.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarDays, CalendarPlus, Pencil } from 'lucide-react';
import {
  addDays, dayLabel, diffDays, formatDate, quarterLabel, quarterLength, quarterName, quarterOf, shiftQuarter, todayISO, weekday,
  type Building, type Visit,
} from '@think/shared';
import { useAllData } from '../lib/hooks.ts';
import { buildReport, EMPTY_FILTERS } from '../lib/reports.ts';
import { Bar, Button, Card, cx, Empty, PageHeader } from '../components/ui.tsx';
import { ContactActions, DateTile, ScheduleSheet } from '../components/Plan.tsx';
import { Skeleton } from './Dashboard.tsx';

type Plan = { building: Building; visit?: Visit } | null;

export function Schedule() {
  const data = useAllData();
  const [plan, setPlan] = useState<Plan>(null);
  const report = useMemo(() => data && buildReport(data, EMPTY_FILTERS, 'building'), [data]);
  if (!data || !report) return <Skeleton />;

  const today = todayISO();
  const q = quarterOf(today);
  const next = shiftQuarter(q, 1);
  const bById = new Map(data.buildings.map((b) => [b.id, b]));
  const left = new Map(report.groups.map((g) => [g.key, g.todo]));
  const planned = data.visits.filter((v) => v.status === 'planned' && bById.has(v.buildingId));
  const upcoming = planned.filter((v) => v.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (bById.get(a.buildingId)!.name).localeCompare(bById.get(b.buildingId)!.name));
  const earlier = planned.filter((v) => v.date < today && v.date >= q.from).sort((a, b) => b.date.localeCompare(a.date));
  const plannedSites = new Set(upcoming.map((v) => v.buildingId));
  const notPlanned = report.groups.filter((g) => g.todo > 0 && !plannedSites.has(g.key)).sort((a, b) => b.todo - a.todo || a.label.localeCompare(b.label));

  // Group upcoming visits the way people talk about them.
  const sunday = addDays(today, (7 - ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday(today))) % 7);
  const bucket = (d: string) => d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : d <= sunday ? 'This week' : d <= addDays(sunday, 7) ? 'Next week'
    : d <= q.to ? `Later in ${quarterName(q)}` : `In ${quarterName(next)} (${quarterLabel(next).split(' · ')[1]})`;
  const buckets = new Map<string, Visit[]>();
  for (const v of upcoming) buckets.set(bucket(v.date), [...(buckets.get(bucket(v.date)) ?? []), v]);

  const open = (buildingId: string, visit?: Visit) => { const b = bById.get(buildingId); if (b) setPlan({ building: b, visit }); };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Schedule" subtitle={`${quarterLabel(q)} · ${report.daysLeft} days left. Plan which site is inspected when, and who goes.`} />

      <QuarterStrip q={q} today={today} visits={planned.filter((v) => v.date <= q.to)} names={bById} />

      <p data-plan-summary className="mb-6 mt-4 px-1 text-[16px] leading-relaxed text-slate-600">
        {upcoming.length === 0 ? <>No visits planned yet.</> : <><strong className="text-slate-900">{upcoming.length} {upcoming.length === 1 ? 'visit' : 'visits'}</strong> planned.</>}
        {' '}{notPlanned.length === 0 ? 'Every site with work left has a visit.' : <><strong className="text-slate-900">{notPlanned.length} {notPlanned.length === 1 ? 'site' : 'sites'}</strong> with units left {notPlanned.length === 1 ? 'has' : 'have'} no visit yet.</>}
      </p>


      <div className="grid items-start gap-x-6 gap-y-7 lg:grid-cols-2">
      <div className="min-w-0 space-y-7">
        {upcoming.length === 0 && earlier.length === 0 && (
          <Section title="Planned visits">
            <Empty icon={<CalendarDays className="h-6 w-6" />} title="Plan this quarter's visits">
              Tap <strong className="text-slate-700">Plan</strong> next to a site, pick the day and who goes. Everyone sees the plan, and Home shows what is coming up.
            </Empty>
          </Section>
        )}
        {[...buckets.entries()].map(([title, list]) => (
          <Section key={title} title={title}>
            {list.map((v) => <VisitRow key={v.id} v={v} b={bById.get(v.buildingId)!} left={left.get(v.buildingId) ?? 0} onEdit={() => open(v.buildingId, v)} />)}
          </Section>
        ))}

        {earlier.length > 0 && (
          <Section title={`Earlier in ${quarterName(q)}`}>
            {earlier.map((v) => <VisitRow key={v.id} v={v} b={bById.get(v.buildingId)!} left={left.get(v.buildingId) ?? 0} past onEdit={() => open(v.buildingId, v)} />)}
          </Section>
        )}
      </div>
      <div className="min-w-0 space-y-7">
        {notPlanned.length > 0 && (
          <Section title="Not planned yet" right={<span className="text-[13px] text-slate-500">most work first</span>}>
            {notPlanned.map((g) => (
              <div key={g.key} className="flex items-center gap-3 px-4 py-3" data-unplanned={g.label}>
                <Link to={`/sites/${g.key}`} className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{g.label} <span className="font-normal text-slate-500">· {g.sub}</span></div>
                  <div className="mt-1 flex items-center gap-2 text-[14px] text-slate-500">
                    <span className="w-14 shrink-0"><Bar value={g.compliance} tone="brand" /></span>
                    <span className="truncate tabular">{g.todo} of {g.assets} to inspect</span>
                  </div>
                </Link>
                <Button size="sm" variant="primary" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => open(g.key)}>Plan</Button>
              </div>
            ))}
          </Section>
        )}

      </div>
      </div>

      {plan && <ScheduleSheet open onClose={() => setPlan(null)} building={plan.building} visit={plan.visit} left={left.get(plan.building.id) ?? 0} />}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="caption flex items-baseline justify-between gap-3"><span>{title}</span>{right}</div>
      <Card className="divide-y overflow-hidden">{children}</Card>
    </section>
  );
}

function VisitRow({ v, b, left, past, onEdit }: { v: Visit; b: Building; left: number; past?: boolean; onEdit: () => void }) {
  const contact = b.contacts?.find((c) => c.phone);
  return (
    <div className={cx('flex items-center gap-3 px-4 py-3', past && 'opacity-75')} data-visit={b.name}>
      <DateTile date={v.date} tone={past ? 'slate' : 'brand'} />
      <Link to={`/sites/${b.id}`} className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{b.name} <span className="font-normal text-slate-500">· {b.city}</span></div>
        <div className="truncate text-[14px] text-slate-500">
          {v.inspector || 'Inspector not decided'} · <span className={left === 0 ? 'font-medium text-emerald-600' : ''}>{left === 0 ? 'all done' : `${left} to inspect`}</span>
        </div>
        {v.note && <div className="truncate text-[13px] text-slate-400">{v.note}</div>}
      </Link>
      {contact && !past && <ContactActions contact={contact} callOnly />}
      <button type="button" onClick={onEdit} aria-label={`Change the visit to ${b.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-black/[.06] active:scale-90"><Pencil className="h-4 w-4" /></button>
    </div>
  );
}

/** The whole quarter on one line: months, today, and a dot for every planned visit. */
function QuarterStrip({ q, today, visits, names }: { q: ReturnType<typeof quarterOf>; today: string; visits: Visit[]; names: Map<string, Building> }) {
  const len = quarterLength(q);
  const at = (d: string) => `${(Math.min(Math.max(diffDays(d, q.from), 0), len - 1) + 0.5) / len * 100}%`;
  const months = [0, 1, 2].map((i) => { const m = Number(q.from.slice(5, 7)) + i; return `${q.from.slice(0, 4)}-${String(m).padStart(2, '0')}-01`; });
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const elapsed = Math.min(Math.max(diffDays(today, q.from) + 0.5, 0), len) / len * 100;
  return (
    <Card className="px-4 pb-3 pt-4 sm:px-5" aria-label={`${quarterLabel(q)} with ${visits.length} planned visits`}>
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-[14px] h-2 overflow-hidden rounded-full bg-black/[.06]">
          <div className="h-full bg-black/[.08]" style={{ width: `${elapsed}%` }} />
        </div>
        {visits.map((v) => (
          <span key={v.id} title={`${dayLabel(v.date, today)} · ${names.get(v.buildingId)?.name ?? ''}`}
            className={cx('absolute top-[11px] h-3.5 w-3.5 -translate-x-1/2 rounded-full ring-2 ring-white', v.date < today ? 'bg-slate-400' : 'bg-brand-500')} style={{ left: at(v.date) }} />
        ))}
        <span className="absolute top-0 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold uppercase leading-[14px] tracking-[0.04em] text-white" style={{ left: `${Math.min(Math.max(elapsed, 5), 95)}%` }}>Today</span>
        <span className="absolute top-[13px] h-[22px] w-0.5 -translate-x-1/2 rounded-full bg-rose-500" style={{ left: `${elapsed}%` }} />
      </div>
      <div className="relative mt-1 h-4 text-[12px] font-medium text-slate-500">
        {months.map((m) => <span key={m} className="absolute" style={{ left: `${diffDays(m, q.from) / len * 100}%` }}>{MON[Number(m.slice(5, 7)) - 1]}</span>)}
        <span className="absolute right-0">{formatDate(q.to).slice(0, 6)}</span>
      </div>
    </Card>
  );
}
