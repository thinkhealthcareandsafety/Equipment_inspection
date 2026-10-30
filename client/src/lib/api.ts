import type { User } from '@think/shared';
import { demoApi, IS_DEMO } from './demo.ts';

const KEY = 'think.session';

export interface Session { token: string; user: User }

export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
export function setSession(s: Session | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('think-session'));
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  if (IS_DEMO) return demoApi<T>(path, init);
  const s = getSession();
  const headers = new Headers(init.headers);
  if (s) {
    headers.set('Authorization', `Bearer ${s.token}`);
    if (s.user.name && s.user.name !== 'Team') headers.set('X-User-Name', encodeURIComponent(s.user.name)); // who is using this device, for the audit trail
  }
  let body = init.body;
  if (init.json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(init.json); }
  const res = await fetch(`/api${path}`, { ...init, headers, body });
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error).catch(() => res.statusText);
    if (res.status === 401 && s) window.dispatchEvent(new Event('think-unauthorized'));
    throw new ApiError(res.status, msg || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function deviceId(): string {
  let id = localStorage.getItem('think.device');
  if (!id) { id = `dev-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('think.device', id); }
  return id;
}
