/**
 * Browser-only demo backend, compiled in only when VITE_DEMO=1.
 * It answers the same /api routes as the real server from a snapshot of the
 * seeded database (331 JLL assets, team, paper-sample inspections), so the
 * hosted demo runs with no server. Everything people do is kept in this
 * browser's IndexedDB; the real server enforces the same rules from shared/.
 */
import type { User } from '@think/shared';
import { db } from './db.ts';

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

interface Snapshot {
  pull: Record<string, unknown> & { cursor: number };
  users: (User & { password?: never })[];
  accounts: { email: string; name: string; role: string }[];
}

let snap: Promise<Snapshot> | null = null;
const snapshot = () => (snap ??= import('../demo-snapshot.json').then((m) => m.default as unknown as Snapshot));

const AUDIT_KEY = 'think.demo.audit';
function audit(action: string, entity: string, changes: unknown) {
  try {
    const s = JSON.parse(localStorage.getItem('think.session') ?? 'null');
    const rows = JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]');
    rows.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), user_name: s?.user?.name ?? 'system', role: s?.user?.role ?? '',
      action, entity_type: entity, changes, offline: false });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(rows.slice(0, 500)));
  } catch { /* storage unavailable: audit view stays empty */ }
}

class DemoError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function demoApi<T>(path: string, init: RequestInit & { json?: unknown }): Promise<T> {
  const s = await snapshot();
  const body = (init.json ?? {}) as Record<string, any>;
  const route = path.split('?')[0];
  const q = new URLSearchParams(path.split('?')[1] ?? '');

  switch (route) {
    case '/auth/login': {
      if (String(body.code ?? '') !== '9999') throw new DemoError(401, 'That code is not right');
      const user = { id: '00000000-0000-4000-8000-000000000001', name: 'Team', email: '', role: 'admin', clientId: null, teamMemberId: null };
      audit('auth.unlock', 'device', {});
      return { token: '9999', user } as T;
    }
    case '/auth/me': return JSON.parse(localStorage.getItem('think.session') ?? 'null')?.user as T;
    case '/sync/pull': {
      if (Number(q.get('since') ?? 0) > 0) {
        return { cursor: s.pull.cursor, hasMore: false, full: false, clients: [], buildings: [], floors: [], locations: [], assets: [], inspections: [],
          photos: [], templates: [], team: [], notifications: [] } as T;
      }
      return { ...structuredClone(s.pull), hasMore: false } as T;
    }
    case '/sync/push': {
      const results = [];
      for (const op of (body.ops ?? []) as { opId: string; type: string; payload: any }[]) {
        let result: unknown = { ok: true };
        if (op.type === 'inspection.upsert') {
          const insp = op.payload.inspection;
          result = { ...insp, rev: (insp.rev || 0) + 1 };
          audit(`inspection.${insp.status}`, 'inspection', { asset: insp.header?.equipmentAssetId });
        } else if (op.type === 'asset.update') {
          result = await db.assets.get(op.payload.id);
          audit('asset.update', 'asset', op.payload.patch);
        } else if (op.type === 'team.upsert') {
          audit(op.payload.active === false ? 'team.remove' : 'team.add', 'team_member', { name: op.payload.name, designation: op.payload.designation });
        } else if (op.type !== 'photo.put') {
          audit(op.type, op.type.split('.')[0], { name: op.payload?.name });
        }
        results.push({ opId: op.opId, ok: true, result });
      }
      return { results } as T;
    }
    case '/audit': {
      try { return JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]') as T; } catch { return [] as T; }
    }
  }
  throw new DemoError(501, 'This needs the full server version (inventory import, adding logins). Everything else works here.');
}
