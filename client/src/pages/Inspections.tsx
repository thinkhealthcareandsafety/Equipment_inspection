import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardCheck, Search } from 'lucide-react';
import { formatDate, type InspectionStatus } from '@think/shared';
import { db } from '../lib/db.ts';
import { can, useUser } from '../lib/hooks.ts';
import { Card, Chip, Empty, EquipmentAvatar, InspectionStatusBadge, PageHeader, Badge } from '../components/ui.tsx';

export function Inspections() {
  const user = useUser();
  const reviewer = can.review(user.role);
  const [tab, setTab] = useState<InspectionStatus | 'mine'>(reviewer ? 'submitted' : 'mine');
  const [q, setQ] = useState('');
  const all = useLiveQuery(() => db.inspections.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const filter = (s: typeof tab) => all.filter((i) => s === 'mine' ? (i.status === 'draft' || i.status === 'returned') && i.createdBy === user.id : i.status === s);
  const rows = filter(tab).filter((i) => !q || `${i.header.equipmentAssetId} ${i.header.customerSite} ${i.header.technician}`.toLowerCase().includes(q.toLowerCase()));
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'mine', label: 'My open' }, { id: 'submitted', label: 'Awaiting review' }, { id: 'returned', label: 'Returned' }, { id: 'finalized', label: 'Finalised' }, { id: 'draft', label: 'All drafts' },
  ];
  return (
    <>
      <PageHeader title="Inspections" subtitle={reviewer ? 'Review submitted inspections and track work in progress' : 'Your drafts, submissions and history'} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} count={filter(t.id).length}>{t.label}</Chip>)}
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
              <li key={i.id}>
                <Link to={`/inspections/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <EquipmentAvatar type={i.templateId} tone={i.result.defectsIdentified ? 'red' : 'default'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">{i.header.equipmentAssetId}{i.kind === 'retest' && <Badge tone="violet">Re-test</Badge>}</div>
                    <div className="truncate text-sm text-slate-500">{i.header.customerSite} · {i.header.siteLocationDepartment || 'No floor'} · {formatDate(i.header.inspectionDate)} · {i.header.technician || '—'}</div>
                  </div>
                  <div className="hidden text-sm text-slate-500 sm:block tabular">{i.checks.filter((c) => c.status).length}/{i.checks.length}</div>
                  <InspectionStatusBadge status={i.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
