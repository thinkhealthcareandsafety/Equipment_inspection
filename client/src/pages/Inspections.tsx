import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardCheck, Search, Trash2 } from 'lucide-react';
import { formatDate, isMine, isOpen, REVIEW_REQUIRED, type Inspection, type InspectionStatus } from '@think/shared';
import { db } from '../lib/db.ts';
import { can, useUser } from '../lib/hooks.ts';
import { Card, Chip, Empty, EquipmentAvatar, InspectionStatusBadge, PageHeader, Badge, useToast } from '../components/ui.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { discardInspection } from '../lib/store.ts';

export function Inspections() {
  const user = useUser();
  const reviewer = can.review(user.role);
  const waiting = useLiveQuery(() => db.inspections.where('status').equals('submitted').count(), []) ?? 0;
  const [tab, setTab] = useState<InspectionStatus | 'mine' | null>(null);
  const [q, setQ] = useState('');
  const all = useLiveQuery(() => db.inspections.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const filter = (s: InspectionStatus | 'mine') => all.filter((i) => s === 'mine' ? isOpen(i) && isMine(i, user) : s === 'draft' ? isOpen(i) : i.status === s);
  const toast = useToast();
  const dialogs = useDialogs();
  const discard = async (i: Inspection) => {
    const done = i.checks.filter((c) => c.status).length;
    const ok = await dialogs.confirm(
      `${i.header.equipmentAssetId}${i.header.technician ? ` by ${i.header.technician}` : ''}, ${done} of ${i.checks.length} checks answered. The answers and photos in it will be deleted. This cannot be undone.`,
      { title: 'Discard this unfinished inspection?', confirmLabel: 'Discard', danger: true });
    if (!ok) return;
    try { await discardInspection(i, user); toast(`${i.header.equipmentAssetId} discarded`); }
    catch (e) { toast((e as Error).message, 'err'); }
  };
  const current = tab ?? (reviewer && waiting ? 'submitted' : 'finalized');
  const rows = filter(current).filter((i) => !q || `${i.header.equipmentAssetId} ${i.header.customerSite} ${i.header.technician}`.toLowerCase().includes(q.toLowerCase()));
  // Signing makes an inspection final, so the approval tabs only appear while older ones still wait.
  const tabs: { id: InspectionStatus | 'mine'; label: string }[] = [
    { id: 'finalized', label: 'Done' }, { id: 'mine', label: 'My unfinished' }, { id: 'draft', label: 'Everyone\'s unfinished' },
    ...(waiting || REVIEW_REQUIRED ? [{ id: 'submitted' as const, label: 'Waiting for approval' }] : []),
    ...(filter('returned').length ? [{ id: 'returned' as const, label: 'Returned' }] : []),
  ];
  return (
    <>
      <PageHeader title="Inspections" subtitle="Every inspection done, and any still in progress. Tap one for its certificate." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => <Chip key={t.id} active={current === t.id} onClick={() => setTab(t.id)} count={filter(t.id).length}>{t.label}</Chip>)}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Asset, site or technician" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? <Empty icon={<ClipboardCheck className="h-6 w-6" />} title="Nothing here">Open a site, pick a floor and tap Inspect on any asset.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((i) => (
              <li key={i.id} className="flex items-center">
                <Link to={`/inspections/${i.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <EquipmentAvatar type={i.templateId} tone={i.result.defectsIdentified ? 'red' : 'default'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">{i.header.equipmentAssetId}{i.kind === 'retest' && <Badge tone="violet">Re-test</Badge>}</div>
                    <div className="truncate text-sm text-slate-500">{i.header.customerSite} · {i.header.siteLocationDepartment || 'No floor'} · {formatDate(i.header.inspectionDate)} · {i.header.technician || '—'}</div>
                  </div>
                  <div className="hidden text-sm text-slate-500 sm:block tabular">{i.checks.filter((c) => c.status).length}/{i.checks.length}</div>
                  <InspectionStatusBadge status={i.status} />
                </Link>
                {isOpen(i) && (
                  <button type="button" onClick={() => discard(i)} title="Discard this unfinished inspection" aria-label={`Discard unfinished inspection of ${i.header.equipmentAssetId}`}
                    className="mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 sm:mr-3">
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
