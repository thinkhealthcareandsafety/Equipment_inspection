import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, ClipboardCheck, Layers, MapPin, Pencil, Plus, Search, SquareCheck, Trash2, X } from 'lucide-react';
import { dueState, EQUIPMENT_LABELS, formatDate, type Asset, type EquipmentType } from '@think/shared';
import { db } from '../lib/db.ts';
import { can, useUser } from '../lib/hooks.ts';
import { openOrCreateInspection, updateAsset, upsertFloor, upsertLocation } from '../lib/store.ts';
import { AssetStatusBadge, Badge, Button, Card, Chip, cx, DueBadge, Empty, EquipmentAvatar, Field, PageHeader, Sheet, useToast } from '../components/ui.tsx';
import { Skeleton } from './Dashboard.tsx';
import { useDialogs } from '../components/Dialogs.tsx';

const UNASSIGNED = '__none';

export function BuildingPage() {
  const { buildingId = '' } = useParams();
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
  const [floorEdit, setFloorEdit] = useState<{ id?: string; name: string } | null>(null);

  const data = useLiveQuery(async () => {
    const [building, floors, locations, assets] = await Promise.all([
      db.buildings.get(buildingId), db.floors.where('buildingId').equals(buildingId).toArray(),
      db.locations.where('buildingId').equals(buildingId).toArray(), db.assets.where('buildingId').equals(buildingId).toArray(),
    ]);
    const client = building ? await db.clients.get(building.clientId) : undefined;
    return { building, client, floors: floors.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { numeric: true })), locations, assets };
  }, [buildingId]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.assets.filter((a) => {
      if (floorSel === UNASSIGNED ? a.floorId : floorSel && a.floorId !== floorSel) return false;
      if (type && a.equipmentType !== type) return false;
      if (due && (due === 'oos' ? a.status === 'in_service' : dueState(a.nextDueDate) === 'ok')) return false;
      if (q && !`${a.assetTag} ${a.manufacturer ?? ''} ${a.model ?? ''} ${a.serialNumber ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
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
  const kp = {
    oos: assets.filter((a) => a.status === 'out_of_service').length,
    overdue: assets.filter((a) => dueState(a.nextDueDate) === 'overdue').length,
    soon: assets.filter((a) => dueState(a.nextDueDate) === 'due_soon').length,
    never: assets.filter((a) => dueState(a.nextDueDate) === 'never').length,
  };

  const setFloor = (id: string) => { const p = new URLSearchParams(params); if (id) p.set('floor', id); else p.delete('floor'); setParams(p, { replace: true }); };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const startInspection = async (a: Asset) => {
    try { nav(`/inspections/${await openOrCreateInspection(a, user)}`); }
    catch (e) { toast((e as Error).message, 'err'); }
  };
  const todo = (a: Asset) => dueState(a.nextDueDate) !== 'ok';

  const currentFloor = floors.find((f) => f.id === floorSel);

  return (
    <>
      <PageHeader back="/sites" eyebrow={`${data.client?.name ?? ''} · ${building.city}`} title={building.name}
        subtitle={`${assets.length} assets · ${floors.length} floor${floors.length === 1 ? '' : 's'} recorded${building.notes ? ` · ${building.notes}` : ''}`}
        actions={<Link to={`/reports?city=${encodeURIComponent(building.city)}&buildingId=${building.id}`}><Button>Site report</Button></Link>} />

      {/* Floor selector */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-500">Floors</div>
        {staff && <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setFloorEdit({ name: '' })}>Add floor</Button>}
      </div>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <Chip active={!floorSel} onClick={() => setFloor('')} count={assets.length}>All floors</Chip>
        {floors.map((f) => <Chip key={f.id} active={floorSel === f.id} onClick={() => setFloor(f.id)} count={assets.filter((a) => a.floorId === f.id).length}>{f.name}</Chip>)}
        {unassigned > 0 && <Chip active={floorSel === UNASSIGNED} onClick={() => setFloor(UNASSIGNED)} count={unassigned}>Unassigned</Chip>}
      </div>

      {can.inspect(user.role) && visible.some(todo) && !selecting && (
        <Button variant="primary" size="lg" className="mb-4 w-full sm:w-auto" icon={<ClipboardCheck className="h-5 w-5" />}
          onClick={() => startInspection(visible.find(todo)!)}>
          <span className="text-left leading-tight">Inspect next<span className="block text-xs font-normal opacity-80">{visible.find(todo)!.assetTag} · {visible.filter(todo).length} to go{currentFloor ? ` on ${currentFloor.name}` : ''}</span></span>
        </Button>
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
      {floorSel === UNASSIGNED && (
        <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No floor recorded yet. Use <b>Select</b> to move units to their floor.
        </div>
      )}

      {/* Filters: search + one row of chips */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="site-search" className="input pl-10" placeholder="Asset ID, make, serial" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {staff && <Button variant={selecting ? 'dark' : 'secondary'} className="h-[46px]" icon={<SquareCheck className="h-4 w-4" />}
          onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>{selecting ? 'Done' : 'Select'}</Button>}
      </div>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={due === 'todo'} onClick={() => setDue(due === 'todo' ? '' : 'todo')} count={kp.overdue + kp.soon + kp.never}>To inspect</Chip>
        {kp.oos > 0 && <Chip active={due === 'oos'} onClick={() => setDue(due === 'oos' ? '' : 'oos')} count={kp.oos}>Out of service</Chip>}
        <span className="mx-1 w-px shrink-0 bg-slate-200" />
        <Chip active={!type} onClick={() => setType('')}>All types</Chip>
        {types.map((t) => <Chip key={t} active={type === t} onClick={() => setType(t)} count={assets.filter((a) => a.equipmentType === t).length}>{EQUIPMENT_LABELS[t]}</Chip>)}
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? <Empty title="No assets match these filters" /> : (
          <ul className="divide-y divide-slate-100">
            {visible.map((a) => (
              <li key={a.id} className={cx('flex items-center gap-3 px-4 py-3 sm:px-5', selected.has(a.id) && 'bg-brand-50/60')}>
                {selecting && <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />}
                <Link to={`/assets/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3" onClick={(e) => { if (selecting) { e.preventDefault(); toggle(a.id); } }}>
                  <EquipmentAvatar type={a.equipmentType} tone={a.status === 'out_of_service' ? 'red' : a.status === 'retest_required' ? 'amber' : 'default'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 font-medium">{a.assetTag}
                      {a.status !== 'in_service' && <AssetStatusBadge status={a.status} />}
                    </div>
                    <div className="truncate text-sm text-slate-500">
                      {EQUIPMENT_LABELS[a.equipmentType]} · {a.manufacturer ?? (a.candidateMakes.length ? a.candidateMakes.join(' / ') : 'Make not recorded')}
                      {(floorName(a.floorId) || locName(a.locationId)) && ` · ${[floorName(a.floorId), locName(a.locationId)].filter(Boolean).join(', ')}`}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">Last inspected {formatDate(a.lastInspectionDate)}</div>
                  </div>
                  <div className="hidden sm:block"><DueBadge nextDue={a.nextDueDate} /></div>
                </Link>
                {!selecting && can.inspect(user.role) && (
                  <Button size="sm" variant={a.status === 'out_of_service' ? 'danger' : 'primary'} icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => startInspection(a)}>
                    <span className="hidden sm:inline">{a.status === 'in_service' ? 'Inspect' : 'Re-test'}</span>
                  </Button>
                )}
                {!selecting && !can.inspect(user.role) && <ChevronRight className="h-5 w-5 text-slate-300" />}
              </li>
            ))}
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
          <select className="input" value={floorId} onChange={(e) => { setFloorId(e.target.value); setLocId(''); }}>
            <option value="">Choose a floor</option>
            {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value={UNASSIGNED}>Unassigned</option>
          </select>
        </Field>
        {floorId && floorId !== UNASSIGNED && (
          <Field label="Location (optional)">
            <select className="input" value={locId} onChange={(e) => setLocId(e.target.value)}>
              <option value="">No specific location</option>
              {locations.filter((l) => l.floorId === floorId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        )}
        {floors.length === 0 && <Badge tone="amber">Add a floor first using “Add floor”.</Badge>}
      </div>
    </Sheet>
  );
}
