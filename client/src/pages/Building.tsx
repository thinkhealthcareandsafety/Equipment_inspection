import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, Check, ChevronRight, CircleAlert, ClipboardCheck, Factory, Layers, MapPin, Pencil, Plus, Printer, SquareCheck, Trash2, X } from 'lucide-react';
import { downloadQrLabels } from '../lib/qr.ts';
import {
  dayLabel, daysLeftIn, EQUIPMENT_LABELS, formatDate, missingDetails, needsInspection, quarterLabel, quarterLock, quarterName, quarterOf, type Asset, type EquipmentType,
} from '@think/shared';
import { db } from '../lib/db.ts';
import { can, useDismissed, useUser } from '../lib/hooks.ts';
import { openOrCreateInspection, updateAsset, upsertFloor, upsertLocation } from '../lib/store.ts';
import { AssetStatusBadge, Badge, Bar, Button, Card, Chip, cx, DismissButton, Empty, EquipmentAvatar, Field, PageHeader, QuarterBadge, SearchField, Sheet, useToast } from '../components/ui.tsx';
import { Select } from '../components/Pickers.tsx';
import { ContactLine, ContactsSheet, DateTile, nextVisit, ScheduleSheet } from '../components/Plan.tsx';
import { PoCell, PurchaseOrderSheet } from '../components/Documents.tsx';
import { Skeleton } from './Dashboard.tsx';
import { rememberSite, textMatches } from '../lib/search.ts';
import { FloorsSheet } from '../components/FloorTools.tsx';
import { useDialogs } from '../components/Dialogs.tsx';

const UNASSIGNED = '__none';

