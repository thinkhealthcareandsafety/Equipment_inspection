import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, CircleAlert, CircleCheck, ClipboardCheck, Database, Factory, FileText, Pencil, Printer, ShieldAlert, TriangleAlert } from 'lucide-react';
import {
  DATA_FLAG_LABELS, EQUIPMENT_LABELS, formatDate, missingDetails, quarterLock, quarterName, quarterOf, todayISO, type Asset, type Building, type DataFlag,
} from '@think/shared';
import { downloadQrLabels, qrDataUrl, unitUrl } from '../lib/qr.ts';
import { rememberUnit } from '../lib/search.ts';
import { db } from '../lib/db.ts';
import { can, useUser } from '../lib/hooks.ts';
import { createInspection, updateAsset } from '../lib/store.ts';
import { downloadInspectionPack } from '../lib/exportPack.ts';
import { AssetStatusBadge, Badge, Button, Card, Empty, EquipmentAvatar, Field, InspectionStatusBadge, PageHeader, QuarterBadge, Sheet, useToast } from '../components/ui.tsx';
import { DateField, Select, Suggestions } from '../components/Pickers.tsx';
import { Skeleton } from './Dashboard.tsx';

export function AssetPage() {
  const { assetId = '' } = useParams();
  const user = useUser();
  const nav = useNavigate();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  useEffect(() => { if (assetId) rememberUnit(assetId); }, [assetId]);
  const data = useLiveQuery(async () => {
    const asset = await db.assets.get(assetId);
    if (!asset) return { asset: undefined };
    const [building, floor, location, inspections, floors, locations] = await Promise.all([
      db.buildings.get(asset.buildingId), asset.floorId ? db.floors.get(asset.floorId) : undefined,
      asset.locationId ? db.locations.get(asset.locationId) : undefined,
      db.inspections.where('assetId').equals(assetId).filter((i) => i.status !== 'discarded').toArray(),
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

  const lock = quarterLock(asset);
  const q = quarterOf();
  const lastSigned = inspections.find((i) => i.id === asset.lastInspectionId);
  const start = async () => {
    if (draft) return nav(`/inspections/${draft.id}`);
    try {
      const id = await createInspection(asset, user, needsRetest && failed ? { kind: 'retest', retestOf: failed.id } : {});
      nav(`/inspections/${id}`);
    } catch (e) { toast((e as Error).message, 'err'); }
  };
  const make = asset.manufacturer ?? (asset.candidateMakes.length ? `${asset.candidateMakes.join(' or ')} (to confirm)` : null);
  const missing = missingDetails(asset);
  // Inventory notes that are not simply an empty field (those are listed in the "missing" panel).
  const NOTE_FLAGS: DataFlag[] = ['MAKE_AMBIGUOUS', 'AGE_ESTIMATED', 'AGE_AMBIGUOUS', 'TYPE_INFERRED', 'QTY_RECONCILED', 'TAKEN_FOR_REPLACEMENT'];
  const flags = asset.dataFlags.filter((f) => NOTE_FLAGS.includes(f));

  return (
    <>
      <PageHeader back={`/sites/${asset.buildingId}`}
        title={<span className="flex items-center gap-4">
          <EquipmentAvatar type={asset.equipmentType} size={76} tone={asset.status === 'out_of_service' ? 'red' : asset.status === 'retest_required' ? 'amber' : 'default'} />
          <span className="min-w-0">
            <span className="block break-all text-[26px] sm:text-[34px]">{asset.assetTag}</span>
            <span className="mt-1 block text-[15px] font-medium tracking-normal text-slate-500">{EQUIPMENT_LABELS[asset.equipmentType]} · {building?.name}, {building?.city}</span>
          </span>
        </span>}
        subtitle={<span className="mt-1 flex flex-col gap-2.5">
          <span className={make ? 'flex items-start gap-2 text-[17px] font-semibold leading-snug text-slate-900' : 'flex items-center gap-2 text-[16px] font-semibold text-amber-700'}>
            {make ? <Factory className="mt-1 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.2} /> : <CircleAlert className="h-4 w-4 shrink-0" />}{make ?? 'Make not recorded'}
          </span>
          <span className="flex flex-wrap items-center gap-2"><AssetStatusBadge status={asset.status} /><QuarterBadge asset={asset} /></span>
        </span>}
        actions={can.inspect(user.role) && (draft || !lock) ? <Button variant={needsRetest ? 'danger' : 'primary'} size="lg" className="w-full sm:w-auto" icon={<ClipboardCheck className="h-5 w-5" />} onClick={start}>
          {draft ? 'Continue inspection' : needsRetest ? 'Start re-test' : 'Start inspection'}</Button> : undefined} />

      {lock && !draft && (
        <div data-quarter-done className="mb-6 flex flex-wrap items-center gap-3 rounded-[20px] bg-emerald-500/[.09] p-4 ring-1 ring-emerald-500/20 sm:p-5">
          <CircleCheck className="h-7 w-7 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold text-emerald-900">Done for {quarterName(lock.quarter)}</div>
            <div className="text-[15px] text-emerald-900/75">Inspected {formatDate(lock.lastDate)}{lastSigned?.header.technician ? ` by ${lastSigned.header.technician}` : ''}. The {quarterName(lock.opens)} inspection opens on {formatDate(lock.opens.from)}.</div>
          </div>
          {lastSigned && <Button size="sm" icon={<FileText className="h-4 w-4" />} onClick={() => downloadInspectionPack(lastSigned.id).catch((e) => toast(e.message, 'err'))}>Certificate</Button>}
        </div>
      )}

      {missing.length > 0 && (
        <div data-missing-panel className="mb-6 flex flex-col gap-3 rounded-[20px] bg-amber-500/[.1] p-4 ring-1 ring-amber-500/25 sm:flex-row sm:items-center sm:p-5">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <CircleAlert className="mt-0.5 h-7 w-7 shrink-0 text-amber-600 sm:mt-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold text-amber-900">{missing.length} {missing.length === 1 ? 'detail is' : 'details are'} missing</div>
            <div className="text-[15px] text-amber-900/80">Add the {missing.join(', ')} so the certificate is complete. Check the label on the unit.</div>
          </div>
          </div>
          {can.manageSites(user.role) && <Button variant="primary" className="w-full !bg-amber-600 active:!bg-amber-700 sm:w-auto" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Fill in now</Button>}
        </div>
      )}

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
              <Item k="Next inspection" v={lock ? `${quarterName(lock.opens)} · opens ${formatDate(lock.opens.from)}` : `${quarterName(q)} · by ${formatDate(q.to)}`} />
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
            {inspections.length === 0 ? <Empty title="Not inspected yet" icon={<CalendarClock className="h-6 w-6" />}>One inspection a quarter. This unit is due in {quarterName(q)}, by {formatDate(q.to)}.</Empty> : (
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
          {building && <QrCard asset={asset} building={building} onError={(m) => toast(m, 'err')} />}
          {flags.length > 0 && (
            <Card className="p-5">
              <div className="mb-1 font-semibold">Inventory notes</div>
              <div className="mb-3 text-sm text-slate-500">How this unit was read from the inventory sheet.</div>
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

function QrCard({ asset, building, onError }: { asset: Asset; building: Building; onError: (m: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let on = true; qrDataUrl(unitUrl(asset.id), 360).then((u) => on && setSrc(u)); return () => { on = false; }; }, [asset.id]);
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="shrink-0 rounded-xl bg-white p-2 ring-1 ring-black/10">{src ? <img src={src} alt={`QR code for ${asset.assetTag}`} className="h-[104px] w-[104px]" /> : <div className="h-[104px] w-[104px]" />}</div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">QR label</div>
        <div className="mt-1 text-sm text-slate-500">Stick it on the unit. Any phone camera opens this page, ready to inspect.</div>
        <Button size="sm" className="mt-3" icon={<Printer className="h-4 w-4" />} disabled={busy}
          onClick={async () => { setBusy(true); try { await downloadQrLabels([asset], building); } catch (e) { onError((e as Error).message); } finally { setBusy(false); } }}>
          {busy ? 'Preparing…' : 'Label PDF'}
        </Button>
      </div>
    </Card>
  );
}

function Item({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><dt className="text-xs text-slate-500">{k}</dt><dd className={v ? 'mt-0.5 font-medium' : 'mt-0.5 font-medium text-amber-700'}>{v || 'Missing'}</dd></div>;
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
          <input className="input" value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} />
          <Suggestions items={asset.candidateMakes.filter((m) => m !== f.manufacturer)} onPick={(m) => setF({ ...f, manufacturer: m })} />
        </Field>
        <Field label="Model"><input className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
        <Field label="Date of installation / purchase"><DateField clearable max={todayISO()} placeholder="Not recorded" value={f.installDate} onChange={(v) => setF({ ...f, installDate: v })} ariaLabel="Date of installation or purchase" /></Field>
        <Field label="Floor"><Select value={f.floorId} onChange={(v) => setF({ ...f, floorId: v, locationId: '' })} ariaLabel="Floor"
          options={[{ value: '', label: 'Unassigned', text: 'Unassigned' }, ...floors.map((x) => ({ value: x.id, label: x.name, text: x.name }))]} /></Field>
        <Field label="Location"><Select value={f.locationId} disabled={!f.floorId} onChange={(v) => setF({ ...f, locationId: v })} ariaLabel="Location" placeholder={f.floorId ? 'No specific location' : 'Choose a floor first'}
          options={[{ value: '', label: 'No specific location', text: 'No specific location' }, ...locations.filter((l) => l.floorId === f.floorId).map((x) => ({ value: x.id, label: x.name, text: x.name }))]} /></Field>
      </div>
      <p className="mt-4 text-xs text-slate-500">Every change is recorded in the audit trail with your name and the time.</p>
    </Sheet>
  );
}
