import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useAllData } from '../lib/hooks.ts';
import { buildReport, EMPTY_FILTERS } from '../lib/reports.ts';
import { Bar, Card, Chip, Empty, PageHeader, SearchField } from '../components/ui.tsx';
import { Skeleton } from './Dashboard.tsx';

/** Sites as grouped lists, one group per city, like Settings. */
export function Sites() {
  const data = useAllData();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const report = useMemo(() => data && buildReport(data, EMPTY_FILTERS, 'building'), [data]);
  if (!data || !report) return <Skeleton />;

  const cities = [...new Set(data.buildings.map((b) => b.city))].sort();
  const byCity = new Map<string, typeof report.groups>();
  for (const g of report.groups) {
    if (city && g.sub !== city) continue;
    if (q && !`${g.label} ${g.sub}`.toLowerCase().includes(q.toLowerCase())) continue;
    byCity.set(g.sub, [...(byCity.get(g.sub) ?? []), g]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Sites" subtitle={`${data.buildings.length} sites · ${data.assets.length} assets`} />
      <SearchField id="site-list-search" value={q} onChange={setQ} placeholder="Search sites" />
      <div className="scrollbar-none -mx-4 mb-6 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Chip active={!city} onClick={() => setCity('')}>All cities</Chip>
        {cities.map((c) => <Chip key={c} active={city === c} onClick={() => setCity(c)}>{c}</Chip>)}
      </div>

      {byCity.size === 0 && <Empty title="No sites match" />}
      <div className="space-y-7">
        {[...byCity.entries()].sort().map(([c, groups]) => (
          <section key={c}>
            <div className="caption">{c} · {groups.reduce((s, g) => s + g.assets, 0)} assets</div>
            <Card className="divide-y overflow-hidden">
              {groups.map((g) => (
                <Link key={g.key} to={`/sites/${g.key}`} className="row-press flex items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{g.label}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[14px] text-slate-500">
                      <span>{g.assets} assets</span>
                      <span className="w-14 shrink-0"><Bar value={g.compliance} tone="brand" /></span>
                      <span className="tabular">{g.inDate === 0 ? 'Not started' : `${g.inDate}/${g.assets}`}</span>
                    </div>
                  </div>
                  {g.outOfService > 0 && <span className="rounded-full bg-rose-500/[.12] px-2.5 py-1 text-[12px] font-semibold text-rose-600">{g.outOfService} out of service</span>}
                  {g.overdue > 0 && <span className="rounded-full bg-amber-500/[.16] px-2.5 py-1 text-[12px] font-semibold text-amber-700">{g.overdue} overdue</span>}
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}
