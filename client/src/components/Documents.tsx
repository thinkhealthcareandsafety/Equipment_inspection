/**
 * A site's purchase orders: the PO number, its date, and a photo or PDF of the paper. Shown on the site page next
 * to the site contact; works offline (the file uploads when the phone is back online) and keeps older POs.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Eye, FilePlus2, FileText, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { formatDate, todayISO, type Building, type SiteDocument } from '@think/shared';
import { useUser } from '../lib/hooks.ts';
import { deleteDocument, documentBlob, prepareDocumentFile, saveDocument } from '../lib/store.ts';
import { saveFile } from '../lib/files.ts';
import { Button, cx, Field, Sheet, useToast } from './ui.tsx';
import { DateField } from './Pickers.tsx';
import { useDialogs } from './Dialogs.tsx';

const kb = (n: number | null) => (n == null ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const fileWord = (d: Pick<SiteDocument, 'mime'>) => (!d.mime ? 'no file attached' : d.mime === 'application/pdf' ? 'PDF' : 'photo');

/** Newest purchase order first: by PO date, then by when it was added. */
export function sortDocs(docs: SiteDocument[]) {
  return [...docs].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt.localeCompare(a.createdAt));
}

/** A small preview of the file: the photo itself, a PDF badge, or a plain icon when there is no file. */
export function DocThumb({ doc, size = 48, src }: { doc: Pick<SiteDocument, 'id' | 'mime'> & Partial<SiteDocument>; size?: number; src?: string | null }) {
  const [url, setUrl] = useState<string | null>(src ?? null);
  useEffect(() => {
    if (src !== undefined || !doc.mime?.startsWith('image/')) return;
    let on = true, made: string | null = null;
    documentBlob(doc as SiteDocument).then((b) => { if (on) { made = URL.createObjectURL(b); setUrl(made); } }).catch(() => undefined);
    return () => { on = false; if (made) URL.revokeObjectURL(made); };
  }, [doc.id, doc.mime, src]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = 'grid shrink-0 place-items-center overflow-hidden rounded-[12px] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.1)]';
  if (doc.mime?.startsWith('image/') && url) return <img src={url} alt="" className={cx(box, 'object-cover')} style={{ width: size, height: size }} />;
  if (doc.mime === 'application/pdf') return <span className={cx(box, 'bg-rose-50 text-[11px] font-bold tracking-[0.04em] text-rose-600')} style={{ width: size, height: size }}>PDF</span>;
  return <span className={cx(box, 'bg-slate-100 text-slate-400')} style={{ width: size, height: size }}><FileText className="h-5 w-5" /></span>;
}

/** The box on the site page. */
export function PoCell({ docs, onOpen }: { docs: SiteDocument[]; onOpen: (startNew: boolean) => void }) {
  const [latest, ...older] = sortDocs(docs);
  if (!latest) {
    return (
      <button type="button" data-add-po onClick={() => onOpen(true)} className="flex w-full items-center gap-3 text-left transition active:opacity-70">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] border border-dashed border-brand-300 bg-brand-50 text-brand-600"><FilePlus2 className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-brand-700">Add purchase order</span>
          <span className="block truncate text-[14px] text-slate-500">PO number and a photo or PDF</span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" data-po={latest.number} onClick={() => onOpen(false)} className="flex w-full items-center gap-3 text-left transition active:opacity-70">
      <DocThumb doc={latest} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-slate-900">PO {latest.number}</span>
        <span className="block truncate text-[14px] text-slate-500">
          {latest.date ? formatDate(latest.date) : 'No date'} · {fileWord(latest)}{older.length ? ` · +${older.length} older` : ''}
        </span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold text-brand-700">View</span>
    </button>
  );
}

type Picked = { blob: Blob; name: string; mime: string; url: string };

/** Add, change, view or remove the site's purchase orders. */
export function PurchaseOrderSheet({ open, onClose, building, docs, startNew }: { open: boolean; onClose: () => void; building: Building; docs: SiteDocument[]; startNew?: boolean }) {
  const user = useUser();
  const toast = useToast();
  const dialogs = useDialogs();
  const list = sortDocs(docs);
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [edit, setEdit] = useState<SiteDocument | null>(null);
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<SiteDocument | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const chooser = useRef<HTMLInputElement>(null);

  const clearPicked = () => setPicked((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
  const startForm = (d: SiteDocument | null) => {
    clearPicked(); setEdit(d); setNumber(d?.number ?? ''); setDate(d?.date ?? ''); setNote(d?.note ?? ''); setMode('form');
  };
  useEffect(() => { if (open) { if (startNew || list.length === 0) startForm(null); else setMode('list'); } else clearPicked(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await prepareDocumentFile(f);
      clearPicked();
      setPicked({ ...r, url: URL.createObjectURL(r.blob) });
    } catch (e) { toast((e as Error).message, 'err'); }
  };
  const save = async () => {
    if (!number.trim()) return;
    setBusy(true);
    try {
      await saveDocument({ id: edit?.id, buildingId: building.id, clientId: building.clientId, number, date: date || null, note,
        file: picked ? { blob: picked.blob, name: picked.name, mime: picked.mime } : null }, user);
      toast(`PO ${number.trim()} saved`);
      clearPicked();
      if (startNew || list.length === 0) onClose(); else setMode('list');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  const remove = async (d: SiteDocument) => {
    if (!(await dialogs.confirm(`Remove purchase order ${d.number} from ${building.name}?`, { title: 'Remove purchase order', confirmLabel: 'Remove', danger: true }))) return;
    await deleteDocument(d); toast(`PO ${d.number} removed`);
    if (list.length <= 1) onClose();
  };

  const existingFile = edit && edit.mime && !picked;
  return (
    <>
      <Sheet open={open} onClose={onClose} title={mode === 'form' ? (edit ? 'Edit purchase order' : 'Add purchase order') : 'Purchase orders'}
        footer={mode === 'form' ? <>
          {list.length > 0 && !startNew && <Button variant="ghost" onClick={() => { clearPicked(); setMode('list'); }}>Back</Button>}
          <Button variant="primary" className="flex-1" disabled={!number.trim() || busy} onClick={save}>{busy ? 'Saving…' : 'Save purchase order'}</Button>
        </> : <Button variant="primary" className="flex-1" icon={<Plus className="h-5 w-5" />} onClick={() => startForm(null)}>Add purchase order</Button>}>
        <div className="-mt-1 mb-4 text-[15px] text-slate-500">{building.name} · {building.city}</div>

        {mode === 'form' ? (
          <div className="space-y-4">
            <Field label="PO number" required>
              <input autoFocus className="input tabular" autoComplete="off" autoCapitalize="characters" placeholder="e.g. 4500123456" maxLength={60}
                value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
            <Field label="PO date (optional)" group>
              <DateField clearable max={todayISO()} placeholder="Pick the date on the PO" value={date} onChange={setDate} ariaLabel="PO date" />
            </Field>
            <Field label="Copy of the purchase order" group hint="A clear photo of the paper, or the PDF the client sent. Up to 3 MB.">
              {picked || existingFile ? (
                <div className="flex items-center gap-3 rounded-[16px] bg-black/[.035] p-3">
                  {picked ? <DocThumb doc={{ id: 'new', mime: picked.mime }} src={picked.mime.startsWith('image/') ? picked.url : null} size={56} /> : <DocThumb doc={edit!} size={56} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{picked ? picked.name : edit!.fileName ?? 'Attached file'}</div>
                    <div className="text-[13px] text-slate-500">{picked ? `${picked.mime === 'application/pdf' ? 'PDF' : 'Photo'} · ${kb(picked.blob.size)} · new` : `${fileWord(edit!)} · ${kb(edit!.size)}`}</div>
                  </div>
                  {picked
                    ? <button type="button" onClick={clearPicked} aria-label="Remove this file" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-black/[.06]"><X className="h-4 w-4" /></button>
                    : <Button size="sm" onClick={() => chooser.current?.click()}>Replace</Button>}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => camera.current?.click()} className="flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-brand-300 bg-brand-50/60 text-[15px] font-semibold text-brand-700 transition hover:bg-brand-50 active:scale-[.98]">
                    <Camera className="h-6 w-6" />Take photo
                  </button>
                  <button type="button" onClick={() => chooser.current?.click()} className="flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-slate-300 bg-white text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[.98]">
                    <Upload className="h-6 w-6" />Photo or PDF
                  </button>
                </div>
              )}
              <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
              <input ref={chooser} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            </Field>
            <Field label="Note (optional)">
              <input className="input" maxLength={500} placeholder="e.g. Covers Q3 and Q4 inspections" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="card divide-y overflow-hidden !shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]">
            {list.map((d, i) => (
              <div key={d.id} data-po-row={d.number} className="flex items-center gap-3 px-3 py-3">
                <button type="button" onClick={() => d.mime && setView(d)} className="shrink-0" aria-label={`Open PO ${d.number}`}><DocThumb doc={d} /></button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold">PO {d.number}{i === 0 && list.length > 1 && <span className="ml-2 rounded-full bg-brand-500/[.12] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-brand-700">Latest</span>}</div>
                  <div className="truncate text-[13px] text-slate-500">{d.date ? formatDate(d.date) : 'No date'} · {fileWord(d)}{d.note ? ` · ${d.note}` : ''}</div>
                </div>
                {d.mime && <button type="button" onClick={() => setView(d)} aria-label={`View PO ${d.number}`} className="grid h-9 w-9 place-items-center rounded-full text-brand-700 transition hover:bg-brand-500/[.1]"><Eye className="h-[18px] w-[18px]" /></button>}
                <button type="button" onClick={() => startForm(d)} aria-label={`Edit PO ${d.number}`} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-black/[.06]"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(d)} aria-label={`Remove PO ${d.number}`} className="grid h-9 w-9 place-items-center rounded-full text-rose-600 transition hover:bg-rose-500/[.08]"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Sheet>
      <DocViewer doc={view} onClose={() => setView(null)} />
    </>
  );
}

/** Opens the PO: photos full size, PDFs in the phone's viewer; both can be saved. */
export function DocViewer({ doc, onClose }: { doc: SiteDocument | null; onClose: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ url: string; blob: Blob } | 'loading' | 'error'>('loading');
  useEffect(() => {
    if (!doc) return;
    let on = true, made: string | null = null;
    setState('loading');
    documentBlob(doc).then((b) => { if (on) { made = URL.createObjectURL(b); setState({ url: made, blob: b }); } })
      .catch((e) => { if (on) { setState('error'); toast((e as Error).message, 'err'); } });
    return () => { on = false; if (made) URL.revokeObjectURL(made); };
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const file = typeof state === 'object' ? state : null;
  const name = doc?.fileName ?? `PO-${doc?.number ?? ''}${doc?.mime === 'application/pdf' ? '.pdf' : '.jpg'}`;
  return (
    <Sheet open={!!doc} onClose={onClose} wide title={doc ? `PO ${doc.number}` : ''} footer={file ? <>
      {doc?.mime === 'application/pdf' && <Button className="flex-1" icon={<Eye className="h-4 w-4" />} onClick={() => window.open(file.url, '_blank', 'noopener')}>Open PDF</Button>}
      <Button variant="primary" className="flex-1" onClick={() => saveFile(name, file.blob).catch((e) => toast((e as Error).message, 'err'))}>Save a copy</Button>
    </> : undefined}>
      {doc && <div className="-mt-1 mb-3 text-[14px] text-slate-500">{doc.date ? `Dated ${formatDate(doc.date)}` : 'No date'} · added by {doc.createdByName || 'someone'}{doc.note ? ` · ${doc.note}` : ''}</div>}
      {state === 'loading' && <div className="h-[50dvh] animate-pulse rounded-[16px] bg-slate-100" />}
      {state === 'error' && <div className="rounded-[16px] bg-slate-50 p-6 text-center text-[15px] text-slate-500">The file could not be opened right now.</div>}
      {file && doc?.mime?.startsWith('image/') && <img src={file.url} alt={`Purchase order ${doc.number}`} className="max-h-[68dvh] w-full rounded-[16px] bg-slate-100 object-contain" />}
      {file && doc?.mime === 'application/pdf' && (
        <div className="flex flex-col items-center gap-3 rounded-[16px] bg-slate-50 p-8 text-center">
          <DocThumb doc={doc} size={72} />
          <div className="text-[16px] font-semibold">{name}</div>
          <div className="text-[14px] text-slate-500">{kb(doc.size)} · tap Open PDF to read it</div>
        </div>
      )}
    </Sheet>
  );
}
