import { useEffect, useState } from 'react';
import { Mail, Pencil, Plus, Trash2, Users } from 'lucide-react';
import type { TeamMember } from '@think/shared';
import { useTeam } from '../lib/hooks.ts';
import { removeTeamMember, saveTeamMember } from '../lib/store.ts';
import { DESIGNATIONS, TeamSheet } from '../components/Inputs.tsx';
import { Select } from '../components/Pickers.tsx';
import { Button, Card, cx, Empty, Field, PageHeader, Sheet, useToast } from '../components/ui.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { Initials } from '../components/Plan.tsx';

const emailOk = (e: string) => !e.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function Team() {
  const team = useTeam();
  const toast = useToast();
  const dialogs = useDialogs();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<TeamMember | null>(null);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Inspection team" subtitle="The people in the inspector pickers. Their email gets the visit plans and calendar invites."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Add inspector / trainer</Button>} />
      <Card className="overflow-hidden">
        {team.length === 0 ? <Empty icon={<Users className="h-6 w-6" />} title="No team members yet" /> : (
          <ul className="divide-y">
            {team.map((m) => (
              <li key={m.id} data-member={m.name} className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
                <Initials name={m.name} size={44} />
                <button type="button" onClick={() => setEdit(m)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[17px] font-semibold">{m.name}</div>
                  <div className="truncate text-[14px] text-slate-500">{[m.designation, m.phone].filter(Boolean).join(' · ')}</div>
                  <div className={cx('mt-0.5 flex items-center gap-1.5 truncate text-[14px]', m.email ? 'text-slate-700' : 'text-amber-700')}>
                    <Mail className="h-3.5 w-3.5 shrink-0" />{m.email || 'No email yet: add one for visit emails'}
                  </div>
                </button>
                <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(m)} aria-label={`Edit ${m.name}`}><span className="hidden sm:inline">Edit</span></Button>
                <Button size="sm" variant="ghost" className="text-rose-600" icon={<Trash2 className="h-4 w-4" />} aria-label={`Delete ${m.name}`} onClick={async () => {
                  if (await dialogs.confirm(`Remove ${m.name} from the team? Past inspections keep their name and signature.`, { title: 'Delete team member', confirmLabel: 'Delete', danger: true })) { await removeTeamMember(m); toast(`${m.name} removed`); }
                }}><span className="hidden sm:inline">Delete</span></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TeamSheet open={open} onClose={() => setOpen(false)} />
      <EditMember member={edit} onClose={() => setEdit(null)} taken={(n) => team.some((x) => x.id !== edit?.id && x.name.toLowerCase() === n.trim().toLowerCase())} />
    </div>
  );
}

function EditMember({ member, onClose, taken }: { member: TeamMember | null; onClose: () => void; taken: (name: string) => boolean }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', designation: 'Inspector', phone: '', email: '' });
  useEffect(() => { if (member) setF({ name: member.name, designation: member.designation, phone: member.phone ?? '', email: member.email ?? '' }); }, [member]);
  const nameErr = !f.name.trim() ? 'A name is needed' : taken(f.name) ? 'Someone on the team already has this name' : undefined;
  const mailErr = emailOk(f.email) ? undefined : 'Check the email address';
  const save = async () => {
    if (!member || nameErr || mailErr) return;
    await saveTeamMember({ ...member, name: f.name.trim(), designation: f.designation, phone: f.phone.trim() || null, email: f.email.trim().toLowerCase() || null });
    toast(`${f.name.trim()} saved`); onClose();
  };
  const designations = DESIGNATIONS.includes(f.designation) ? DESIGNATIONS : [f.designation, ...DESIGNATIONS];
  return (
    <Sheet open={!!member} onClose={onClose} title="Edit team member" footer={<Button variant="primary" className="flex-1" disabled={!!nameErr || !!mailErr} onClick={save}>Save</Button>}>
      <div className="space-y-4">
        <Field label="Name" error={nameErr}><input className={cx('input', nameErr && 'input-error')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Designation"><Select value={f.designation} onChange={(v) => setF({ ...f, designation: v })} ariaLabel="Designation" options={designations.map((d) => ({ value: d, label: d, text: d }))} /></Field>
        <Field label="Email" error={mailErr} hint="Visit plans and calendar invites go here.">
          <input className={cx('input', mailErr && 'input-error')} type="email" inputMode="email" autoComplete="off" placeholder="name@thinkhealth.in" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Phone (optional)"><input className="input" type="tel" inputMode="tel" autoComplete="off" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <p className="text-[13px] text-slate-500">Past inspections keep the name they were signed with.</p>
      </div>
    </Sheet>
  );
}
