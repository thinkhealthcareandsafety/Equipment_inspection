import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import type { Floor } from '@think/shared';
import { upsertFloor } from '../lib/store.ts';
import { Button, Field, Sheet, useToast } from './ui.tsx';

export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** The names for a building with `basements` levels below and `above` levels over the ground floor. */
export function floorNames(basements: number, above: number): { name: string; sortOrder: number }[] {
  const out: { name: string; sortOrder: number }[] = [];
  for (let b = basements; b >= 1; b--) out.push({ name: `Basement ${b}`, sortOrder: -b });
  out.push({ name: 'Ground Floor', sortOrder: 0 });
  for (let i = 1; i <= above; i++) out.push({ name: `${ordinal(i)} Floor`, sortOrder: i });
  return out;
}

/** Adds every floor of a building in one step, skipping any that already exist. */
export function FloorsSheet({ open, onClose, building, floors, onAdded }: {
  open: boolean; onClose: () => void; building: { id: string; clientId: string }; floors: Pick<Floor, 'name'>[]; onAdded?: () => void;
}) {
  const toast = useToast();
  const [above, setAbove] = useState('10');
  const [basements, setBasements] = useState('0');
  const [busy, setBusy] = useState(false);
  const clamp = (v: string, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const wanted = useMemo(() => floorNames(clamp(basements, 6), clamp(above, 80)), [above, basements]);
  const have = new Set(floors.map((f) => f.name.toLowerCase()));
  const fresh = wanted.filter((f) => !have.has(f.name.toLowerCase()));

  return (
    <Sheet open={open} onClose={onClose} title="Add floors" footer={
      <Button variant="primary" className="flex-1" disabled={busy || !fresh.length} icon={<Layers className="h-4 w-4" />} onClick={async () => {
        setBusy(true);
        try {
          for (const f of fresh) await upsertFloor({ buildingId: building.id, clientId: building.clientId, name: f.name, sortOrder: f.sortOrder });
          toast(`${fresh.length} floor${fresh.length > 1 ? 's' : ''} added`); onAdded?.(); onClose();
        } finally { setBusy(false); }
      }}>{fresh.length ? `Add ${fresh.length} floor${fresh.length > 1 ? 's' : ''}` : 'All these floors already exist'}</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Floors above ground" hint="10 gives Ground to 10th Floor"><input id="floors-above" className="input" type="number" inputMode="numeric" min={0} max={80} value={above} onChange={(e) => setAbove(e.target.value)} /></Field>
        <Field label="Basement levels"><input id="floors-basements" className="input" type="number" inputMode="numeric" min={0} max={6} value={basements} onChange={(e) => setBasements(e.target.value)} /></Field>
      </div>
      <div className="mt-4 text-xs text-slate-500">Will add:</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {fresh.slice(0, 14).map((f) => <span key={f.name} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{f.name}</span>)}
        {fresh.length > 14 && <span className="px-1 py-1 text-xs text-slate-500">+ {fresh.length - 14} more</span>}
      </div>
      <p className="mt-4 text-xs text-slate-500">Rename or delete any floor afterwards. Floors that already exist are left alone.</p>
    </Sheet>
  );
}
