import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileSpreadsheet, ShieldAlert, Upload, UserPlus } from 'lucide-react';
import {
  DATA_FLAG_LABELS, DEFAULT_TEMPLATES, EQUIPMENT_LABELS, formatDateTime, ROLE_LABELS,
  type ChecklistTemplate, type DataFlag, type ImportResult, type Role,
} from '@think/shared';
import { api, getSession } from '../lib/api.ts';
import { db, setMeta } from '../lib/db.ts';
import { syncNow } from '../lib/sync.ts';
import { blankChecklist } from '../lib/pdf.ts';
import { saveFile } from '../lib/files.ts';
import { IS_DEMO } from '../lib/demo.ts';
import { Badge, Button, Card, cx, Empty, Field, PageHeader, Segmented, Sheet, useToast } from '../components/ui.tsx';

type Tab = 'import' | 'audit' | 'templates';

export function Admin() {
  const [tab, setTab] = useState<Tab>('import');
  return (
    <>
      <PageHeader title="Administration" subtitle="Inventory import, audit trail and checklist templates" />
      <div className="mb-5 max-w-xl"><Segmented value={tab} onChange={setTab} options={[
        { value: 'import', label: 'Import' }, { value: 'audit', label: 'Audit trail' }, { value: 'templates', label: 'Templates' },
      ]} /></div>
      {tab === 'import' && <ImportTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'templates' && <TemplatesTab />}
    </>
  );
}

async function upload<T>(path: string, file: File, extra: Record<string, string> = {}): Promise<T> {
  if (IS_DEMO) throw new Error('Importing a spreadsheet needs the full server version. The 331 assets shown here were imported from your FLS sheet.');
  const fd = new FormData(); fd.append('file', file);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const s = getSession();
  const r = await fetch(`/api${path}`, { method: 'POST', body: fd, headers: s ? { Authorization: `Bearer ${s.token}` } : {} });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'Upload failed');
  return j as T;
}

function ImportTab() {
  const toast = useToast();
  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [clientId, setClientId] = useState('');
  const [newClient, setNewClient] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

  const pick = async (f: File) => {
    setFile(f); setPreview(null); setResult(null); setBusy(true);
    try { setPreview(await upload<ImportResult>('/import/preview', f)); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await upload<{ created: number; updated: number }>('/import/commit', file, clientId ? { clientId } : { clientName: newClient });
      setResult(r); toast(`Imported: ${r.created} new, ${r.updated} refreshed`);
      await syncNow();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };

  const flagCounts = new Map<DataFlag, number>();
  preview?.units.forEach((u) => u.dataFlags.forEach((f) => flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1)));
  const typeCounts = new Map<string, number>();
  preview?.units.forEach((u) => typeCounts.set(u.equipmentType, (typeCounts.get(u.equipmentType) ?? 0) + 1));

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><FileSpreadsheet className="h-7 w-7" /></div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Import equipment inventory</div>
            <div className="text-sm text-slate-500">Upload the FLS inventory workbook (.xlsx). Merged cells, split quantities and free-text counts are expanded into one record per unit; nothing is discarded and every gap is flagged. Re-importing the same sheet updates rather than duplicates.</div>
          </div>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-ink-950 px-5 text-sm font-medium text-white hover:bg-ink-800">
            <Upload className="h-4 w-4" />{busy && !preview ? 'Reading…' : 'Choose file'}
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          </label>
        </div>
      </Card>

      {preview && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="p-4"><div className="text-sm text-slate-500">Units produced</div><div className="mt-1 text-2xl font-semibold tabular">{preview.units.length}</div>
              <div className={cx('mt-1 text-xs', preview.declaredTotal === preview.units.length ? 'text-emerald-600' : 'text-amber-600')}>Sheet total: {preview.declaredTotal ?? '—'} {preview.declaredTotal === preview.units.length ? '✓ matches' : ''}</div></Card>
            <Card className="p-4"><div className="text-sm text-slate-500">Sites</div><div className="mt-1 text-2xl font-semibold tabular">{preview.sites.length}</div><div className="mt-1 text-xs text-slate-500">{new Set(preview.sites.map((s) => s.city)).size} cities</div></Card>
            <Card className="p-4"><div className="text-sm text-slate-500">Ages calculated as of</div><div className="mt-1 text-2xl font-semibold">{preview.asOfDate}</div><div className="mt-1 truncate text-xs text-slate-500" title={preview.asOfDerivedFrom ?? ''}>{preview.asOfDerivedFrom ? 'Derived from the sheet' : 'Import date'}</div></Card>
            <Card className="p-4"><div className="text-sm text-slate-500">By type</div><div className="mt-1 space-y-0.5 text-xs">{[...typeCounts].map(([t, n]) => <div key={t} className="flex justify-between"><span>{EQUIPMENT_LABELS[t as keyof typeof EQUIPMENT_LABELS]}</span><b className="tabular">{n}</b></div>)}</div></Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-3 font-semibold">Data gaps flagged (kept, not discarded)</div>
              <ul className="space-y-2 text-sm">{[...flagCounts].sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                <li key={f} className="flex items-center justify-between"><span>{DATA_FLAG_LABELS[f]}</span><Badge tone={f === 'SERIAL_MISSING' || f === 'FLOOR_UNASSIGNED' ? 'slate' : 'amber'}>{n}</Badge></li>
              ))}</ul>
              {preview.issues.length > 0 && <div className="mt-4 space-y-1 text-sm text-amber-700">{preview.issues.map((i, k) => <div key={k}>Row {i.row}: {i.message}</div>)}</div>}
            </Card>
            <Card className="p-5">
              <div className="mb-3 font-semibold">Sites in this file</div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
                  {preview.sites.map((s) => <tr key={s.city + s.site}><td className="py-1.5">{s.site}</td><td className="text-slate-500">{s.city}</td><td className="text-right tabular">{s.count}</td></tr>)}
                </tbody></table>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Import into client">
                <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">New client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              {!clientId ? <Field label="New client name"><input className="input" value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="e.g. JLL" /></Field> : <div />}
              <Button variant="primary" size="lg" disabled={busy || (!clientId && !newClient.trim())} onClick={commit}>{busy ? 'Importing…' : `Import ${preview.units.length} units`}</Button>
            </div>
            {result && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Done — {result.created} new assets created, {result.updated} existing assets refreshed. Floor assignments and inspection history were left untouched.</div>}
          </Card>
        </>
      )}
    </div>
  );
}

