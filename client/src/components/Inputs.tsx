import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Eraser, ImagePlus, Plus, Trash2, UserPlus, X } from 'lucide-react';
import type { TeamMember } from '@think/shared';
import { db } from '../lib/db.ts';
import { getSession } from '../lib/api.ts';
import { compressImage } from '../lib/image.ts';
import { removeTeamMember, saveTeamMember } from '../lib/store.ts';
import { useTeam } from '../lib/hooks.ts';
import { Button, cx, Field, Sheet, useToast } from './ui.tsx';
import { useDialogs } from './Dialogs.tsx';

export const DESIGNATIONS = ['Inspector', 'Senior Inspector', 'Trainer', 'Trainee Inspector', 'Reviewer'];

/** Select a person from the inspection team, with add / remove right where it is used. */
export function PersonPicker({ value, onChange, disabled, error }: { value: string; onChange: (v: string) => void; disabled?: boolean; error?: boolean }) {
  const team = useTeam();
  const [open, setOpen] = useState(false);
  const known = team.some((m) => m.name === value);
  return (
    <>
      <div className="flex gap-2">
        <select className={cx('input flex-1', error && 'input-error')} disabled={disabled} value={value} onChange={(e) => e.target.value === '__manage' ? setOpen(true) : onChange(e.target.value)}>
          <option value="">Select inspector…</option>
          {team.map((m) => <option key={m.id} value={m.name}>{m.name} — {m.designation}</option>)}
          {value && !known && <option value={value}>{value}</option>}
          {!disabled && <option value="__manage">＋ Add or remove people…</option>}
        </select>
        {!disabled && <Button type="button" variant="secondary" className="shrink-0 px-3" title="Add or remove inspectors" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /></Button>}
      </div>
      <TeamSheet open={open} onClose={() => setOpen(false)} onPick={(n) => { onChange(n); setOpen(false); }} />
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
            <select className="input" value={designation} onChange={(e) => setDesignation(e.target.value)}>{DESIGNATIONS.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <Button variant="primary" className="mt-3 w-full" icon={<Plus className="h-4 w-4" />} disabled={!name.trim()} onClick={add}>Add {designation.toLowerCase()}</Button>
        </div>
        <ul className="divide-y divide-slate-100">
          {team.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
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
        <Button type="button" variant="primary" className="flex-1" disabled={empty} onClick={() => onDone(ref.current!.toDataURL('image/png'))}>Apply signature</Button>
      </div>
    </div>
  );
}

/** Thumbnail strip for one check item with a camera button. Works offline: photos live in IndexedDB until synced. */
export function PhotoStrip({ photoIds, onAdd, onRemove, disabled }: { photoIds: string[]; onAdd: (b: Blob) => void; onRemove?: (id: string) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
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
            if (f) onAdd(await compressImage(f));
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
  const photo = useLiveQuery(() => db.photos.get(id), [id]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
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
