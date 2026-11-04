import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Clock } from 'lucide-react';
import { useAllData } from '../lib/hooks.ts';
import { buildReport, EMPTY_FILTERS } from '../lib/reports.ts';
import { Bar, Card, Chip, Empty, PageHeader, SearchField } from '../components/ui.tsx';
import { Skeleton } from './Dashboard.tsx';
import { recentSites, textMatches } from '../lib/search.ts';

/** Sites as grouped lists, one group per city, like Settings. */
export function Sites() {
  const data = useAllData();
  const [q, setQ] = useState('');
  const [params, setParams] = useSearchParams();
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
      <PageHeader title="Sites" subtitle="Pick a site, then tap a unit to inspect it." />
      <SearchField id="site-list-search" value={q} onChange={setQ} placeholder="Search a site or city" />
      <div className="scrollbar-none -mx-4 mb-6 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Chip active={!city} onClick={() => setCity('')}>All cities</Chip>
        {cities.map((c) => <Chip key={c} active={city === c} onClick={() => setCity(c)}>{c}</Chip>)}
      </div>

      {!q && !city && recent.length > 0 && (
        <section className="mb-7">
          <div className="caption flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Recently opened</div>
          <Card className="divide-y overflow-hidden">
            {recent.map((g) => <SiteRow key={g.key} g={g} showCity />)}
          </Card>
        </section>
      )}
      {byCity.size === 0 && <Empty title="No sites match">Try the city name, or part of the site name.</Empty>}
      <div className="space-y-7">
        {[...byCity.entries()].sort().map(([c, groups]) => (
          <section key={c}>
            <div className="caption">{c} · {groups.reduce((s, g) => s + g.assets, 0)} assets</div>
            <Card className="divide-y overflow-hidden">
              {groups.map((g) => <SiteRow key={g.key} g={g} />)}
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}

type Group = NonNullable<ReturnType<typeof buildReport>>['groups'][number];

function SiteRow({ g, showCity }: { g: Group; showCity?: boolean }) {
  const left = g.assets - g.inDate;
  return (
    <Link to={`/sites/${g.key}`} className="row-press flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{g.label}{showCity && <span className="font-normal text-slate-500"> · {g.sub}</span>}</div>
        <div className="mt-1 flex items-center gap-2 text-[14px] text-slate-500">
          <span className="w-16 shrink-0"><Bar value={g.compliance} tone="brand" /></span>
          <span className="tabular">{left === 0 ? 'All done' : `${left} of ${g.assets} to inspect`}</span>
        </div>
      </div>
      {g.outOfService > 0 && <span className="shrink-0 rounded-full bg-rose-500/[.12] px-2.5 py-1 text-[12px] font-semibold text-rose-600">{g.outOfService} do not use</span>}
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
    </Link>
  );
}
