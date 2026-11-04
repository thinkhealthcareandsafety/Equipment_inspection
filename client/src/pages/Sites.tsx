import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarCheck2, CalendarPlus, Clock } from 'lucide-react';
import { dayLabel, quarterLabel, quarterOf, type Visit } from '@think/shared';
import { useAllData } from '../lib/hooks.ts';
import { nextVisit, ScheduleSheet } from '../components/Plan.tsx';
import { buildReport, EMPTY_FILTERS } from '../lib/reports.ts';
import { Bar, Card, Chip, cx, Empty, PageHeader, SearchField } from '../components/ui.tsx';
import { Skeleton } from './Dashboard.tsx';
import { recentSites, textMatches } from '../lib/search.ts';

/** Sites as grouped lists, one group per city, like Settings. */
export function Sites() {
  const data = useAllData();
  const [q, setQ] = useState('');
  const [params, setParams] = useSearchParams();
  const [plan, setPlan] = useState<string | null>(null);
  const city = params.get('city') ?? '';
  const setCity = (c: string) => { const n = new URLSearchParams(params); if (c) n.set('city', c); else n.delete('city'); setParams(n, { replace: true }); };
  const report = useMemo(() => data && buildReport(data, EMPTY_FILTERS, 'building'), [data]);
  if (!data || !report) return <Skeleton />;

  const cities = [...new Set(data.buildings.map((b) => b.city))].sort();
  const recent = recentSites().map((id) => report.groups.find((g) => g.key === id)).filter(Boolean) as typeof report.groups;
  const byCity = new Map<string, typeof report.groups>();
  for (const g of report.groups) {
    if (city && g.sub !== city) continue;
    if (q && !textMatches(q, g.label, g.sub)) continue;
    byCity.set(g.sub, [...(byCity.get(g.sub) ?? []), g]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Sites" subtitle={`Pick a site, then tap a unit to inspect it. ${quarterLabel(quarterOf())}.`} />
      <SearchField id="site-list-search" value={q} onChange={setQ} placeholder="Search a site or city" />
      <div className="scrollbar-none -mx-4 mb-6 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Chip active={!city} onClick={() => setCity('')}>All cities</Chip>
        {cities.map((c) => <Chip key={c} active={city === c} onClick={() => setCity(c)}>{c}</Chip>)}
      </div>

      {!q && !city && recent.length > 0 && (
        <section className="mb-7">
          <div className="caption flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Recently opened</div>
          <Card className="divide-y overflow-hidden">
            {recent.map((g) => <SiteRow key={g.key} g={g} showCity visit={nextVisit(data.visits, g.key)} onPlan={() => setPlan(g.key)} />)}
          </Card>
        </section>
      )}
      {byCity.size === 0 && <Empty title="No sites match">Try the city name, or part of the site name.</Empty>}
      <div className="space-y-7">
        {[...byCity.entries()].sort().map(([c, groups]) => (
          <section key={c}>
            <div className="caption">{c} · {groups.reduce((s, g) => s + g.assets, 0)} assets</div>
            <Card className="divide-y overflow-hidden">
              {groups.map((g) => <SiteRow key={g.key} g={g} visit={nextVisit(data.visits, g.key)} onPlan={() => setPlan(g.key)} />)}
            </Card>
          </section>
        ))}
      </div>
      {plan && (() => {
        const b = data.buildings.find((x) => x.id === plan);
        const g = report.groups.find((x) => x.key === plan);
        return b ? <ScheduleSheet open onClose={() => setPlan(null)} building={b} visit={nextVisit(data.visits, plan)} left={g ? g.assets - g.inDate : 0} /> : null;
      })()}
    </div>
  );
}

type Group = NonNullable<ReturnType<typeof buildReport>>['groups'][number];

/** One site: progress on the left; on the right, the planned visit or a Plan button. */
export function SiteRow({ g, showCity, visit, onPlan }: { g: Group; showCity?: boolean; visit?: Visit; onPlan: () => void }) {
  const left = g.assets - g.inDate;
  return (
    <div className="flex items-center" data-site={g.label}>
      <Link to={`/sites/${g.key}`} className="row-press flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 pr-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{g.label}{showCity && <span className="font-normal text-slate-500"> · {g.sub}</span>}</div>
          <div className="mt-1 flex items-center gap-2 text-[14px] text-slate-500">
            <span className="w-14 shrink-0 sm:w-16"><Bar value={g.compliance} tone="brand" /></span>
            <span className={cx('truncate tabular', left === 0 && 'font-medium text-emerald-600')}>{left === 0 ? 'All done' : `${left} of ${g.assets} to inspect`}</span>
          </div>
        </div>
        {g.outOfService > 0 && <span className="shrink-0 rounded-full bg-rose-500/[.12] px-2.5 py-1 text-[12px] font-semibold text-rose-600">{g.outOfService}<span className="hidden sm:inline"> do not use</span></span>}
      </Link>
      <div className="shrink-0 pr-3">
        {visit ? (
          <button type="button" onClick={onPlan} data-visit-chip title={`Visit planned${visit.inspector ? ` · ${visit.inspector}` : ''}. Tap to change.`}
            className="flex h-9 items-center gap-1.5 rounded-full bg-brand-500/[.12] px-3 text-[14px] font-semibold text-brand-700 transition hover:bg-brand-500/[.18] active:scale-95">
            <CalendarCheck2 className="h-4 w-4" />{dayLabel(visit.date)}
            {visit.inspector && <span className="hidden font-medium text-brand-700/75 md:inline">· {visit.inspector.split(' ')[0]}</span>}
          </button>
        ) : left > 0 ? (
          <button type="button" onClick={onPlan} data-plan
            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-slate-500 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] transition hover:bg-black/[.04] hover:text-brand-700 active:scale-95">
            <CalendarPlus className="h-4 w-4" />Plan
          </button>
        ) : null}
      </div>
    </div>
  );
}
