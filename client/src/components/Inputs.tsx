import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Check, ChevronRight, Eraser, ImagePlus, Plus, Trash2, UserPlus, X } from 'lucide-react';
import type { TeamMember } from '@think/shared';
import { db } from '../lib/db.ts';
import { getSession } from '../lib/api.ts';
import { compressImage } from '../lib/image.ts';
import { removeTeamMember, saveTeamMember } from '../lib/store.ts';
import { useTeam } from '../lib/hooks.ts';
import { useSync } from '../lib/sync.ts';
import { Button, cx, Field, Sheet, useToast } from './ui.tsx';
import { useDialogs } from './Dialogs.tsx';
import { Select } from './Pickers.tsx';

export const DESIGNATIONS = ['Inspector', 'Senior Inspector', 'Trainer', 'Trainee Inspector', 'Reviewer'];

/** Select a person from the inspection team, with add / remove right where it is used. */
export function PersonPicker({ value, onChange, disabled, error }: { value: string; onChange: (v: string) => void; disabled?: boolean; error?: boolean }) {
  const team = useTeam();
  const [open, setOpen] = useState(false);
  const known = team.some((m) => m.name === value);
  return (
    <>
      <div className="flex gap-2">
        <Select className="flex-1" error={error} disabled={disabled} value={value} onChange={onChange} placeholder="Select inspector…" ariaLabel="Inspector"
          options={[...team.map((m) => ({ value: m.name, label: m.name, hint: m.designation, text: m.name })), ...(value && !known ? [{ value, label: value, text: value }] : [])]}
          footer={disabled ? undefined : (close) => (
            <button type="button" onClick={() => { close(); setOpen(true); }} className="flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-3 text-left text-[16px] font-semibold text-brand-700 transition hover:bg-brand-500/[.08]">
              <UserPlus className="h-[18px] w-[18px]" />Someone else…
            </button>
          )} />
        {!disabled && <Button type="button" variant="secondary" className="shrink-0 px-3" title="Choose or add a person" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /></Button>}
      </div>
      <PickPersonSheet open={open} onClose={() => setOpen(false)} current={value} onPick={(n) => { onChange(n); setOpen(false); }} />
    </>
  );
}

export function TeamSheet({ open, onClose, onPick, title = 'Inspection team' }: { open: boolean; onClose: () => void; onPick?: (name: string) => void; title?: string }) {
  const team = useTeam();
  const toast = useToast();
  const dialogs = useDialogs();
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('Inspector');
  const add = async () => {
    if (!name.trim()) return;
    if (team.some((m) => m.name.toLowerCase() === name.trim().toLowerCase())) { toast(`${name.trim()} is already on the team`, 'err'); return; }
    const m = await saveTeamMember({ name, designation });
    toast(`${m.name} added`); setName('');
    onPick?.(m.name);
  };
  const remove = async (m: TeamMember) => {
    if (!(await dialogs.confirm(`Remove ${m.name} from the team? Past inspections keep their name and signature.`, { title: 'Delete team member', confirmLabel: 'Delete', danger: true }))) return;
    await removeTeamMember(m); toast(`${m.name} removed`);
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold">Add a person</div>
          <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
            <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <Select value={designation} onChange={setDesignation} ariaLabel="Designation" options={DESIGNATIONS.map((d) => ({ value: d, label: d, text: d }))} />
          </div>
          <Button variant="primary" className="mt-3 w-full" icon={<Plus className="h-4 w-4" />} disabled={!name.trim()} onClick={add}>Add {designation.toLowerCase()}</Button>
        </div>
        <ul className="divide-y divide-slate-100">
          {team.map((m) => (
            <li key={m.id} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-black/[.035]">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{m.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</div>
              <button className="flex-1 text-left" onClick={() => onPick?.(m.name)} disabled={!onPick}>
                <div className="font-medium">{m.name}</div><div className="text-xs text-slate-500">{m.designation}</div>
              </button>
              <Button size="sm" variant="ghost" className="text-rose-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => remove(m)}>Delete</Button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

/**
 * "Who is using this device?" / "Who did this inspection?": a list of people to tap.
 * Nothing here deletes anyone (that lives on the Team page), and it waits for the team to download.
 */
/** The list of people to tap, with "Add yourself". Waits for the team to download. Never deletes anyone. */
export function PersonChooser({ onPick, current }: { onPick: (name: string) => void; current?: string }) {
  const team = useTeam();
  const sync = useSync();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setWaitedLong(true), 8000); return () => window.clearTimeout(t); }, []);
  // Still downloading: no names yet and the first sync has not finished (give up waiting after 8 s, e.g. offline).
  const loading = team.length === 0 && !sync.lastSyncAt && !waitedLong;
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const existing = team.find((m) => m.name.toLowerCase() === n.toLowerCase());
    if (existing) { onPick(existing.name); return; }
    const m = await saveTeamMember({ name: n, designation: 'Inspector' });
    toast(`${m.name} added to the team`);
    setName(''); setAdding(false);
    onPick(m.name);
  };
  return (
    <>
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading the team">
          {[0, 1, 2].map((i) => <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl bg-slate-50 p-3"><div className="h-11 w-11 rounded-full bg-slate-200" /><div className="h-4 w-40 rounded bg-slate-200" /></div>)}
          <div className="pt-1 text-center text-[14px] text-slate-500">Loading your team…</div>
        </div>
      ) : (
        <div className="space-y-2">
          {team.map((m) => {
            const me = m.name === current;
            return (
              <button key={m.id} type="button" onClick={() => onPick(m.name)} data-person={m.name}
                className={cx('group flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-inset transition duration-150 active:scale-[.98]',
                  me ? 'bg-brand-500/[.09] ring-brand-500/40' : 'bg-white ring-black/[.08] hover:bg-brand-500/[.05] hover:ring-brand-500/30')}>
                <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-full text-[15px] font-semibold transition-colors',
                  me ? 'bg-brand-600 text-white' : 'bg-brand-500/[.12] text-brand-700 group-hover:bg-brand-600 group-hover:text-white')}>{initialsOf(m.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold tracking-[-0.01em]">{m.name}</span>
                  <span className="block text-[14px] text-slate-500">{m.designation}</span>
                </span>
                {me ? <Check className="h-5 w-5 text-brand-600" /> : <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />}
              </button>
            );
          })}
          {team.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-center text-[15px] text-slate-500">No one is on the team yet. Add yourself below.</div>}
        </div>
      )}
      {!loading && (adding || team.length === 0 ? (
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input id="new-person" className="input flex-1" placeholder="Your full name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" disabled={!name.trim()}>Add</Button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold text-brand-700 transition hover:bg-brand-500/[.06]">
          <Plus className="h-4 w-4" />Not on the list? Add yourself
        </button>
      ))}
    </>
  );
}

/** The same chooser in a sheet: "switch person" from the menu, or the technician field of an inspection. */
export function PickPersonSheet({ open, onClose, onPick, current, title = 'Who are you?' }: {
  open: boolean; onClose: () => void; onPick: (name: string) => void; current?: string; title?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="-mt-1 mb-4 text-[15px] text-slate-500">Your name goes on the inspections and certificates you sign.</p>
      {open && <PersonChooser onPick={onPick} current={current} />}
    </Sheet>
  );
}

/** Re-draws the signature at a fixed small size so each record carries a few KB, not a full-resolution screenshot. */
function exportSignature(src: HTMLCanvasElement): string {
  const w = 360, h = Math.round((src.height / src.width) * w);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return out.toDataURL('image/png');
}

/** Finger / stylus signature capture. Produces a trimmed PNG data URL. */
export function SignaturePad({ onDone, name }: { onDone: (dataUrl: string) => void; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1b2b'; ctx.lineWidth = 2.4;
  }, []);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { ref.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e); const ctx = ref.current!.getContext('2d')!;
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; setEmpty(false);
  };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); };

  return (
    <div>
      <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-white">
        <canvas ref={ref} className="h-44 w-full touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        {empty && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Sign here with your finger or stylus</div>}
        <div className="pointer-events-none absolute bottom-3 left-5 right-5 border-t border-slate-200 pt-1 text-xs text-slate-400">{name}</div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="ghost" icon={<Eraser className="h-4 w-4" />} onClick={clear}>Clear</Button>
        <Button type="button" variant="primary" className="flex-1" disabled={empty} onClick={() => onDone(exportSignature(ref.current!))}>Apply signature</Button>
      </div>
    </div>
  );
}

