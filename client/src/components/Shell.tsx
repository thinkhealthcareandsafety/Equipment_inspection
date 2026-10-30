import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell, Building2, ChartColumn, ChevronRight, ClipboardCheck, Cloud, CloudOff, Ellipsis, LayoutDashboard, LogOut, RefreshCw, Settings, Users,
} from 'lucide-react';
import { formatDateTime } from '@think/shared';
import { db, wipeLocal } from '../lib/db.ts';
import { getSession, setSession } from '../lib/api.ts';
import { TeamSheet } from './Inputs.tsx';
import { can, useUser } from '../lib/hooks.ts';
import { discardFailed, retryFailed, syncNow, useSync } from '../lib/sync.ts';
import { Badge, Button, cx, Sheet } from './ui.tsx';
import { useDialogs } from './Dialogs.tsx';
import { IS_DEMO } from '../lib/demo.ts';

interface NavItem { to: string; label: string; icon: ReactNode; show: boolean; badge?: number }

export function Shell() {
  const user = useUser();
  const sync = useSync();
  const loc = useLocation();
  const [more, setMore] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const dialogs = useDialogs();
  const [whoOpen, setWhoOpen] = useState(false);
  const [whoSkipped, setWhoSkipped] = useState(false);
  const unnamed = user.name === 'Team';
  const reviewCount = useLiveQuery(() => db.inspections.where('status').equals('submitted').count(), []) ?? 0;
  const myDrafts = useLiveQuery(() => db.inspections.filter((i) => (i.status === 'draft' || i.status === 'returned') && i.createdBy === user.id).count(), [user.id]) ?? 0;
  const unread = useLiveQuery(() => db.notifications.filter((n) => !n.read).count(), []) ?? 0;

  // Keep the menu to what people use daily; everything else is one tap away from Home or Reports.
  const nav: NavItem[] = [
    { to: '/', label: 'Home', icon: <LayoutDashboard className="h-5 w-5" />, show: true },
    { to: '/sites', label: 'Sites', icon: <Building2 className="h-5 w-5" />, show: true },
    { to: '/inspections', label: 'Review', icon: <ClipboardCheck className="h-5 w-5" />, show: can.review(user.role), badge: reviewCount },
    { to: '/reports', label: 'Reports', icon: <ChartColumn className="h-5 w-5" />, show: true },
    { to: '/inspections', label: 'My inspections', icon: <ClipboardCheck className="h-5 w-5" />, show: user.role === 'inspector', badge: myDrafts },
    { to: '/team', label: 'Team', icon: <Users className="h-5 w-5" />, show: can.team(user.role) },
    { to: '/admin', label: 'Admin', icon: <Settings className="h-5 w-5" />, show: can.admin(user.role) },
  ].filter((n) => n.show);
  const primary = nav.filter((n) => ['Home', 'Sites', 'Review', 'Reports'].includes(n.label));
  const secondary = nav.filter((n) => !primary.includes(n));

  const chooseName = (name: string) => {
    const s = getSession();
    if (s) setSession({ ...s, user: { ...s.user, name } });
    setWhoOpen(false);
  };
  const signOut = async () => {
    const pending = await db.outbox.count();
    if (IS_DEMO && !(await dialogs.confirm('Locking the demo clears everything you entered in this browser.', { title: 'Lock the app', confirmLabel: 'Lock' }))) return;
    if (!IS_DEMO && pending && !(await dialogs.confirm(`${pending} change(s) have not synced yet and will be lost. Lock anyway?`, { title: 'Lock the app', confirmLabel: 'Lock anyway', danger: true }))) return;
    await wipeLocal();
    setSession(null);
  };

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      {/* Desktop sidebar: frosted, light, tint-coloured selection */}
      <aside className="material fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r-[0.5px] border-black/10 lg:flex">
        <div className="flex items-center gap-3 px-5 pb-5 pt-7">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-10 w-10 rounded-[11px] shadow-card" alt="" />
          <div>
            <div className="text-[17px] font-bold tracking-[-0.02em] text-slate-900">Think Inspect</div>
            <div className="text-[13px] text-slate-500">Healthcare and Safety</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((n) => (
            <div key={n.label}>
              {n.label === 'Team' && <div className="px-3 pb-1.5 pt-5 text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-400">Manage</div>}
              <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => cx('flex items-center gap-3 rounded-[10px] px-3 py-2 text-[16px] transition-colors duration-150',
                isActive ? 'bg-brand-500/[.13] font-semibold text-brand-700' : 'font-medium text-slate-700 hover:bg-black/[.045] active:bg-black/[.08]')}>
                {n.icon}<span className="flex-1">{n.label}</span>
                {!!n.badge && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[12px] font-semibold text-white">{n.badge}</span>}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="space-y-2.5 p-4">
          <SyncPill full onClick={() => setSyncOpen(true)} />
          <div className="flex items-center gap-3 rounded-[16px] bg-black/[.05] p-2.5">
            <button onClick={() => setWhoOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left" title="Change who is using this device">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-[14px] font-semibold text-white">{unnamed ? '?' : initials(user.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-slate-900">{unnamed ? 'Choose your name' : user.name}</div>
                <div className="text-[13px] text-slate-500">{unnamed ? 'For signatures' : 'Tap to switch'}</div>
              </div>
            </button>
            <button onClick={signOut} title="Lock the app" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-black/[.07] active:scale-95"><LogOut className="h-[18px] w-[18px]" /></button>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="material-canvas sticky top-0 z-20 border-b-[0.5px] border-black/10">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2.5 lg:hidden">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-8 w-8 rounded-[9px]" alt="" />
            <span className="text-[17px] font-semibold tracking-[-0.01em]">Think Inspect</span>
          </div>
          <div className="flex-1" />
          {IS_DEMO && <span className="hidden rounded-full bg-amber-500/[.16] px-3 py-1 text-[13px] font-medium text-amber-700 sm:inline">Demo · your entries stay in this browser</span>}
          <div className="lg:hidden"><SyncPill onClick={() => setSyncOpen(true)} /></div>
          <button onClick={() => setNotesOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-full text-slate-600 transition hover:bg-black/[.06] active:scale-95" aria-label="Notifications">
            <Bell className="h-[22px] w-[22px]" />
            {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-canvas">{unread}</span>}
          </button>
        </div>
      </header>

      <main key={loc.pathname} className="animate-rise mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav className="material safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-[0.5px] border-black/10 lg:hidden">
        <div className="mx-auto grid max-w-lg px-2 pt-1.5" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
          {primary.map((n) => (
            <NavLink key={n.label} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 rounded-xl py-1 text-[10.5px] font-medium transition active:scale-95',
              isActive ? 'text-brand-700' : 'text-slate-500')}>
              <span className="[&_svg]:h-[26px] [&_svg]:w-[26px]">{n.icon}</span>{n.label}
              {!!n.badge && <span className="absolute right-[22%] top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{n.badge}</span>}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-1 text-[10.5px] font-medium text-slate-500 transition active:scale-95">
            <Ellipsis className="h-[26px] w-[26px]" />More
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="card divide-y overflow-hidden !bg-slate-100/70 !shadow-none">
          {secondary.map((n) => (
            <NavLink key={n.label} to={n.to} onClick={() => setMore(false)} className="row-press flex items-center gap-3 bg-white px-4 py-3.5 text-[17px] font-medium text-slate-900">
              <span className="text-brand-600">{n.icon}</span><span className="flex-1">{n.label}</span><ChevronRight className="h-5 w-5 text-slate-300" />
            </NavLink>
          ))}
          <button onClick={() => { setMore(false); setWhoOpen(true); }} className="row-press flex w-full items-center gap-3 bg-white px-4 py-3 text-left">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-[14px] font-semibold text-white">{unnamed ? '?' : initials(user.name)}</div>
            <div className="flex-1"><div className="text-[17px] font-medium">{unnamed ? 'Choose your name' : user.name}</div><div className="text-[13px] text-slate-500">Tap to switch person</div></div>
            <ChevronRight className="h-5 w-5 text-slate-300" />
          </button>
        </div>
        <button onClick={signOut} className="row-press mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] bg-black/[.05] py-3.5 text-[17px] font-semibold text-rose-600"><LogOut className="h-5 w-5" />Lock the app</button>
      </Sheet>

      <TeamSheet open={whoOpen || (unnamed && !whoSkipped)} onClose={() => { setWhoOpen(false); setWhoSkipped(true); }} onPick={chooseName} title="Who is using this device?" />
      <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
      <NotificationsSheet open={notesOpen} onClose={() => setNotesOpen(false)} />
    </div>
  );
}

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function SyncPill({ full, onClick }: { full?: boolean; onClick: () => void }) {
  const s = useSync();
  const label = !s.online ? `Offline${s.pending ? ` · ${s.pending} queued` : ''}` : s.syncing ? 'Syncing…' : s.failed ? `${s.failed} need attention` : s.pending ? `${s.pending} to sync` : 'All synced';
  const tone = !s.online ? 'amber' : s.failed ? 'red' : 'green';
  return (
    <button onClick={onClick} className={cx('flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium text-slate-600 transition active:scale-[.97]',
      full ? 'w-full bg-black/[.05] hover:bg-black/[.08]' : 'bg-black/[.05] hover:bg-black/[.08]')}>
      <span className={cx('h-2 w-2 rounded-full', tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500', s.syncing && 'animate-pulse')} />
      {s.online ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSync();
  const dialogs = useDialogs();
  const failed = useLiveQuery(() => db.outbox.where('state').equals('failed').toArray(), []) ?? [];
  return (
    <Sheet open={open} onClose={onClose} title="Offline & sync" footer={<>
      <Button variant="primary" className="flex-1" icon={<RefreshCw className={cx('h-4 w-4', s.syncing && 'animate-spin')} />} disabled={!s.online || s.syncing} onClick={() => syncNow()}>Sync now</Button>
    </>}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-lg font-semibold">{s.online ? 'Online' : 'Offline'}</div><div className="text-xs text-slate-500">Connection</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-lg font-semibold tabular">{s.pending}</div><div className="text-xs text-slate-500">Waiting to send</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-lg font-semibold tabular">{s.failed}</div><div className="text-xs text-slate-500">Need attention</div></div>
        </div>
        <p className="text-slate-600">Everything you do is saved on this device first, including photos and signatures. When a connection is available, changes are sent automatically and the latest data is downloaded.</p>
        <p className="text-slate-500">Last synced: {s.lastSyncAt ? formatDateTime(s.lastSyncAt) : 'never'}</p>
        {s.error && <p className="rounded-xl bg-amber-50 p-3 text-amber-800">{s.error}</p>}
        {failed.length > 0 && (
          <div className="space-y-2">
            <div className="font-medium">Changes the server did not accept</div>
            {failed.map((f) => <div key={f.seq} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800"><div className="font-medium">{f.type}</div><div className="text-xs">{f.lastError}</div></div>)}
            <div className="flex gap-2"><Button size="sm" onClick={retryFailed}>Retry</Button><Button size="sm" variant="ghost" onClick={async () => { if (await dialogs.confirm('Discard these changes and reload from the server?', { confirmLabel: 'Discard', danger: true })) await discardFailed(); }}>Discard &amp; reload</Button></div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const items = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(100).toArray(), []) ?? [];
  const markAll = () => db.notifications.toCollection().modify({ read: true });
  return (
    <Sheet open={open} onClose={onClose} title="Reminders" footer={items.length ? <Button className="flex-1" onClick={markAll}>Mark all as read</Button> : undefined}>
      {items.length === 0 ? <div className="py-10 text-center text-sm text-slate-500">No reminders. Overdue and upcoming inspections appear here each morning.</div> : (
        <div className="-mx-2 divide-y divide-slate-100">
          {items.map((n) => (
            <button key={n.id} onClick={() => { void db.notifications.update(n.id, { read: true }); if (n.assetId) { onClose(); nav(`/assets/${n.assetId}`); } }}
              className="flex w-full gap-3 px-2 py-3 text-left hover:bg-slate-50">
              <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-500')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">{n.title}
                  <Badge tone={n.kind === 'overdue' || n.kind === 'out_of_service' ? 'red' : 'amber'}>{n.kind.replace(/_/g, ' ')}</Badge></div>
                <div className="mt-0.5 text-xs text-slate-500">{n.body}</div>
                <div className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