interface AuditRow { id: number; at: string; user_name: string; role: string; action: string; entity_type: string; entity_id: string | null; changes: unknown; offline: boolean; device_id: string | null }

function AuditTab() {
  const toast = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState('');
  useEffect(() => { api<AuditRow[]>(`/audit?limit=300${action ? `&action=${action}` : ''}`).then(setRows).catch((e) => toast(e.message, 'err')); }, [action]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {['', 'inspection', 'asset', 'team', 'auth', 'inventory', 'user'].map((a) => <Button key={a} size="sm" variant={action === a ? 'dark' : 'secondary'} onClick={() => setAction(a)}>{a || 'All'}</Button>)}
      </div>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <Empty title="No audit entries" /> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="px-5 py-3">When</th><th className="px-3 py-3">Who</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">Details</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-2.5"><div className="font-medium">{r.user_name}</div><div className="text-xs text-slate-500">{r.role}{r.offline ? ' · captured offline' : ''}</div></td>
                  <td className="px-3 py-2.5"><Badge tone={r.action.includes('status') || r.action.includes('failed') ? 'red' : r.action.includes('final') ? 'green' : 'slate'}>{r.action}</Badge></td>
                  <td className="max-w-md px-3 py-2.5 font-mono text-xs text-slate-600"><div className="line-clamp-3 break-all">{r.changes ? JSON.stringify(r.changes) : r.entity_id}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function TemplatesTab() {
  const stored = useLiveQuery(() => db.templates.toArray(), []) ?? [];
  const known = new Set(Object.keys(DEFAULT_TEMPLATES)); // ignore templates of products that no longer exist
  const templates: ChecklistTemplate[] = stored.length ? stored.filter((t) => known.has(t.id)) : Object.values(DEFAULT_TEMPLATES);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {templates.map((t) => (
        <Card key={`${t.id}-${t.version}`} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div><div className="font-semibold">{t.shortName}</div><div className="text-xs text-slate-500">v{t.version} · next due +{t.intervalDays} days · re-test within {t.retestWithinDays} days</div></div>
            {t.provenance === 'paper-form' ? <Badge tone="green">From client paper form</Badge> : <Badge tone="amber">Drafted — needs client sign-off</Badge>}
          </div>
          <ol className="mt-4 space-y-1.5 text-sm">
            {t.checks.map((c) => (
              <li key={c.no} className="flex gap-2"><span className="w-5 shrink-0 text-right text-slate-400 tabular">{c.no}.</span>
                <span className="flex-1">{c.label}{c.measurement && <span className="text-slate-400"> · {c.measurement.label} ({c.measurement.unit})</span>}{!c.allowNA && <span className="text-slate-400"> · NA not allowed</span>}</span>
                {c.safetyCritical && <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500" />}</li>
            ))}
          </ol>
          <Button size="sm" className="mt-4" icon={<Download className="h-4 w-4" />} onClick={() => saveFile(`${t.shortName.replace(/\s/g, '-')}-blank-checklist.pdf`, blankChecklist(t).output('blob'))}>Blank printable form</Button>
        </Card>
      ))}
      <p className="text-sm text-slate-500 lg:col-span-2">Templates are stored as versioned data. Each inspection records the template version it used, so editing a template never changes past results. Safety-critical items (<ShieldAlert className="inline h-3.5 w-3.5 text-rose-500" />) take an asset out of service on Fail.</p>
    </div>
  );
}

// re-exported for tests / dev tools
export const _resetCursor = () => setMeta('cursor', 0);