/** Thumbnail strip for one check item with a camera button. Works offline: photos live in IndexedDB until synced. */
export function PhotoStrip({ photoIds, onAdd, onRemove, disabled }: { photoIds: string[]; onAdd: (b: Blob) => void; onRemove?: (id: string) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [view, setView] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {photoIds.map((id) => <Thumb key={id} id={id} onOpen={setView} onRemove={!disabled ? onRemove : undefined} />)}
      {!disabled && (
        <>
          <button type="button" onClick={() => input.current?.click()} className="grid h-16 w-16 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-brand-500 hover:text-brand-600" title="Add photo">
            {photoIds.length ? <ImagePlus className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          </button>
          <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try { onAdd(await compressImage(f)); } catch (err) { toast((err as Error).message, 'err'); }
          }} />
        </>
      )}
      {view && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-4" onClick={() => setView(null)}>
          <img src={view} className="max-h-full max-w-full rounded-xl" alt="" />
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"><X className="h-5 w-5" /></button>
        </div>
      )}
    </div>
  );
}

function Thumb({ id, onOpen, onRemove }: { id: string; onOpen: (url: string) => void; onRemove?: (id: string) => void }) {
  const url = usePhotoUrl(id);
  return (
    <div className="group relative h-16 w-16 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
      {url && <img src={url} className="h-full w-full cursor-zoom-in object-cover" onClick={() => onOpen(url)} alt="" />}
      {onRemove && <button type="button" onClick={() => onRemove(id)} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"><X className="h-3 w-3" /></button>}
    </div>
  );
}

export function usePhotoUrl(id: string) {
  // undefined = still loading, null = not on this device (so it must come from the server)
  const photo = useLiveQuery(async () => (await db.photos.get(id)) ?? null, [id]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (photo === undefined) return;
    let revoke: string | null = null;
    (async () => {
      let blob = photo?.blob;
      if (!blob && navigator.onLine && import.meta.env.VITE_DEMO !== '1') {
        const s = getSession();
        const r = await fetch(`/api/photos/${id}`, { headers: s ? { Authorization: `Bearer ${s.token}` } : {} }).catch(() => null);
        if (r?.ok) { blob = await r.blob(); if (photo) await db.photos.update(id, { blob }); }
      }
      if (blob) { revoke = URL.createObjectURL(blob); setUrl(revoke); }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [id, photo?.blob]);
  return url;
}

export function TextField({ label, value, onChange, ...p }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return <Field label={label}><input className="input" value={value} onChange={(e) => onChange(e.target.value)} {...p} /></Field>;
}
