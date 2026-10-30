import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@think/shared';
import { config } from '../config.ts';

export interface AuthUser { id: string; name: string; email: string; role: Role; clientId: string | null; teamMemberId: string | null }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

/** Everyone who knows the access code is the same shared account, so a fixed id keeps every UUID column valid. */
export const TEAM_USER_ID = '00000000-0000-4000-8000-000000000001';

const digest = (s: string) => createHash('sha256').update(s).digest();
export const codeMatches = (code: unknown) => typeof code === 'string' && code.length > 0 && timingSafeEqual(digest(code), digest(config.accessCode));

/** The shared account, named after whoever chose their name on this device (for the audit trail and signatures). */
export function teamUser(rawName?: string | string[]): AuthUser {
  let name = '';
  try { name = decodeURIComponent(String(Array.isArray(rawName) ? rawName[0] : rawName ?? '')).trim().slice(0, 80); } catch { /* keep blank */ }
  return { id: TEAM_USER_ID, name: name || 'Team', email: '', role: 'admin', clientId: null, teamMemberId: null };
}

/** The access code travels as the bearer token. No sessions, no tokens to expire. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const code = h?.startsWith('Bearer ') ? h.slice(7) : (req.query.token as string | undefined);
  if (!codeMatches(code)) return res.status(401).json({ error: 'Enter the access code' });
  req.user = teamUser(req.headers['x-user-name']);
  next();
}

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not permitted' });
  next();
};

export const isStaff = (u: AuthUser) => u.role !== 'client_admin';

/** SQL fragment + params restricting a query to the user's clients. */
export function scope(u: AuthUser, col = 'client_id', offset = 0): { sql: string; params: unknown[] } {
  if (u.role === 'client_admin') return { sql: `${col} = $${offset + 1}`, params: [u.clientId] };
  return { sql: 'true', params: [] };
}
