/**
 * Planning a quarter: when each site is visited and by whom (visits), and who to call there (site contacts).
 * Both are shared with everyone through the normal offline sync.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarCheck2, Check, MessageCircle, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react';
import {
  addDays, dayLabel, formatDate, quarterName, quarterOf, shiftQuarter, todayISO, uuid, weekday,
  type Building, type SiteContact, type Visit,
} from '@think/shared';
import { useTeam, useUser } from '../lib/hooks.ts';
import { cancelVisit, saveSiteContacts, saveVisit } from '../lib/store.ts';
import { Button, cx, Field, haptic, Sheet, useToast } from './ui.tsx';
import { useDialogs } from './Dialogs.tsx';
import { DateField } from './Pickers.tsx';

// ---------- visits ----------

/** The next planned visit to a site, today or later. */
export function nextVisit(visits: Visit[] | undefined, buildingId: string, today = todayISO()): Visit | undefined {
  return (visits ?? []).filter((v) => v.buildingId === buildingId && v.status === 'planned' && v.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A small calendar leaf: weekday over the day number. */
export function DateTile({ date, tone = 'brand', size = 'md' }: { date: string; tone?: 'brand' | 'slate'; size?: 'md' | 'lg' }) {
  const today = date === todayISO();
  return (
    <div className={cx('grid shrink-0 grid-rows-[auto_1fr] overflow-hidden rounded-[12px] bg-white text-center shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.06)]',
      size === 'lg' ? 'w-[58px]' : 'w-12')}>
      <div className={cx('py-[3px] text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] text-white',
        today ? 'bg-rose-500' : tone === 'brand' ? 'bg-brand-600' : 'bg-slate-400')}>{today ? 'Today' : weekday(date)}</div>
      <div className={cx('flex flex-col items-center justify-center leading-none', size === 'lg' ? 'py-1.5' : 'py-1')}>
        <span className={cx('font-bold tracking-[-0.03em] tabular text-slate-900', size === 'lg' ? 'text-[24px]' : 'text-[19px]')}>{Number(date.slice(8, 10))}</span>
        <span className="mt-0.5 text-[10.5px] font-semibold text-slate-500">{MON[Number(date.slice(5, 7)) - 1]}</span>
      </div>
    </div>
  );
}

/** Plan or change a visit to one site. */
export function ScheduleSheet({ open, onClose, building, visit, left, onSaved }: {
  open: boolean; onClose: () => void; building: Building; visit?: Visit; left: number; onSaved?: (v: Visit | null) => void;
}) {
  const user = useUser();
  const team = useTeam();
  const toast = useToast();
  const dialogs = useDialogs();
  const today = todayISO();
  const q = quarterOf(today);
  const last = shiftQuarter(q, 1).to; // plan up to the end of next quarter
  const [date, setDate] = useState(visit?.date ?? '');
  const [inspector, setInspector] = useState(visit?.inspector ?? '');
  const [note, setNote] = useState(visit?.note ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDate(visit?.date ?? ''); setInspector(visit?.inspector ?? ''); setNote(visit?.note ?? ''); } }, [open, visit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The next three weeks, without Sundays.
  const days = useMemo(() => Array.from({ length: 24 }, (_, i) => addDays(today, i)).filter((d) => weekday(d) !== 'Sun').slice(0, 18), [today]);
  const inNext = date && date > q.to;
  const valid = !!date && date >= today && date <= last;
  const contact = building.contacts?.[0];

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const v = await saveVisit({ id: visit?.id, buildingId: building.id, clientId: building.clientId, date, inspector, note }, user);
      toast(`${building.name}: visit planned for ${dayLabel(date, today)}`);
      onSaved?.(v); onClose();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!visit) return;
    if (!(await dialogs.confirm(`Cancel the visit to ${building.name} on ${formatDate(visit.date)}?`, { title: 'Cancel visit', confirmLabel: 'Cancel visit', danger: true }))) return;
    await cancelVisit(visit); toast('Visit cancelled'); onSaved?.(null); onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={visit ? 'Change visit' : 'Plan a visit'} footer={<>
      {visit && <Button variant="ghost" className="text-rose-600" icon={<Trash2 className="h-4 w-4" />} onClick={cancel}>Cancel visit</Button>}
      <Button variant="primary" className="flex-1" disabled={!valid || busy} icon={<CalendarCheck2 className="h-5 w-5" />} onClick={save}>
        {date ? `Plan for ${dayLabel(date, today)}` : 'Pick a day'}
      </Button>
    </>}>
      <div className="-mt-1 mb-4 text-[15px] text-slate-500">
        <span className="font-semibold text-slate-900">{building.name}</span> · {building.city} · {left === 0 ? `every unit done for ${quarterName(q)}` : `${left} ${left === 1 ? 'unit' : 'units'} to inspect`}
      </div>

      <Field label="Day" group>
        <div className="scrollbar-none -mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1" role="listbox" aria-label="Day of the visit">
          {days.map((d) => {
            const on = d === date;
            return (
              <button key={d} type="button" role="option" aria-selected={on} data-day={d} onClick={() => { haptic(); setDate(d); }}
                className={cx('flex w-[54px] shrink-0 snap-start flex-col items-center rounded-[14px] py-2 transition duration-150 active:scale-95',
                  on ? 'bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgb(13_143_122/0.7)]' : 'bg-black/[.045] text-slate-800 hover:bg-black/[.07]')}>
                <span className={cx('text-[11px] font-semibold uppercase tracking-[0.04em]', on ? 'text-white/85' : d === today ? 'text-rose-600' : 'text-slate-500')}>{d === today ? 'Today' : weekday(d)}</span>
                <span className="mt-0.5 text-[20px] font-bold leading-none tabular">{Number(d.slice(8, 10))}</span>
                <span className={cx('mt-1 text-[11px] font-medium', on ? 'text-white/85' : 'text-slate-500')}>{MON[Number(d.slice(5, 7)) - 1]}</span>
              </button>
            );
          })}
        </div>
      </Field>
      <div className="mt-3 flex items-center gap-3">
        <span className="shrink-0 whitespace-nowrap text-[14px] text-slate-500">Or another day</span>
        <div className="min-w-0 max-w-[260px] flex-1"><DateField compact ariaLabel="Another day" placeholder="Pick from calendar" min={today} max={last} value={days.includes(date) ? '' : date} onChange={(v) => v && setDate(v)} /></div>
      </div>
      {inNext && <p className="mt-2 rounded-[12px] bg-sky-500/[.1] px-3 py-2 text-[14px] text-sky-800">This day is in {quarterName(shiftQuarter(q, 1))}. Its inspections open on {formatDate(shiftQuarter(q, 1).from)}.</p>}

      <div className="mt-5" />
      <Field label="Who is going" group>
        <div className="flex flex-wrap gap-2">
          <PersonChip on={!inspector} onClick={() => setInspector('')}>Decide later</PersonChip>
          {team.map((m) => <PersonChip key={m.id} on={inspector === m.name} onClick={() => setInspector(m.name)}>{m.name}</PersonChip>)}
          {inspector && !team.some((m) => m.name === inspector) && <PersonChip on onClick={() => undefined}>{inspector}</PersonChip>}
        </div>
      </Field>

      <div className="mt-5">
        <Field label="Note for the inspector (optional)">
          <textarea className="input min-h-[72px] resize-y" maxLength={500} placeholder="e.g. Report to the security desk, ask for the facility team" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {contact && (
        <div className="mt-5 flex items-center gap-3 rounded-[16px] bg-black/[.035] p-3">
          <Initials name={contact.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{contact.name}</div>
            <div className="truncate text-[13px] text-slate-500">{[contact.role, contact.phone].filter(Boolean).join(' · ') || 'Site contact'}</div>
          </div>
          <ContactActions contact={contact} />
        </div>
      )}
    </Sheet>
  );
}

function PersonChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={() => { haptic(); onClick(); }} aria-pressed={on}
      className={cx('inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[15px] font-medium transition duration-150 active:scale-[.96]',
        on ? 'bg-ink-950 text-white' : 'bg-white text-slate-800 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)] hover:bg-slate-50')}>
      {on && <Check className="h-4 w-4" />}{children}
    </button>
  );
}

