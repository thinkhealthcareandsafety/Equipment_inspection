/**
 * Offline-first sync engine.
 *  • Every read in the UI comes from IndexedDB, so screens work with no signal.
 *  • Every write goes to IndexedDB and a durable outbox in one transaction.
 *  • When online, the outbox is pushed in order (idempotent op ids), then
 *    changes since the last cursor are pulled.
 */
import { useSyncExternalStore } from 'react';
import { db, getMeta, setMeta, type OutboxOp } from './db.ts';
import { api, ApiError, deviceId, getSession } from './api.ts';
import { uuid, type Inspection } from '@think/shared';

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt: string | null;
  error: string | null;
}

let state: SyncState = { online: navigator.onLine, syncing: false, pending: 0, failed: 0, lastSyncAt: null, error: null };
const listeners = new Set<() => void>();
const emit = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export function useSync(): SyncState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

async function refreshCounts() {
  const [pending, failed] = await Promise.all([
    db.outbox.where('state').equals('pending').count(),
    db.outbox.where('state').equals('failed').count(),
  ]);
  emit({ pending, failed });
}

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      if (!navigator.onLine || !getSession()) break;
      emit({ syncing: true, error: null });
      try {
        await push();
        await pull();
        emit({ lastSyncAt: new Date().toISOString() });
        await setMeta('lastSyncAt', new Date().toISOString());
      } catch (e) {
        emit({ error: e instanceof ApiError ? e.message : 'Connection lost — changes are saved on this device' });
      }
    } while (again);
    emit({ syncing: false });
    await refreshCounts();
  })().finally(() => { running = null; });
  return running;
}

const RETRYABLE_LIMIT = 6;

async function push() {
  let batchLimit = 25;
  for (;;) {
    const ops = await db.outbox.where('state').equals('pending').sortBy('seq');
    if (!ops.length) return;
    // Photos travel one at a time to keep requests small on weak connections.
    const batch: OutboxOp[] = [];
    for (const op of ops) {
      if (op.type === 'photo.put') { if (!batch.length) batch.push(op); break; }
      batch.push(op);
      if (batch.length >= batchLimit) break;
    }
    const payloadOps = await Promise.all(batch.map(async (op) => ({
      opId: op.opId, type: op.type, clientAt: op.clientAt, offline: op.offline,
      payload: op.type === 'photo.put' ? await photoPayload(op.entityId) : op.payload,
    })));
    let res: { results: { opId: string; ok: boolean; code?: string; error?: string; result?: any; current?: any }[] };
    try {
      res = await api('/sync/push', { method: 'POST', json: { deviceId: deviceId(), ops: payloadOps } });
    } catch (e) {
      // 413 = the request was too big for the host. Send items one at a time; a single oversized item is parked, never blocking the rest.
      if (e instanceof ApiError && e.status === 413) {
        if (batch.length > 1) { batchLimit = 1; continue; } // retry one at a time through the normal path
        await db.outbox.update(batch[0].seq!, { state: 'failed', lastError: 'Too large to upload. Remove the photo and add it again.' });
        continue;
      }
      throw e;
    }
    let progressed = false;
    for (const r of res.results) {
      const op = batch.find((o) => o.opId === r.opId)!;
      if (r.ok) {
        progressed = true;
        await db.outbox.delete(op.seq!);
        if (op.type === 'inspection.upsert' && r.result) await acceptServerInspection(r.result as Inspection);
        if (op.type === 'photo.put') await db.photos.update(op.entityId, { synced: true });
        if (op.type === 'asset.update' && r.result) await db.assets.put(r.result);
      } else {
        const permanent = r.code === 'conflict' || r.code === 'forbidden' || op.attempts + 1 >= RETRYABLE_LIMIT;
        await db.outbox.update(op.seq!, { attempts: op.attempts + 1, lastError: r.error, state: permanent ? 'failed' : 'pending' });
        if (r.code === 'conflict' && r.current) await db.inspections.put(r.current);
        if (permanent) progressed = true;
      }
    }
    if (!progressed) return; // wait for the next trigger rather than spin
  }
}

