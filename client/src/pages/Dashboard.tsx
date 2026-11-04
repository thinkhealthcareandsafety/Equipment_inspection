/**
 * Home. Everything the boss needs at a glance, in order:
 *  1. The quarter: how much is done, how much time is left, and whether we are on pace.
 *  2. Six numbers, each one tap from its list.
 *  3. What needs attention, what is planned next, and progress by city.
 * "Past quarters" keeps every finished quarter's final numbers; a new quarter starts by itself on its first day.
 */
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Archive, Building2, CalendarDays, CalendarPlus, ChevronRight, ClipboardCheck, LifeBuoy, PenLine, ScanLine, ShieldAlert } from 'lucide-react';
import {
  addDays, dayLabel, daysLeftIn, diffDays, EQUIPMENT_LABELS, formatDate, fyLabel, inQuarter, isMine, isOpen, pastQuarters, quarterElapsed,
  quarterLabel, quarterLength, quarterName, quarterOf, shiftQuarter, todayISO, weekday, type Quarter,
} from '@think/shared';
import { can, useAllData, useUser } from '../lib/hooks.ts';
import { buildReport, closingSoon, EMPTY_FILTERS } from '../lib/reports.ts';
import { Button, Card, cx, Empty, InspectionStatusBadge, Segmented } from '../components/ui.tsx';
import { GlobalSearch } from '../components/GlobalSearch.tsx';
import { ContactActions, DateTile } from '../components/Plan.tsx';

type AllData = NonNullable<ReturnType<typeof useAllData>>;

