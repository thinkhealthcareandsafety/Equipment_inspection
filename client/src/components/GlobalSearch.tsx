/**
 * The search box on Home. Results appear as you type (sites and units, best first, matched
 * letters highlighted, unit safety shown), arrow keys and Enter work, and an empty box shows
 * the units you opened recently. Matching lives in lib/search.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Clock, MapPin } from 'lucide-react';
import { dueState, EQUIPMENT_LABELS, type Asset, type Building, type Floor, type Location } from '@think/shared';
import { buildIndex, highlight, recentUnits, rememberUnit, search } from '../lib/search.ts';
import { cx, EquipmentAvatar, SearchField } from './ui.tsx';

type Data = { buildings: Building[]; assets: Asset[]; floors: Floor[]; locations: Location[] };
type Row = { key: string; to: string; kind: 'site' | 'unit'; title: string; sub: string; asset?: Asset; building?: Building };

export function GlobalSearch({ data, placeholder = 'Find a unit or site', id = 'home-search', autoFocus, onNavigate }: {
  data: Data; placeholder?: string; id?: string; autoFocus?: boolean; onNavigate?: () => void;
}) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const index = useMemo(() => buildIndex(data), [data]);
  const bById = useMemo(() => new Map(data.buildings.map((b) => [b.id, b])), [data.buildings]);

  const unitRow = (a: Asset): Row => {
    const b = bById.get(a.buildingId);
    return { key: a.id, to: `/assets/${a.id}`, kind: 'unit', title: a.assetTag, asset: a,
      sub: [EQUIPMENT_LABELS[a.equipmentType], b ? `${b.name}, ${b.city}` : '', a.manufacturer ?? ''].filter(Boolean).join(' · ') };
  };
  const siteRow = (b: Building): Row => {
    const n = data.assets.filter((a) => a.buildingId === b.id).length;
    return { key: b.id, to: `/sites/${b.id}`, kind: 'site', title: b.name, sub: `Site · ${b.city} · ${n} units`, building: b };
  };

  const term = q.trim();
  const result = useMemo(() => (term ? search(index, term) : null), [index, term]);
  const recent = useMemo(() => (term ? [] : recentUnits().map((id) => data.assets.find((a) => a.id === id)).filter(Boolean) as Asset[]), [term, data.assets, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Units first when the query looks like a unit (has a number); sites first otherwise.
  const unitsFirst = /\d/.test(term);
  const groups: { title: string; rows: Row[] }[] = result
    ? (unitsFirst
      ? [{ title: 'Units', rows: result.units.map((h) => unitRow(h.item)) }, { title: 'Sites', rows: result.sites.map((h) => siteRow(h.item)) }]
      : [{ title: 'Sites', rows: result.sites.map((h) => siteRow(h.item)) }, { title: 'Units', rows: result.units.map((h) => unitRow(h.item)) }]
    ).filter((g) => g.rows.length)
    : recent.length ? [{ title: 'Recently opened', rows: recent.map(unitRow) }] : [];
  const flat = groups.flatMap((g) => g.rows);
  const more = result ? result.totalUnits - result.units.length : 0;

  useEffect(() => { setActive(0); }, [term]);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const go = (r: Row) => {
    if (r.kind === 'unit') rememberUnit(r.key);
    setOpen(false);
    setQ('');
    onNavigate?.();
    nav(r.to);
  };
  useEffect(() => { if (autoFocus) setTimeout(() => document.getElementById(id)?.focus(), 60); }, [autoFocus, id]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { const r = flat[active] ?? flat[0]; if (r) { e.preventDefault(); go(r); } }
    else if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
  };

  const showPanel = open && (groups.length > 0 || !!term);
  let i = -1;

  return (
    <div ref={box} className="relative" onFocus={() => setOpen(true)} onKeyDown={onKey}>
      <SearchField id={id} value={q} onChange={(v) => { setQ(v); setOpen(true); }} placeholder={placeholder} className="h-[52px]" />
      {showPanel && (
        <div role="listbox" aria-label="Search results" className="animate-pop absolute inset-x-0 top-full z-30 mt-2 max-h-[min(70dvh,560px)] overflow-y-auto rounded-[18px] bg-white shadow-lift ring-1 ring-black/[.06]">
          {groups.map((g) => (
            <div key={g.title} className="py-1.5">
              <div className="flex items-center gap-1.5 px-4 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-400">
                {g.title === 'Recently opened' && <Clock className="h-3.5 w-3.5" />}{g.title}
              </div>
              {g.rows.map((r) => {
                i += 1;
                const idx = i;
                const out = r.asset?.status === 'out_of_service';
                const due = r.asset ? dueState(r.asset.nextDueDate) : null;
                return (
                  <button key={r.key} type="button" role="option" aria-selected={idx === active}
                    onPointerEnter={() => setActive(idx)} onClick={() => go(r)}
                    className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors', idx === active ? 'bg-brand-500/[.09]' : 'hover:bg-black/[.03]')}>
                    {r.asset ? <EquipmentAvatar type={r.asset.equipmentType} tone={out ? 'red' : 'default'} />
                      : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-slate-500 text-white"><MapPin className="h-5 w-5" /></span>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[17px] font-medium tracking-[-0.01em]">
                        {highlight(r.title, term).map((s, n) => s.on ? <mark key={n} className="rounded-[3px] bg-brand-500/[.18] px-px text-inherit">{s.text}</mark> : <span key={n}>{s.text}</span>)}
                      </div>
                      <div className="truncate text-[14px] text-slate-500">{r.sub}</div>
                    </div>
                    {out ? <span className="shrink-0 rounded-full bg-rose-500/[.12] px-2.5 py-1 text-[12px] font-semibold text-rose-600">Do not use</span>
                      : due === 'overdue' ? <span className="shrink-0 rounded-full bg-amber-500/[.16] px-2.5 py-1 text-[12px] font-semibold text-amber-700">Overdue</span>
                      : due === 'ok' ? <span className="shrink-0 text-[12px] font-medium text-emerald-600">In date</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
          {term && flat.length === 0 && (
            <div className="px-5 py-6 text-center">
              <div className="text-[16px] font-semibold text-slate-900">Nothing matches “{term}”</div>
              <div className="mt-1 text-[14px] text-slate-500">Try the tag on the unit (for example NKP WC 4), the site name, or the make.</div>
            </div>
          )}
          {more > 0 && <div className="border-t border-black/[.06] px-4 py-2.5 text-[13px] text-slate-500">{more} more {more === 1 ? 'unit matches' : 'units match'}. Type more to narrow it down.</div>}
          {!term && groups.length > 0 && <div className="border-t border-black/[.06] px-4 py-2.5 text-[13px] text-slate-500">Type a tag, site, city or make. Spelling mistakes are fine.</div>}
        </div>
      )}
    </div>
  );
}