async function photoPayload(id: string) {
  const p = await db.photos.get(id);
  if (!p?.blob) return { id };
  const buf = new Uint8Array(await p.blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { id: p.id, inspectionId: p.inspectionId, checkNo: p.checkNo, mime: p.mime, caption: p.caption, data: btoa(bin) };
}

/** Server copy wins unless the device has queued newer edits for it. */
async function acceptServerInspection(server: Inspection) {
  const queued = await db.outbox.where('entityId').equals(server.id).filter((o) => o.type === 'inspection.upsert' && o.state === 'pending').count();
  if (queued) {
    const local = await db.inspections.get(server.id);
    if (local) await db.inspections.update(server.id, { rev: server.rev, status: local.status });
    return;
  }
  await db.inspections.put(server);
}

interface PullResponse {
  cursor: number; full: boolean;
  hasMore?: boolean;
  clients: any[]; buildings: any[]; floors: any[]; locations: any[]; assets: any[]; inspections: Inspection[];
  photos: any[]; templates: any[]; team: any[]; notifications: any[];
}

async function pull() {
  // Overlap by a few changes: a write that committed just after our last read is picked up next time. Re-applying is harmless.
  const OVERLAP = 30;
  for (let guard = 0; guard < 200; guard++) {
    const cursor = await getMeta<number>('cursor', 0);
    const d = await api<PullResponse>(`/sync/pull?since=${cursor === 0 ? 0 : Math.max(0, cursor - OVERLAP)}`);
    await applyPull(d);
    if (!d.hasMore) return;
  }
}

async function applyPull(d: PullResponse) {
  await db.transaction('rw', [db.clients, db.buildings, db.floors, db.locations, db.assets, db.inspections, db.photos, db.templates, db.team, db.notifications, db.outbox, db.meta], async () => {
    await db.clients.bulkPut(d.clients);
    await db.buildings.bulkPut(d.buildings);
    for (const f of d.floors) f.deleted ? await db.floors.delete(f.id) : await db.floors.put(f);
    for (const l of d.locations) l.deleted ? await db.locations.delete(l.id) : await db.locations.put(l);
    // Assets with queued local edits keep the local copy until the edit is acknowledged.
    const busy = new Set((await db.outbox.where('state').equals('pending').toArray()).map((o) => o.entityId));
    await db.assets.bulkPut(d.assets.filter((a) => !busy.has(a.id)));
    for (const i of d.inspections) if (!busy.has(i.id)) await db.inspections.put(i);
    for (const p of d.photos) { const ex = await db.photos.get(p.id); if (!ex) await db.photos.put({ ...p, synced: true }); }
    await db.templates.bulkPut(d.templates);
    await db.team.bulkPut(d.team);
    for (const n of d.notifications) { const ex = await db.notifications.get(n.id); if (!ex) await db.notifications.put(n); }
    const prev = ((await db.meta.get('cursor'))?.value as number) ?? 0;
    await db.meta.put({ key: 'cursor', value: Math.max(prev, d.cursor) });
  });
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  const kick = () => { emit({ online: navigator.onLine }); if (navigator.onLine) void syncNow(); };
  window.addEventListener('online', kick);
  window.addEventListener('offline', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  setInterval(() => { if (navigator.onLine) void syncNow(); }, 60_000);
  void getMeta<string | null>('lastSyncAt', null).then((v) => emit({ lastSyncAt: v }));
  void refreshCounts();
  kick();
}

export async function enqueue(op: Omit<OutboxOp, 'seq' | 'attempts' | 'state' | 'clientAt' | 'offline' | 'opId'>, coalesce = false) {
  if (coalesce) {
    // Only the latest draft of an inspection needs to travel.
    await db.outbox.where('entityId').equals(op.entityId).filter((o) => o.type === op.type && o.state === 'pending').delete();
  }
  await db.outbox.add({ ...op, opId: uuid(), attempts: 0, state: 'pending',
    clientAt: new Date().toISOString(), offline: !navigator.onLine });
  await refreshCounts();
  if (navigator.onLine) setTimeout(() => void syncNow(), 400);
}

export async function retryFailed() {
  await db.outbox.where('state').equals('failed').modify({ state: 'pending', attempts: 0 });
  await refreshCounts();
  void syncNow();
}

export async function discardFailed() {
  await db.outbox.where('state').equals('failed').delete();
  await setMeta('cursor', 0); // re-pull to restore server truth
  await refreshCounts();
  void syncNow();
}
