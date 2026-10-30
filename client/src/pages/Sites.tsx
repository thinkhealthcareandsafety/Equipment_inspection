import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, MapPin, Search } from 'lucide-react';
import { EQUIPMENT_LABELS, type EquipmentType } from '@think/shared';
import { useAllData } from '../lib/hooks.ts';
import { buildReport, EMPTY_FILTERS } from '../lib/reports.ts';
import { Bar, Card, Chip, Empty, EquipmentIcon, PageHeader } from '../components/ui.tsx';
import { Skeleton } from './Dashboard.tsx';

export function Sites() {
  const data = useAllData();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [client, setClient] = useState('');
  const report = useMemo(() => data && buildReport(data, { ...EMPTY_FILTERS, clientId: client }, 'building'), [data, client]);
  if (!data || !report) return <Skeleton />;

  const cities = [...new Set(data.buildings.map((b) => b.city))].sort();
  const byCity = new Map<string, typeof report.groups>();
  for (const g of report.groups) {
    if (city && g.sub !== city) continue;
    if (q && !`${g.label} ${g.sub}`.toLowerCase().includes(q.toLowerCase())) continue;
    byCity.set(g.sub, [...(byCity.get(g.sub) ?? []), g]);
  }
  const typeCounts = (buildingId: string) => {
    const m = new Map<EquipmentType, number>();
    for (const a of data.assets) if (a.buildingId === buildingId) m.set(a.equipmentType, (m.get(a.equipmentType) ?? 0) + 1);
    return [...m.entries()];
  };

  return (
    <>
      <PageHeader title="Sites" subtitle={`${data.buildings.length} sites · ${data.assets.length} assets`} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Search sites" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {data.clients.length > 1 && (
          <select className="input sm:w-48" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">All clients</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Chip active={!city} onClick={() => setCity('')}>All cities</Chip>
          {cities.map((c) => <Chip key={c} active={city === c} onClick={() => setCity(c)} count={data.buildings.filter((b) => b.city === c).length}>{c}</Chip>)}
        </div>
      </div>

      {byCity.size === 0 && <Empty title="No sites match" />}
      <div className="space-y-8">
        {[...byCity.entries()].sort().map(([c, groups]) => (
          <section key={c}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500"><MapPin className="h-4 w-4" />{c}<span className="font-normal">· {groups.reduce((s, g) => s + g.assets, 0)} assets</span></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <Link key={g.key} to={`/sites/${g.key}`}>
                  <Card className="group h-full p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[17px] font-semibold">{g.label}</div>
                        <div className="text-sm text-slate-500">{g.assets} assets · {g.inspected} inspected</div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {typeCounts(g.key).map(([t, n]) => (
                        <span key={t} title={EQUIPMENT_LABELS[t]} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                          <EquipmentIcon type={t} className="h-3.5 w-3.5" />{n}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4"><Bar value={g.compliance} /></div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-500">{g.compliance}% in date</span>
                      <span className="flex gap-1.5">
                        {g.outOfService > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">{g.outOfService} out of service</span>}
                        {g.overdue > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{g.overdue} overdue</span>}
                        {g.never > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{g.never} new</span>}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