export function BuildingPage() {
  const { buildingId = '' } = useParams();
  useEffect(() => { if (buildingId) rememberSite(buildingId); }, [buildingId]);
  const [params, setParams] = useSearchParams();
  const user = useUser();
  const nav = useNavigate();
  const toast = useToast();
  const dialogs = useDialogs();
  const floorSel = params.get('floor') ?? '';
  const [type, setType] = useState<EquipmentType | ''>('');
  const [due, setDue] = useState('');
  const [q, setQ] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [floorsOpen, setFloorsOpen] = useState(false);
  const [floorEdit, setFloorEdit] = useState<{ id?: string; name: string } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [contacts, setContacts] = useState<{ startNew: boolean } | null>(null);
  const [po, setPo] = useState<{ startNew: boolean } | null>(null);
  const [floorsTipHidden, hideFloorsTip] = useDismissed('floors-tip');
  const [unassignedHidden, hideUnassigned] = useDismissed('unassigned-note');

  const data = useLiveQuery(async () => {
    const [building, floors, locations, assets, visits, documents] = await Promise.all([
      db.buildings.get(buildingId), db.floors.where('buildingId').equals(buildingId).toArray(),
      db.locations.where('buildingId').equals(buildingId).toArray(), db.assets.where('buildingId').equals(buildingId).toArray(),
      db.visits.where('buildingId').equals(buildingId).toArray(),
      db.documents.where('buildingId').equals(buildingId).toArray(),
    ]);
    const client = building ? await db.clients.get(building.clientId) : undefined;
    return { building, client, visits, documents: documents.map(({ blob: _b, ...d }) => d), floors: floors.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { numeric: true })), locations,
      assets: assets.filter((a) => a.status !== 'removed') };
  }, [buildingId]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.assets.filter((a) => {
      if (floorSel === UNASSIGNED ? a.floorId : floorSel && a.floorId !== floorSel) return false;
      if (type && a.equipmentType !== type) return false;
      if (due === 'oos' && a.status === 'in_service') return false;
      if (due === 'todo' && !needsInspection(a)) return false;
      if (due === 'missing' && !missingDetails(a).length) return false;
      if (q && !textMatches(q, a.assetTag, a.manufacturer, a.model, a.serialNumber, EQUIPMENT_LABELS[a.equipmentType])) return false;
      return true;
    }).sort((a, b) => a.assetTag.localeCompare(b.assetTag, undefined, { numeric: true }));
  }, [data, floorSel, type, due, q]);

  if (!data) return <Skeleton />;
  if (!data.building) return <Empty title="Site not found" />;
  const { building, floors, locations, assets } = data;
  const staff = can.manageSites(user.role);
  const unassigned = assets.filter((a) => !a.floorId).length;
  const floorName = (id: string | null) => floors.find((f) => f.id === id)?.name;
  const locName = (id: string | null) => locations.find((l) => l.id === id)?.name;
  const types = [...new Set(assets.map((a) => a.equipmentType))];
  const quarter = quarterOf();
  const kp = {
    oos: assets.filter((a) => a.status !== 'in_service').length,
    todo: assets.filter((a) => needsInspection(a)).length,
    missing: assets.filter((a) => missingDetails(a).length > 0).length,
  };
  const doneQ = assets.length - kp.todo;
  const visit = nextVisit(data.visits, buildingId);

  const setFloor = (id: string) => { const p = new URLSearchParams(params); if (id) p.set('floor', id); else p.delete('floor'); setParams(p, { replace: true }); };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const startInspection = async (a: Asset) => {
    try { nav(`/inspections/${await openOrCreateInspection(a, user)}`); }
    catch (e) { toast((e as Error).message, 'err'); }
  };

  const currentFloor = floors.find((f) => f.id === floorSel);

  return (
    <>
      <PageHeader back="/sites" title={building.name}
        subtitle={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {data.client?.name && <span className="rounded-[7px] bg-ink-950 px-2 py-0.5 text-[13px] font-bold tracking-[0.02em] text-white">{data.client.name}</span>}
          <span>{building.city} · {assets.length} units · {floors.length} floor{floors.length === 1 ? '' : 's'} recorded{building.notes ? ` · ${building.notes}` : ''}</span>
        </span>}
        actions={<>
          <Button icon={<Printer className="h-4 w-4" />} disabled={printing} title="A4 sheets of 21 QR stickers for every unit shown below"
            onClick={async () => { setPrinting(true); try { await downloadQrLabels(visible.length ? visible : assets, building, visible.length && visible.length < assets.length ? `${building.name} QR labels (${visible.length} selected).pdf` : undefined); } catch (e) { toast((e as Error).message, 'err'); } finally { setPrinting(false); } }}>
            {printing ? 'Preparing…' : `QR labels${visible.length && visible.length < assets.length ? ` (${visible.length})` : ''}`}
          </Button>
          <Link to={`/reports?city=${encodeURIComponent(building.city)}&buildingId=${building.id}`}><Button>Site report</Button></Link>
        </>} />

      {/* At a glance: this quarter, who to call, when we go */}
      <Card className="mb-6 overflow-hidden">
        <div className="grid grid-cols-1 gap-px bg-black/[.08] md:grid-cols-2 2xl:grid-cols-4">
        <div className="bg-white p-4 sm:p-5">
          <div className="mb-2.5 text-[13px] font-semibold text-slate-500">{quarterLabel(quarter)}</div>
          <div className="flex items-baseline gap-1.5"><span className="text-[26px] font-bold leading-none tracking-[-0.02em] tabular">{doneQ}</span><span className="text-[15px] text-slate-500">of {assets.length} done</span></div>
          <div className="mt-2.5"><Bar value={assets.length ? (doneQ / assets.length) * 100 : 0} tone="brand" /></div>
          <div className="mt-2 text-[13px] text-slate-500">{kp.todo === 0 ? `Every unit is done for ${quarterName(quarter)}` : `${kp.todo} to inspect · ${daysLeftIn(quarter)} days left`}</div>
          {kp.missing > 0 && (
            <button type="button" data-missing-link onClick={() => setDue(due === 'missing' ? '' : 'missing')} className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-amber-700 hover:underline">
              <CircleAlert className="h-3.5 w-3.5" />{kp.missing} {kp.missing === 1 ? 'unit is' : 'units are'} missing details
            </button>
          )}
        </div>
        <div className="bg-white p-4 sm:p-5">
          <div className="mb-2.5 text-[13px] font-semibold text-slate-500">Site contact</div>
          <ContactLine building={building} onManage={(startNew) => setContacts({ startNew })} />
        </div>
        <div className="bg-white p-4 sm:p-5">
          <div className="mb-2.5 text-[13px] font-semibold text-slate-500">Purchase order</div>
          <PoCell docs={data.documents} onOpen={(startNew) => setPo({ startNew })} />
        </div>
        <div className="bg-white p-4 sm:p-5">
          <div className="mb-2.5 text-[13px] font-semibold text-slate-500">Next visit</div>
          {visit ? (
            <button type="button" onClick={() => setPlanOpen(true)} data-next-visit className="flex w-full items-center gap-3 text-left transition active:opacity-70">
              <DateTile date={visit.date} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{dayLabel(visit.date)}{visit.inspector ? ` · ${visit.inspector}` : ''}</span>
                <span className="block truncate text-[14px] text-slate-500">{visit.note || (visit.inspector ? 'Planned' : 'Inspector not decided yet')}</span>
              </span>
              <span className="shrink-0 text-[15px] font-semibold text-brand-700">Change</span>
            </button>
          ) : (
            <button type="button" onClick={() => setPlanOpen(true)} data-plan-visit className="flex w-full items-center gap-3 text-left transition active:opacity-70">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] border border-dashed border-brand-300 bg-brand-50 text-brand-600"><CalendarPlus className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-brand-700">Plan a visit</span>
                <span className="block truncate text-[14px] text-slate-500">Pick the day and who goes</span>
              </span>
            </button>
          )}
        </div>
        </div>
      </Card>

      {/* Floor selector */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-500">Floors</div>
        {staff && <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<Layers className="h-4 w-4" />} onClick={() => setFloorsOpen(true)}>Add floors</Button>
          <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setFloorEdit({ name: '' })}>One floor</Button>
        </div>}
      </div>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <Chip active={!floorSel} onClick={() => setFloor('')} count={assets.length}>All floors</Chip>
        {floors.map((f) => <Chip key={f.id} active={floorSel === f.id} onClick={() => setFloor(f.id)} count={assets.filter((a) => a.floorId === f.id).length}>{f.name}</Chip>)}
        {unassigned > 0 && <Chip active={floorSel === UNASSIGNED} onClick={() => setFloor(UNASSIGNED)} count={unassigned}>Unassigned</Chip>}
      </div>

      {staff && floors.length === 0 && !floorsTipHidden && (
        <div data-floors-tip className="mb-4 flex items-center gap-1 rounded-2xl border border-dashed border-brand-300 bg-brand-50/60 pr-2 transition hover:bg-brand-50">
          <button type="button" onClick={() => setFloorsOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left">
            <Layers className="h-5 w-5 shrink-0 text-brand-600" />
            <span className="text-sm"><b className="text-slate-900">Add this site's floors</b><span className="block text-slate-600">One tap adds Ground to the top floor, so reports can show floor by floor.</span></span>
          </button>
          <DismissButton onClick={hideFloorsTip} label="Hide this tip (Add floors stays above)" />
        </div>
      )}
      {currentFloor && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <Layers className="h-5 w-5 text-brand-600" />
          <div className="flex-1">
            <div className="font-medium">{currentFloor.name}</div>
            <div className="text-sm text-slate-500">{locations.filter((l) => l.floorId === currentFloor.id).map((l) => l.name).join(' · ') || 'No locations yet'}</div>
          </div>
          {staff && <>
            <Button size="sm" icon={<MapPin className="h-4 w-4" />} onClick={async () => {
              const name = await dialogs.prompt(`Name the location on ${currentFloor.name}.`, { title: 'Add location', placeholder: 'e.g. Lift lobby, Reception, Fire exit 2', confirmLabel: 'Add location' });
              if (name?.trim()) { await upsertLocation({ floorId: currentFloor.id, buildingId, clientId: building.clientId, name: name.trim() }); toast('Location added'); }
            }}>Add location</Button>
            <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setFloorEdit({ id: currentFloor.id, name: currentFloor.name })}>Rename</Button>
          </>}
        </Card>
      )}
      {floorSel === UNASSIGNED && !unassignedHidden && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 py-1 pl-3 pr-1 text-sm text-amber-900">
          <span className="flex-1">No floor recorded yet. Use <b>Select</b> to move units to their floor.</span>
          <DismissButton onClick={hideUnassigned} label="Hide this note" className="text-amber-700/70 hover:text-amber-900" />
        </div>
      )}

      {/* Filters: search + one row of chips */}
      <div className="mb-3 flex gap-2">
        <SearchField id="site-search" className="flex-1 sm:max-w-xs" placeholder="Asset ID, make, serial" value={q} onChange={setQ} />
        {staff && <Button variant={selecting ? 'dark' : 'secondary'} className="h-[46px]" icon={<SquareCheck className="h-4 w-4" />}
          onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>{selecting ? 'Done' : 'Select'}</Button>}
      </div>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={due === 'todo'} onClick={() => setDue(due === 'todo' ? '' : 'todo')} count={kp.todo}>To inspect</Chip>
        {kp.missing > 0 && <Chip active={due === 'missing'} onClick={() => setDue(due === 'missing' ? '' : 'missing')} count={kp.missing}>Missing details</Chip>}
        {kp.oos > 0 && <Chip active={due === 'oos'} onClick={() => setDue(due === 'oos' ? '' : 'oos')} count={kp.oos}>Needs re-test</Chip>}
        <span className="mx-1 w-px shrink-0 bg-slate-200" />
        <Chip active={!type} onClick={() => setType('')}>All types</Chip>
        {types.map((t) => <Chip key={t} active={type === t} onClick={() => setType(t)} count={assets.filter((a) => a.equipmentType === t).length}>{EQUIPMENT_LABELS[t]}</Chip>)}
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? <Empty title="No assets match these filters" /> : (
          <ul className="divide-y divide-slate-100">
            {visible.map((a) => {
              const lock = quarterLock(a);
              const retest = a.status === 'out_of_service' || a.status === 'retest_required';
              const where = [floorName(a.floorId), locName(a.locationId)].filter(Boolean).join(', ');
              const missing = missingDetails(a).filter((m) => m !== 'make'); // the make line already says "Make not recorded"
              return (
              <li key={a.id} data-unit={a.assetTag} className={cx('flex items-center gap-3 px-4 py-3.5 sm:px-5', selected.has(a.id) && 'bg-brand-50/60')}>
                {selecting && <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />}
                <Link to={`/assets/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3.5" onClick={(e) => { if (selecting) { e.preventDefault(); toggle(a.id); } }}>
                  <EquipmentAvatar type={a.equipmentType} size={58} tone={a.status === 'out_of_service' ? 'red' : a.status === 'retest_required' ? 'amber' : 'default'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[17px] font-semibold tracking-[-0.01em]">{a.assetTag}</span>
                      {a.status !== 'in_service' && <AssetStatusBadge status={a.status} />}
                    </div>
                    <Make asset={a} />
                    <div className="mt-0.5 truncate text-[13px] text-slate-500">
                      {EQUIPMENT_LABELS[a.equipmentType]}{where ? ` · ${where}` : ''} · {a.lastInspectionDate ? `Last inspected ${formatDate(a.lastInspectionDate)}` : 'Never inspected'}
                    </div>
                    {missing.length > 0 && (
                      <div data-missing className="mt-1 inline-flex max-w-full items-start gap-1.5 rounded-[9px] bg-amber-500/[.13] px-2 py-0.5 text-[12.5px] font-semibold leading-[18px] text-amber-800">
                        <CircleAlert className="mt-[2px] h-3.5 w-3.5 shrink-0" /><span className="min-w-0">Missing: {missing.join(', ')}</span>
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block"><QuarterBadge asset={a} short /></div>
                </Link>
                {!selecting && can.inspect(user.role) && (retest ? (
                  <Button size="sm" variant="danger" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => startInspection(a)} aria-label={`Re-test ${a.assetTag}`}>
                    <span className="hidden sm:inline">Re-test</span>
                  </Button>
                ) : lock ? (
                  <span title={`Done for ${quarterName(lock.quarter)}. The ${quarterName(lock.opens)} inspection opens on ${formatDate(lock.opens.from)}.`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/[.14] text-emerald-600 sm:hidden" aria-label={`Done for ${quarterName(lock.quarter)}`}>
                    <Check className="h-5 w-5" strokeWidth={2.6} />
                  </span>
                ) : (
                  <Button size="sm" variant="primary" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => startInspection(a)} aria-label={`Inspect ${a.assetTag}`}>
                    <span className="hidden sm:inline">Inspect</span>
                  </Button>
                ))}
                {!selecting && !can.inspect(user.role) && <ChevronRight className="h-5 w-5 text-slate-300" />}
              </li>
              );
            })}
          </ul>
        )}
      </Card>

      {selecting && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-6 lg:pl-[264px]">
          <div className="animate-rise flex items-center gap-3 rounded-2xl bg-ink-950 px-4 py-3 text-white shadow-lift">
            <span className="text-sm">{selected.size} selected</span>
            <Button size="sm" variant="primary" onClick={() => setMoveOpen(true)}>Move to floor…</Button>
            <button onClick={() => setSelected(new Set())} className="rounded-lg p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <MoveSheet open={moveOpen} onClose={() => setMoveOpen(false)} floors={floors} locations={locations}
        onMove={async (floorId, locationId) => {
          for (const id of selected) { const a = assets.find((x) => x.id === id); if (a) await updateAsset(a, { floorId, locationId }); }
          toast(`${selected.size} asset${selected.size > 1 ? 's' : ''} moved`); setSelected(new Set()); setSelecting(false); setMoveOpen(false);
        }} />

      <ScheduleSheet open={planOpen} onClose={() => setPlanOpen(false)} building={building} visit={visit} left={kp.todo} />
      {contacts && <ContactsSheet open onClose={() => setContacts(null)} building={building} startNew={contacts.startNew} />}
      {po && <PurchaseOrderSheet open onClose={() => setPo(null)} building={building} docs={data.documents} startNew={po.startNew} />}
      <FloorsSheet open={floorsOpen} onClose={() => setFloorsOpen(false)} building={{ id: buildingId, clientId: building.clientId }} floors={floors} />
      <Sheet open={!!floorEdit} onClose={() => setFloorEdit(null)} title={floorEdit?.id ? 'Rename floor' : 'Add floor'} footer={<>
        {floorEdit?.id && <Button variant="ghost" className="text-rose-600" icon={<Trash2 className="h-4 w-4" />} onClick={async () => {
          if (assets.some((a) => a.floorId === floorEdit.id)) { toast('Move the assets off this floor first', 'err'); return; }
          const f = floors.find((x) => x.id === floorEdit.id)!;
          await upsertFloor({ ...f, deleted: true }); setFloor(''); setFloorEdit(null); toast('Floor removed');
        }}>Delete</Button>}
        <Button variant="primary" className="flex-1" disabled={!floorEdit?.name.trim()} onClick={async () => {
          const existing = floors.find((x) => x.id === floorEdit!.id);
          const id = await upsertFloor({ id: floorEdit!.id, buildingId, clientId: building.clientId, name: floorEdit!.name.trim(), sortOrder: existing?.sortOrder ?? floorOrder(floorEdit!.name) });
          setFloor(id); setFloorEdit(null); toast('Floor saved');
        }}>Save</Button>
      </>}>
        <Field label="Floor name" hint="Use the name inspectors see on site, e.g. Ground Floor, 10th Floor, Basement 2, Terrace.">
          <input autoFocus className="input" value={floorEdit?.name ?? ''} onChange={(e) => setFloorEdit((f) => f && { ...f, name: e.target.value })} />
        </Field>
      </Sheet>
    </>
  );
}

function floorOrder(name: string) {
  const n = name.toLowerCase();
  if (/basement|lower/.test(n)) return -Number(n.match(/\d+/)?.[0] ?? 1);
  if (/ground|^gf|lobby/.test(n)) return 0;
  if (/terrace|roof/.test(n)) return 999;
  return Number(n.match(/\d+/)?.[0] ?? 500);
}

function MoveSheet({ open, onClose, floors, locations, onMove }: {
  open: boolean; onClose: () => void; floors: { id: string; name: string }[]; locations: { id: string; floorId: string; name: string }[];
  onMove: (floorId: string | null, locationId: string | null) => void;
}) {
  const [floorId, setFloorId] = useState('');
  const [locId, setLocId] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Move to floor" footer={<Button variant="primary" className="flex-1" disabled={!floorId} onClick={() => onMove(floorId === UNASSIGNED ? null : floorId, locId || null)}>Move</Button>}>
      <div className="space-y-4">
        <Field label="Floor">
          <Select value={floorId} onChange={(v) => { setFloorId(v); setLocId(''); }} placeholder="Choose a floor" ariaLabel="Floor"
            options={[...floors.map((f) => ({ value: f.id, label: f.name, text: f.name })), { value: UNASSIGNED, label: 'Unassigned', text: 'Unassigned' }]} />
        </Field>
        {floorId && floorId !== UNASSIGNED && (
          <Field label="Location (optional)">
            <Select value={locId} onChange={setLocId} ariaLabel="Location"
              options={[{ value: '', label: 'No specific location', text: 'No specific location' }, ...locations.filter((l) => l.floorId === floorId).map((l) => ({ value: l.id, label: l.name, text: l.name }))]} />
          </Field>
        )}
        {floors.length === 0 && <Badge tone="amber">Add a floor first using “Add floor”.</Badge>}
      </div>
    </Sheet>
  );
}

/** The maker, shown clearly: it is what the client asks about first. */
function Make({ asset }: { asset: Asset }) {
  if (asset.manufacturer) {
    return (
      <div className="mt-1 flex items-start gap-1.5 text-[14.5px] font-semibold leading-snug text-slate-800" title={asset.manufacturer}>
        <Factory className="mt-[3px] h-3.5 w-3.5 shrink-0 text-brand-600" strokeWidth={2.2} />
        <span className="line-clamp-2">{asset.manufacturer}</span>
      </div>
    );
  }
  if (asset.candidateMakes.length) {
    return <div className="mt-1 line-clamp-2 text-[14px] font-medium text-amber-700">{asset.candidateMakes.join(' or ')} <span className="font-normal text-slate-500">(to confirm)</span></div>;
  }
  return <div className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-amber-700"><CircleAlert className="h-3.5 w-3.5 shrink-0" />Make not recorded</div>;
}
