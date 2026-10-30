import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardCheck, Database, FileText, Pencil, ShieldAlert, TriangleAlert } from 'lucide-react';
import { DATA_FLAG_LABELS, EQUIPMENT_LABELS, formatDate, type Asset } from '@think/shared';
import { db } from '../lib/db.ts';
import { can, useUser } from '../lib/hooks.ts';
import { createInspection, updateAsset } from '../lib/store.ts';
import { downloadInspectionPack } from '../lib/exportPack.ts';
import { AssetStatusBadge, Badge, Button, Card, DueBadge, Empty, EquipmentAvatar, Field, InspectionStatusBadge, PageHeader, Sheet, useToast } from '../components/ui.tsx';
import { Skeleton } from './Dashboard.tsx';

export function AssetPage() {
  const { assetId = '' } = useParams();
  const user = useUser();
  const nav = useNavigate();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const data = useLiveQuery(async () => {
    const asset = await db.assets.get(assetId);
    if (!asset) return { asset: undefined };
    const [building, floor, location, inspections, floors, locations] = await Promise.all([
      db.buildings.get(asset.buildingId), asset.floorId ? db.floors.get(asset.floorId) : undefined,
      asset.locationId ? db.locations.get(asset.locationId) : undefined,
      db.inspections.where('assetId').equals(assetId).toArray(),
      db.floors.where('buildingId').equals(asset.buildingId).toArray(), db.locations.where('buildingId').equals(asset.buildingId).toArray(),
    ]);
    return { asset, building, floor, location, floors, locations, inspections: inspections.sort((a, b) => b.header.inspectionDate.localeCompare(a.header.inspectionDate) || b.createdAt.localeCompare(a.createdAt)) };
  }, [assetId]);
  if (!data) return <Skeleton />;
  const { asset } = data;
  if (!asset) return <Empty title="Asset not found" />;
  const { building, floor, location, inspections } = data;
  const draft = inspections.find((i) => (i.status === 'draft' || i.status === 'returned') && i.createdBy === user.id);
  const failed = inspections.find((i) => i.id === asset.lastInspectionId);
  const needsRetest = asset.status === 'out_of_service' || asset.status === 'retest_required';

  const start = async () => {
    if (draft) return nav(`/inspections/${draft.id}`);
    const id = await createInspection(asset, user, needsRetest && failed ? { kind: 'retest', retestOf: failed.id } : {});
    nav(`/inspections/${id}`);
  };
  const flags = asset.dataFlags.filter((f) => f !== 'SERIAL_MISSING' || !asset.serialNumber);

  return (
    <>
      <PageHeader back={`/sites/${asset.buildingId}`} eyebrow={`${building?.name}, ${building?.city}`}
        title={<span className="flex items-center gap-3"><EquipmentAvatar type={asset.equipmentType} tone={asset.status === 'out_of_service' ? 'red' : 'default'} />{asset.assetTag}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2">{EQUIPMENT_LABELS[asset.equipmentType]} <AssetStatusBadge status={asset.status} /> <DueBadge nextDue={asset.nextDueDate} /></span>}
        actions={can.inspect(user.role) ? <Button variant={needsRetest ? 'danger' : 'primary'} size="lg" icon={<ClipboardCheck className="h-5 w-5" />} onClick={start}>
          {draft ? 'Continue inspection' : needsRetest ? 'Start re-test' : 'Start inspection'}</Button> : undefined} />

      {asset.status === 'out_of_service' && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div><div className="font-semibold">Do not use — out of service</div><div className="text-sm">{asset.statusReason}</div></div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between"><div className="font-semibold">Equipment details</div>
              {can.manageSites(user.role) && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}</div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <Item k="Manufacturer / Brand" v={asset.manufacturer ?? (asset.candidateMakes.length ? `One of: ${asset.candidateMakes.join(', ')}` : null)} />
              <Item k="Model" v={asset.model} />
              <Item k="Serial number" v={asset.serialNumber} />
              <Item k="Floor" v={floor?.name} />
              <Item k="Location" v={location?.name} />
              <Item k="Installed / purchased" v={asset.installDate ? `${formatDate(asset.installDate)}${asset.installDateEstimated ? ' (estimated)' : ''}` : null} />
              <Item k="Last inspected" v={formatDate(asset.lastInspectionDate)} />
              <Item k="Next due" v={formatDate(asset.nextDueDate)} />
              <Item k="Age (inventory)" v={asset.ageRaw} />
            </dl>
          </Card>

          {asset.openDefects.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 font-semibold"><TriangleAlert className="h-5 w-5 text-rose-500" />Open defects</div>
              <ul className="space-y-3">
                {asset.openDefects.map((d) => (
                  <li key={`${d.inspectionId}-${d.checkNo}`} className="rounded-xl bg-rose-50/60 p-3 text-sm ring-1 ring-rose-100">
                    <div className="font-medium">{d.checkNo === 'TEST' ? 'Load test' : `#${d.checkNo}`} {d.label} {d.safetyCritical && <Badge tone="red">Safety-critical</Badge>}</div>
                    <div className="mt-1 text-slate-600">{d.remark}</div>
                    <div className="mt-1 text-xs text-slate-500">Raised {formatDate(d.raisedAt)} · Corrective action {d.correctiveActionRef || '—'}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <div className="px-5 pb-2 pt-5 font-semibold">Inspection history</div>
            {inspections.length === 0 ? <Empty title="Not inspected yet">The first inspection sets the baseline and the next due date.</Empty> : (
              <ol className="relative mx-5 mb-5 border-l border-slate-200">
                {inspections.map((i) => (
                  <li key={i.id} className="ml-5 py-3">
                    <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${i.result.defectsIdentified ? 'bg-rose-500' : i.status === 'draft' ? 'bg-slate-300' : 'bg-emerald-500'}`} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/inspections/${i.id}`} className="font-medium hover:text-brand-700">{formatDate(i.header.inspectionDate)} · {i.kind === 'retest' ? 'Re-test' : 'Routine'}</Link>
                      <div className="flex items-center gap-2"><InspectionStatusBadge status={i.status} />
                        {i.status !== 'draft' && <button title="Download PDF" onClick={() => downloadInspectionPack(i.id).catch((e) => toast(e.message, 'err'))} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><FileText className="h-4 w-4" /></button>}
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">{i.header.technician || 'No technician'} · {i.result.defectsIdentified ? `${i.checks.filter((c) => c.status === 'F').length} fail, ${i.checks.filter((c) => c.status === 'RECT').length} rectified` : i.status === 'draft' ? 'In progress' : 'All checks passed'}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {flags.length > 0 && (
            <Card className="p-5">
              <div className="mb-1 font-semibold">Record completeness</div>
              <div className="mb-3 text-sm text-slate-500">Imported from the inventory with gaps. Fill them in on site.</div>
              <ul className="space-y-2">{flags.map((f) => <li key={f} className="flex items-center gap-2 text-sm"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{DATA_FLAG_LABELS[f]}</li>)}</ul>
            </Card>
          )}
          {asset.importSource && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 font-semibold"><Database className="h-4 w-4 text-slate-400" />Inventory source</div>
              <div className="mb-2 text-xs text-slate-500">{asset.importSource.sheet}, row {asset.importSource.row}</div>
              <dl className="space-y-1.5 text-sm">
                {Object.entries(asset.importSource.raw).map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-slate-500">{k.trim()}</dt><dd className="break-words">{v}</dd></div>)}
              </dl>
            </Card>
          )}
        </div>
      </div>
      <EditAsset open={edit} onClose={() => setEdit(false)} asset={asset} floors={data.floors ?? []} locations={data.locations ?? []} onSaved={() => toast('Asset updated')} />
    </>
  );
}

function Item({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><dt className="text-xs text-slate-500">{k}</dt><dd className={v ? 'mt-0.5 font-medium' : 'mt-0.5 text-slate-400'}>{v || 'Not recorded'}</dd></div>;
}

function EditAsset({ open, onClose, asset, floors, locations, onSaved }: { open: boolean; onClose: () => void; asset: Asset; floors: { id: string; name: string }[]; locations: { id: string; floorId: string; name: string }[]; onSaved: () => void }) {
  const [f, setF] = useState({ serialNumber: asset.serialNumber ?? '', manufacturer: asset.manufacturer ?? '', model: asset.model ?? '', installDate: asset.installDate ?? '', floorId: asset.floorId ?? '', locationId: asset.locationId ?? '' });
  return (
    <Sheet open={open} onClose={onClose} title="Edit equipment details" footer={<Button variant="primary" className="flex-1" onClick={async () => {
      await updateAsset(asset, { serialNumber: f.serialNumber || null, manufacturer: f.manufacturer || null, model: f.model || null, installDate: f.installDate || null, floorId: f.floorId || null, locationId: f.locationId || null });
      onSaved(); onClose();
    }}>Save changes</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Serial number"><input className="input" value={f.serialNumber} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} /></Field>
        <Field label="Manufacturer / Brand" hint={asset.candidateMakes.length ? `Inventory lists: ${asset.candidateMakes.join(', ')}` : undefined}>
          <input className="input" list="makes" value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} />
          <datalist id="makes">{asset.candidateMakes.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Model"><input className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
        <Field label="Date of installation / purchase"><input type="date" className="input" value={f.installDate} onChange={(e) => setF({ ...f, installDate: e.target.value })} /></Field>
        <Field label="Floor"><select className="input" value={f.floorId} onChange={(e) => setF({ ...f, floorId: e.target.value, locationId: '' })}><option value="">Unassigned</option>{floors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Location"><select className="input" value={f.locationId} disabled={!f.floorId} onChange={(e) => setF({ ...f, locationId: e.target.value })}><option value="">—</option>{locations.filter((l) => l.floorId === f.floorId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      </div>
      <p className="mt-4 text-xs text-slate-500">Every change is recorded in the audit trail with your name and the time.</p>
    </Sheet>
  );
}
