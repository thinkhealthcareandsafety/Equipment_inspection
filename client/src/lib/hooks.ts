import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Role, User } from '@think/shared';
import { api, getSession, type Session } from './api.ts';
import { db } from './db.ts';

export function useSession(): Session | null {
  const [s, setS] = useState(getSession);
  useEffect(() => {
    const on = () => setS(getSession());
    window.addEventListener('think-session', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('think-session', on); window.removeEventListener('storage', on); };
  }, []);
  return s;
}

export function useUser(): User {
  const s = useSession();
  if (!s) throw new Error('Not signed in');
  return s.user;
}

export const can = {
  inspect: (r: Role) => r === 'inspector' || r === 'reviewer' || r === 'admin',
  review: (r: Role) => r === 'reviewer' || r === 'admin',
  manageSites: (r: Role) => r !== 'client_admin',
  admin: (r: Role) => r === 'admin',
  team: (r: Role) => r !== 'client_admin',
};

/** Everything the dashboards and reports need, live from IndexedDB. */
export function useAllData() {
  return useLiveQuery(async () => {
    const [clients, buildings, floors, locations, assets, inspections, visits] = await Promise.all([
      db.clients.toArray(), db.buildings.toArray(), db.floors.toArray(), db.locations.toArray(), db.assets.toArray(), db.inspections.toArray(),
      db.visits.toArray(),
    ]);
    return { clients, buildings, floors, locations, assets, inspections, visits };
  }, []);
}

/** What the server can do (for now: whether it can send email). Asked once per page load; null while unknown or offline. */
let infoPromise: Promise<{ mail: boolean } | null> | null = null;
export function useServerInfo() {
  const [info, setInfo] = useState<{ mail: boolean } | null>(null);
  useEffect(() => {
    infoPromise ??= api<{ mail?: boolean }>('/health').then((r) => ({ mail: !!r.mail })).catch(() => { infoPromise = null; return null; });
    let on = true; void infoPromise.then((r) => on && setInfo(r)); return () => { on = false; };
  }, []);
  return info;
}

export function useTeam(includeInactive = false) {
  return useLiveQuery(async () => {
    const all = await db.team.toArray();
    return all.filter((m) => includeInactive || m.active).sort((a, b) => a.name.localeCompare(b.name));
  }, [includeInactive]) ?? [];
}
