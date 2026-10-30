import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { useTeam } from '../lib/hooks.ts';
import { removeTeamMember } from '../lib/store.ts';
import { TeamSheet } from '../components/Inputs.tsx';
import { Button, Card, Empty, PageHeader, useToast } from '../components/ui.tsx';
import { useDialogs } from '../components/Dialogs.tsx';

export function Team() {
  const team = useTeam();
  const toast = useToast();
  const dialogs = useDialogs();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Inspection team" subtitle="People who appear in the Technician and Inspection Performed By pickers"
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Add inspector / trainer</Button>} />
      <Card className="overflow-hidden">
        {team.length === 0 ? <Empty icon={<Users className="h-6 w-6" />} title="No team members yet" /> : (
          <ul className="divide-y divide-slate-100">
            {team.map((m) => (
              <li key={m.id} className="flex items-center gap-4 px-5 py-4">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 font-semibold text-brand-700">{m.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</div>
                <div className="flex-1"><div className="font-medium">{m.name}</div><div className="text-sm text-slate-500">{m.designation}{m.email ? ` · ${m.email}` : ''}</div></div>
                <Button size="sm" variant="ghost" className="text-rose-600" icon={<Trash2 className="h-4 w-4" />} onClick={async () => {
                  if (await dialogs.confirm(`Remove ${m.name} from the team? Past inspections keep their name and signature.`, { title: 'Delete team member', confirmLabel: 'Delete', danger: true })) { await removeTeamMember(m); toast(`${m.name} removed`); }
                }}>Delete</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TeamSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
