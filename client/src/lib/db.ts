import Dexie, { type EntityTable } from 'dexie';
import type {
  Asset, Building, ChecklistTemplate, Client, Floor, Inspection, Location, PhotoMeta, TeamMember,
} from '@think/shared';

export interface LocalPhoto extends PhotoMeta {
  blob?: Blob; // present when captured on this device or cached after download
  synced: boolean;
}

export interface OutboxOp {
  seq?: number;
  opId: string;
  type: 'inspection.upsert' | 'photo.put' | 'asset.update' | 'floor.upsert' | 'location.upsert' | 'team.upsert';
  entityId: string;
  payload: unknown;
  clientAt: string;
  offline: boolean;
  attempts: number;
  state: 'pending' | 'failed';
  lastError?: string;
}

export interface Notice { id: string; clientId: string | null; assetId: string | null; kind: string; title: string; body: string; createdAt: string; read?: boolean }

export interface Meta { key: string; value: unknown }

export const db = new Dexie('think-inspect') as Dexie & {
  clients: EntityTable<Client, 'id'>;
  buildings: EntityTable<Building, 'id'>;
  floors: EntityTable<Floor, 'id'>;
  locations: EntityTable<Location, 'id'>;
  assets: EntityTable<Asset, 'id'>;
  inspections: EntityTable<Inspection, 'id'>;
  photos: EntityTable<LocalPhoto, 'id'>;
  templates: EntityTable<ChecklistTemplate & { active?: boolean }, 'id'>;
  team: EntityTable<TeamMember, 'id'>;
  notifications: EntityTable<Notice, 'id'>;
  outbox: EntityTable<OutboxOp, 'seq'>;
  meta: EntityTable<Meta, 'key'>;
};

db.version(1).stores({
  clients: 'id',
  buildings: 'id, clientId, city',
  floors: 'id, buildingId',
  locations: 'id, floorId, buildingId',
  assets: 'id, buildingId, floorId, clientId, status, nextDueDate, equipmentType',
  inspections: 'id, assetId, buildingId, clientId, status, updatedAt',
  photos: 'id, inspectionId',
  templates: 'id',
  team: 'id',
  notifications: 'id, createdAt',
  outbox: '++seq, opId, entityId, type, state',
  meta: 'key',
});

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T) ?? fallback;
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value });

export async function wipeLocal() {
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear(); });
}