export function Dashboard() {
  const user = useUser();
  const data = useAllData();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'past' ? 'past' : 'now';
  const report = useMemo(() => data && buildReport(data, EMPTY_FILTERS, 'building'), [data]);
  const byCity = useMemo(() => data && buildReport(data, EMPTY_FILTERS, 'city').groups.slice().sort((a, b) => b.assets - a.assets), [data]);
  if (!data || !report) return <Skeleton />;
  if (!data.assets.length) return <Empty title="Downloading your sites…" icon={<ClipboardCheck className="h-6 w-6" />}>The first sync downloads every site and unit so you can work offline.</Empty>;

  const today = todayISO();
  const q = report.quarter;
  const longDay = ({ Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' } as Record<string, string>)[weekday(today)];

  const closing = closingSoon(report);

  return (
    <div>
      {/* Greeting and the ways in. On a computer they share one row, so the numbers start right below. */}
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[34px]">{user.name === 'Team' ? 'Hello' : `Hello, ${user.name.split(' ')[0]}`}</h1>
          <p className="mt-1.5 text-[16px] text-slate-500">
            <span className="hidden sm:inline">{longDay}, </span>{formatDate(today)} · {quarterName(q)} · {fyLabel(q)}
            <span className="hidden sm:inline"> · <Link to="/help" className="font-medium text-brand-700 hover:underline">How to use</Link></span>
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0">
            <Button size="lg" variant="primary" className="whitespace-nowrap !px-3 sm:!px-6" icon={<Building2 className="h-5 w-5 shrink-0" />} onClick={() => nav('/sites')}>Pick a site</Button>
            <Button size="lg" className="whitespace-nowrap !px-3 sm:!px-6" icon={<ScanLine className="h-5 w-5 shrink-0" />} onClick={() => window.dispatchEvent(new Event('think:scan'))}>Scan label</Button>
          </div>
          <div className="min-w-0 sm:flex-1 2xl:w-[420px] 2xl:flex-none"><GlobalSearch data={data} /></div>
        </div>
      </div>
      <Link to="/help" className="mt-3 inline-flex items-center gap-1.5 px-1 text-[15px] font-medium text-brand-700 sm:hidden"><LifeBuoy className="h-4 w-4" />New here? How to use the app</Link>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-[340px]">
          <Segmented value={tab} onChange={(t) => setParams(t === 'past' ? { tab: 'past' } : {}, { replace: true })}
            options={[{ value: 'now', label: `${quarterName(q)} · this quarter` }, { value: 'past', label: 'Past quarters' }]} />
        </div>
        {tab === 'now' && (
          <div data-quarter-line className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[14px] text-slate-500">
            <span className="font-semibold text-slate-800">{quarterLabel(q)}</span><span>· closes {formatDate(q.to)}</span>
            <span className={cx('rounded-full px-2.5 py-1 text-[13px] font-semibold tabular', closing ? 'bg-amber-500/[.16] text-amber-700' : 'bg-black/[.05] text-slate-700')}>
              {report.daysLeft} {report.daysLeft === 1 ? 'day' : 'days'} left
            </span>
          </div>
        )}
      </div>

      {tab === 'now' ? <ThisQuarter data={data} report={report} byCity={byCity ?? []} /> : <PastQuarters data={data} total={report.kpis.assets} today={today} />}
    </div>
  );
}

// ---------- this quarter ----------

type Report = ReturnType<typeof buildReport>;

function ThisQuarter({ data, report, byCity }: { data: AllData; report: Report; byCity: Report['groups'] }) {
  const user = useUser();
  const today = todayISO();
  const q = report.quarter;
  const next = shiftQuarter(q, 1);
  const k = report.kpis;
  const total = k.assets, done = k.inDate, todo = k.todo;
  const bById = new Map(data.buildings.map((b) => [b.id, b]));
  const outList = report.assets.filter((a) => a.status === 'out_of_service');
  const failedThisQuarter = outList.filter((a) => inQuarter(a.lastInspectionDate, q)).length;
  const mine = data.inspections.filter((i) => isOpen(i) && isMine(i, user))
    .sort((a, b) => Number(b.status === 'returned') - Number(a.status === 'returned') || b.updatedAt.localeCompare(a.updatedAt));
  const reviewQueue = can.review(user.role) ? data.inspections.filter((i) => i.status === 'submitted') : [];

  // Pace: share of units done vs share of the quarter gone, and what a working day (Mon–Sat) needs from here.
  const elapsed = quarterElapsed(q, today);
  const share = total ? done / total : 0;
  const workDays = Array.from({ length: daysLeftIn(q, today) }, (_, i) => addDays(today, i)).filter((d) => weekday(d) !== 'Sun').length;
  const perDay = workDays ? Math.ceil(todo / workDays) : todo;
  const pace = todo === 0 ? 'done' : share + 0.02 >= elapsed ? 'on' : 'behind';

  const sitesWithWork = report.groups.filter((g) => g.todo > 0).length;
  const sitesDone = report.groups.length - sitesWithWork;
  const upcoming = data.visits.filter((v) => v.status === 'planned' && v.date >= today && bById.has(v.buildingId)).sort((a, b) => a.date.localeCompare(b.date));
  const plannedSites = new Set(upcoming.map((v) => v.buildingId));
  const unplanned = report.groups.filter((g) => g.todo > 0 && !plannedSites.has(g.key)).length;
  const left = new Map(report.groups.map((g) => [g.key, g.todo]));

  const people = [...data.inspections.filter((i) => (i.status === 'submitted' || i.status === 'finalized') && i.header.inspectionDate === today).reduce((m, i) => {
    const name = i.header.technician || 'Unknown';
    const r = m.get(name) ?? { name, count: 0, fails: 0 };
    r.count++; if (i.result.defectsIdentified) r.fails++;
    return m.set(name, r);
  }, new Map<string, { name: string; count: number; fails: number }>()).values()].sort((a, b) => b.count - a.count);

  const closing = closingSoon(report);
  const attention = reviewQueue.length + mine.length + outList.length + (closing ? 1 : 0);
  const pct = total ? Math.round(share * 100) : 0;

  const withDefects = report.assets.filter((a) => a.openDefects.length > 0).length;
  const sitesTotal = Math.max(report.groups.length, 1);

  return (
    <>
      {/* The six numbers first: each one opens the list behind it */}
      <Card data-kpis className="mt-3 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-black/[.07] sm:grid-cols-3 xl:grid-cols-6">
          <Kpi to="/reports?view=done" label="Done" value={done} sub={`of ${total} units · ${pct}%`} tone={done ? 'green' : 'muted'} bar={share} barTone="green" />
          <Kpi to="/reports?view=due" label="To inspect" value={todo} sub={`at ${sitesWithWork} ${sitesWithWork === 1 ? 'site' : 'sites'}`} tone={closing ? 'amber' : 'ink'} bar={total ? todo / total : 0} barTone={closing ? 'amber' : 'slate'} />
          <Kpi to="/reports?view=oos" label="Do not use" value={k.outOfService} sub="out of service" tone={k.outOfService ? 'red' : 'muted'} bar={total ? k.outOfService / total : 0} barTone="red" />
          <Kpi to="/reports?view=defects" label="Problems" value={k.openDefects} sub={k.openDefects ? `${k.safetyCritical} on safety checks` : 'none open'} tone={k.openDefects ? 'red' : 'muted'} bar={total ? withDefects / total : 0} barTone="red" />
          <Kpi to="/sites" label="Sites finished" value={sitesDone} sub={`of ${report.groups.length} sites`} tone={sitesDone ? 'green' : 'muted'} bar={sitesDone / sitesTotal} barTone="green" />
          <Kpi to="/schedule" label="Visits planned" value={upcoming.length} sub={unplanned ? `${unplanned} ${unplanned === 1 ? 'site' : 'sites'} not planned` : 'every site planned'} tone="ink"
            bar={sitesWithWork ? (sitesWithWork - unplanned) / sitesWithWork : 1} barTone="brand" />
        </div>
      </Card>

      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:block lg:min-w-0 lg:space-y-6">
          {/* Progress against time */}
          <Card data-board className="order-3 overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="text-[19px] font-bold tracking-[-0.02em]">{quarterName(q)} progress</div>
                <div className="text-[14px] tabular text-slate-500">{Math.round(elapsed * 100)}% of the quarter gone</div>
              </div>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5">
                <span data-done className="text-[44px] font-bold leading-none tracking-[-0.035em] tabular">{done}</span>
                <span className="text-[17px] text-slate-500">of {total} units done · {pct}%</span>
              </div>
              <PaceBar q={q} today={today} done={done - failedThisQuarter} failed={failedThisQuarter} total={total} />
              <p data-pace className="mt-4 text-[15px] leading-relaxed text-slate-600">
                {pace === 'done' ? <><strong className="text-emerald-700">Every unit is done for {quarterName(q)}.</strong> {quarterName(next)} opens on {formatDate(next.from)}.</>
                  : pace === 'on' ? <><strong className="text-slate-900">On pace.</strong> {todo} to go: about {perDay} {perDay === 1 ? 'unit' : 'units'} a working day finishes by {formatDate(q.to)}.</>
                  : <><strong className="text-amber-700">Behind pace.</strong> {Math.round(elapsed * 100)}% of the quarter has gone and {pct}% of units are done. About {perDay} a working day finishes by {formatDate(q.to)}.</>}
              </p>
            </div>
            <div className="border-t-[0.5px] border-black/10 bg-black/[.02] px-5 py-3 text-[13px] leading-relaxed text-slate-500 sm:px-6">
              When {quarterName(q)} closes on {formatDate(q.to)}, its results move to <Link to="/?tab=past" className="font-medium text-brand-700">Past quarters</Link> and {quarterName(next)} starts on {formatDate(next.from)} with every unit to inspect again.
            </div>
          </Card>

          <section className="order-4">
            <Caption right={<Link to="/reports" className="text-[15px] font-medium text-brand-700">See report</Link>}>{quarterName(q)} by city<span className="hidden sm:inline"> · tap a city to see its sites</span></Caption>
            <Card className="overflow-hidden">
              <div className="divide-y">
                {byCity.map((c) => (
                  <Link key={c.key} to={`/sites?city=${encodeURIComponent(c.label)}`} data-city={c.label} className="row-press grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_auto_auto] items-center gap-3 py-3 pl-4 pr-3">
                    <div className="truncate text-[16px] font-medium">{c.label}</div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-slate-200/80" role="img" aria-label={`${c.inDate} of ${c.assets} done, ${c.doneFailed} of them failed`}>
                      <span className="h-full bg-emerald-500 transition-[width] duration-700 ease-out" style={{ width: `${((c.inDate - c.doneFailed) / Math.max(c.assets, 1)) * 100}%` }} />
                      <span className="h-full bg-rose-500" style={{ width: `${(c.doneFailed / Math.max(c.assets, 1)) * 100}%` }} />
                    </div>
                    <div className="text-right text-[14px] tabular text-slate-500">{c.inDate} of {c.assets}</div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Link>
                ))}
              </div>
            </Card>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Done for {quarterName(q)}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-500" />Failed, do not use</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-200" />Still to do</span>
            </div>
          </section>
        </div>

        <div className="contents lg:block lg:min-w-0 lg:space-y-6">
          {attention > 0 && (
            <section className="order-1">
              <Caption>Needs attention</Caption>
              <Card className="overflow-hidden">
                <div className="divide-y">
                  {closing && <Row to="/schedule" tone="amber" icon={<CalendarDays className="h-5 w-5" />}
                    title={`${quarterName(q)} closes in ${report.daysLeft} ${report.daysLeft === 1 ? 'day' : 'days'} with ${todo} ${todo === 1 ? 'unit' : 'units'} to go`} sub="Plan the remaining sites now" />}
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
                </div>
              </Card>
            </section>
          )}

          <section className="order-2">
            <Caption right={<Link to="/schedule" className="text-[15px] font-medium text-brand-700">Schedule</Link>}>Coming up</Caption>
            <Card className="overflow-hidden">
              {upcoming.length === 0 ? (
                <div className="flex flex-col items-start gap-3 p-5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand-500/[.1] text-brand-600"><CalendarPlus className="h-6 w-6" /></span>
                  <div className="min-w-0">
                    <div className="text-[17px] font-semibold">No visits planned yet</div>
                    <div className="text-[15px] text-slate-500">Plan which site is inspected on which day, and who goes. Everyone sees it.</div>
                  </div>
                  <Link to="/schedule"><Button variant="primary" icon={<CalendarPlus className="h-4 w-4" />}>Plan visits</Button></Link>
                </div>
              ) : (
                <div className="divide-y">
                  {upcoming.slice(0, 5).map((v) => {
                    const b = bById.get(v.buildingId)!;
                    const n = left.get(b.id) ?? 0;
                    const contact = b.contacts?.find((c) => c.phone);
                    return (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-3" data-upcoming={b.name}>
                        <DateTile date={v.date} />
                        <Link to={`/sites/${b.id}`} className="min-w-0 flex-1">
                          <div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{b.name} <span className="font-normal text-slate-500">· {b.city}</span></div>
                          <div className="truncate text-[14px] text-slate-500">{dayLabel(v.date, today)} · {v.inspector || 'Inspector not decided'} · {n === 0 ? 'all done' : `${n} to inspect`}</div>
                        </Link>
                        {contact && <ContactActions contact={contact} callOnly />}
                      </div>
                    );
                  })}
                  {upcoming.length > 5 && <Row to="/schedule" tone="slate" icon={<CalendarDays className="h-5 w-5" />} title={`${upcoming.length - 5} more planned`} sub="See the whole schedule" />}
                </div>
              )}
            </Card>
          </section>

          {people.length > 0 && (
            <section className="order-5">
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
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** Work done against time gone: the bar fills with units done, the dark line is today. */
function PaceBar({ q, today, done, failed, total }: { q: Quarter; today: string; done: number; failed: number; total: number }) {
  const len = quarterLength(q);
  const elapsed = quarterElapsed(q, today) * 100;
  const months = [0, 1, 2].map((i) => `${q.from.slice(0, 5)}${String(Number(q.from.slice(5, 7)) + i).padStart(2, '0')}-01`);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <div className="mt-4" role="img" aria-label={`${done + failed} of ${total} done; ${Math.round(elapsed)}% of the quarter has gone`}>
      <div className="relative pt-5">
        <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.05em] text-slate-900" style={{ left: `${Math.min(Math.max(elapsed, 6), 94)}%` }}>Today</span>
        <div className="flex h-3.5 overflow-hidden rounded-full bg-slate-200/80">
          <span className="h-full bg-emerald-500 transition-[width] duration-700 ease-out" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
          <span className="h-full bg-rose-500 transition-[width] duration-700 ease-out" style={{ width: `${(failed / Math.max(total, 1)) * 100}%` }} />
        </div>
        <span className="absolute bottom-[-4px] top-[16px] w-[2px] -translate-x-1/2 rounded-full bg-ink-950" style={{ left: `${elapsed}%` }} />
      </div>
      <div className="relative mt-2 h-4 text-[12px] font-medium text-slate-500">
        {months.map((m) => <span key={m} className="absolute" style={{ left: `${(diffDays(m, q.from) / len) * 100}%` }}>{MON[Number(m.slice(5, 7)) - 1]} 1</span>)}
        <span className="absolute right-0">{formatDate(q.to).slice(0, 6)}</span>
      </div>
    </div>
  );
}

const BAR = { green: 'bg-emerald-500', red: 'bg-rose-500', amber: 'bg-amber-500', slate: 'bg-slate-400', brand: 'bg-brand-500' } as const;

function Kpi({ to, label, value, sub, tone, bar, barTone }: {
  to: string; label: string; value: number; sub: string; tone: 'ink' | 'green' | 'red' | 'amber' | 'muted'; bar: number; barTone: keyof typeof BAR;
}) {
  const w = Math.max(0, Math.min(1, bar)) * 100;
  return (
    <Link to={to} data-kpi={label} className="group flex flex-col bg-white px-4 py-4 transition-colors duration-150 hover:bg-slate-50 active:bg-slate-100 sm:px-5 sm:py-5">
      <div className="flex items-center justify-between text-[13px] font-semibold text-slate-500">{label}<ChevronRight className="h-4 w-4 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5" /></div>
      <div className={cx('mt-2 text-[34px] font-bold leading-none tracking-[-0.035em] tabular',
        tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : tone === 'muted' ? 'text-slate-300' : 'text-slate-900')}>{value}</div>
      <div className="mt-1.5 truncate text-[13px] text-slate-500">{sub}</div>
      <div className="mt-auto pt-3"><div className="h-1 overflow-hidden rounded-full bg-black/[.06]">
        <div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', BAR[barTone])} style={{ width: `${w > 0 ? Math.max(w, 2) : 0}%` }} />
      </div></div>
    </Link>
  );
}

// ---------- past quarters ----------

function PastQuarters({ data, total, today }: { data: AllData; total: number; today: string }) {
  const now = quarterOf(today);
  const signed = data.inspections.filter((i) => (i.status === 'submitted' || i.status === 'finalized') && i.header.inspectionDate);
  const first = signed.reduce<string | null>((m, i) => (!m || i.header.inspectionDate < m ? i.header.inspectionDate : m), null);
  const quarters = pastQuarters(first, today).map((q) => {
    const ins = signed.filter((i) => inQuarter(i.header.inspectionDate, q));
    const units = new Set(ins.map((i) => i.assetId)).size;
    return { q, units, inspections: ins.length, problems: ins.filter((i) => i.result.defectsIdentified).length };
  });
  const fyStart = shiftQuarter(now, -(now.n - 1));
  const fy = [0, 1, 2, 3].map((i) => shiftQuarter(fyStart, i));

  return (
    <>
      <Card className="mt-3 p-5 sm:p-6">
        <div className="text-[17px] font-semibold">{fyLabel(now)}</div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {fy.map((q) => {
            const state = q.key === now.key ? 'now' : q.to < today ? 'past' : 'next';
            const row = quarters.find((r) => r.q.key === q.key);
            const body = (
              <div className={cx('h-full rounded-[14px] px-2.5 py-2.5 sm:px-3.5',
                state === 'now' ? 'bg-brand-600 text-white shadow-[0_8px_20px_-8px_rgb(13_143_122/0.7)]' : state === 'past' ? 'bg-black/[.05] text-slate-800' : 'bg-black/[.025] text-slate-400')}>
                <div className="text-[17px] font-bold leading-tight">{quarterName(q)}</div>
                <div className={cx('whitespace-nowrap text-[11.5px] font-medium sm:text-[12px]', state === 'now' ? 'text-white/80' : 'text-slate-500')}>{quarterLabel(q).split(' · ')[1].replace(/ \d{4}$/, '')}</div>
                <div className={cx('mt-1 whitespace-nowrap text-[12px] font-semibold', state === 'now' ? 'text-white' : '')}>{state === 'now' ? 'Now' : state === 'past' ? (row ? `${row.units} done` : 'No data') : <><span className="sm:hidden">Next</span><span className="hidden sm:inline">Opens {formatDate(q.from).slice(0, 6)}</span></>}</div>
              </div>
            );
            return row ? <Link key={q.key} to={`/reports?q=${q.key}`} className="transition active:scale-[.97]">{body}</Link> : <div key={q.key}>{body}</div>;
          })}
        </div>
      </Card>

      <Caption className="mt-8">Finished quarters</Caption>
      {quarters.length === 0 ? (
        <Card>
          <Empty icon={<Archive className="h-6 w-6" />} title="No finished quarter yet">
            {quarterName(now)} is the first quarter in Think Inspect. When it closes on {formatDate(now.to)}, its final numbers appear here and {quarterName(shiftQuarter(now, 1))} starts on {formatDate(shiftQuarter(now, 1).from)} with every unit to inspect again.
          </Empty>
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {quarters.map(({ q, units, inspections, problems }) => {
            const pct = total ? Math.round((units / total) * 100) : 0;
            return (
              <Link key={q.key} to={`/reports?q=${q.key}`} data-past={q.key} className="row-press flex items-center gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-[17px] font-semibold">{quarterLabel(q)}</span><span className="text-[13px] text-slate-500">{fyLabel(q)} · final</span></div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-200/80"><span className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  <div className="mt-1.5 text-[14px] text-slate-500">
                    <span className="font-semibold text-slate-800">{units} of {total}</span> inspected ({pct}%) · {Math.max(0, total - units)} missed · {inspections} inspections
                    {problems > 0 && <span className="font-semibold text-rose-600"> · {problems} with problems</span>}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}

function Caption({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-2 flex items-baseline justify-between gap-3 px-1', className)}>
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