// ---------- contacts ----------

const digits = (p: string) => p.replace(/[^\d+]/g, '');
/** wa.me wants the full international number without "+": Indian 10-digit numbers get 91 in front. */
export function whatsappNumber(p: string): string | null {
  let d = p.replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const t = name.trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';
  return <span className="grid shrink-0 place-items-center rounded-full bg-[linear-gradient(160deg,#5b6b7d,#3d4a59)] font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.36 }}>{t}</span>;
}

/** Round Call and WhatsApp buttons for a contact's phone. */
export function ContactActions({ contact, callOnly }: { contact: SiteContact; callOnly?: boolean }) {
  if (!contact.phone) return null;
  const wa = callOnly ? null : whatsappNumber(contact.phone);
  return (
    <div className="flex shrink-0 gap-2">
      <a href={`tel:${digits(contact.phone)}`} aria-label={`Call ${contact.name}`} title={`Call ${contact.phone}`} onClick={() => haptic()}
        className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_4px_12px_-4px_rgb(48_183_85/0.7)] transition active:scale-90"><Phone className="h-[18px] w-[18px]" /></a>
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${contact.name}`} title="WhatsApp" onClick={() => haptic()}
        className="grid h-10 w-10 place-items-center rounded-full bg-[#25d366]/[.14] text-[#128c4a] transition active:scale-90"><MessageCircle className="h-[18px] w-[18px]" /></a>}
    </div>
  );
}

const ROLES = ['Facility manager', 'Site coordinator', 'Security desk', 'Front office'];
const blank = (): SiteContact => ({ id: uuid(), name: '', phone: '', role: '', email: '' });

/** Add, change or remove the people to call at a site. */
export function ContactsSheet({ open, onClose, building, startNew }: { open: boolean; onClose: () => void; building: Building; startNew?: boolean }) {
  const toast = useToast();
  const dialogs = useDialogs();
  const list = building.contacts ?? [];
  const [edit, setEdit] = useState<SiteContact | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setEdit(startNew || list.length === 0 ? blank() : null); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const phoneOk = !edit?.phone.trim() || edit.phone.replace(/\D/g, '').length >= 8;
  const save = async () => {
    if (!edit || !edit.name.trim() || !phoneOk) return;
    setBusy(true);
    try {
      const exists = list.some((c) => c.id === edit.id);
      await saveSiteContacts(building, exists ? list.map((c) => (c.id === edit.id ? edit : c)) : [...list, edit]);
      toast(`${edit.name.trim()} saved`);
      if (startNew || list.length === 0) onClose(); else setEdit(null);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  const remove = async (c: SiteContact) => {
    if (!(await dialogs.confirm(`Remove ${c.name} from ${building.name}?`, { title: 'Remove contact', confirmLabel: 'Remove', danger: true }))) return;
    await saveSiteContacts(building, list.filter((x) => x.id !== c.id)); toast(`${c.name} removed`); setEdit(null);
  };

  return (
    <Sheet open={open} onClose={onClose} title={edit ? (list.some((c) => c.id === edit.id) ? 'Edit contact' : 'Add site contact') : 'Site contacts'}
      footer={edit ? <>
        {list.length > 0 && !startNew && <Button variant="ghost" onClick={() => setEdit(null)}>Back</Button>}
        <Button variant="primary" className="flex-1" disabled={!edit.name.trim() || !phoneOk || busy} onClick={save}>Save contact</Button>
      </> : <Button variant="primary" className="flex-1" icon={<Plus className="h-5 w-5" />} onClick={() => setEdit(blank())}>Add another person</Button>}>
      <div className="-mt-1 mb-4 text-[15px] text-slate-500">{building.name} · {building.city}</div>
      {edit ? (
        <div className="space-y-4">
          <Field label="Name" required><input autoFocus className="input" autoComplete="off" placeholder="e.g. Ravi Menon" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Phone" error={phoneOk ? undefined : 'Check the number'} hint="Mobile numbers get Call and WhatsApp buttons.">
            <input className={cx('input', !phoneOk && 'input-error')} type="tel" inputMode="tel" autoComplete="off" placeholder="98xxx xxxxx" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
          </Field>
          <Field label="Role" group>
            <div className="mb-2 flex flex-wrap gap-2">
              {ROLES.map((r) => <PersonChip key={r} on={edit.role === r} onClick={() => setEdit({ ...edit, role: edit.role === r ? '' : r })}>{r}</PersonChip>)}
            </div>
            <input className="input" placeholder="Or type a role" value={ROLES.includes(edit.role) ? '' : edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} aria-label="Role" />
          </Field>
          <Field label="Email (optional)"><input className="input" type="email" inputMode="email" autoComplete="off" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
        </div>
      ) : (
        <div className="card divide-y overflow-hidden !shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Initials name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-semibold">{c.name}</div>
                <div className="truncate text-[14px] text-slate-500">{[c.role, c.phone].filter(Boolean).join(' · ') || 'No phone yet'}</div>
              </div>
              <button type="button" onClick={() => setEdit(c)} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-black/[.06]" aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(c)} className="grid h-9 w-9 place-items-center rounded-full text-rose-600 transition hover:bg-rose-500/[.08]" aria-label={`Remove ${c.name}`}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** One line for a contact: name, role, and the call buttons. Empty state invites adding one. */
export function ContactLine({ building, onManage }: { building: Building; onManage: (startNew: boolean) => void }) {
  const list = building.contacts ?? [];
  if (!list.length) {
    return (
      <button type="button" onClick={() => onManage(true)} className="flex w-full items-center gap-3 rounded-[14px] text-left transition active:opacity-70">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-slate-300 text-slate-400"><UserRound className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-brand-700">Add site contact</span>
          <span className="block text-[14px] text-slate-500">Who to call when you arrive</span>
        </span>
      </button>
    );
  }
  const c = list[0];
  return (
    <div className="flex items-center gap-3">
      <Initials name={c.name} />
      <button type="button" onClick={() => onManage(false)} className="min-w-0 flex-1 text-left" title="See or edit contacts">
        <span className="block truncate text-[16px] font-semibold text-slate-900">{c.name}{list.length > 1 && <span className="font-normal text-slate-500"> +{list.length - 1}</span>}</span>
        <span className="block truncate text-[14px] text-slate-500">{c.role || 'Site contact'}</span>
        {c.phone && <span className="block truncate text-[14px] tabular text-slate-500">{c.phone}</span>}
      </button>
      <ContactActions contact={c} />
    </div>
  );
}
