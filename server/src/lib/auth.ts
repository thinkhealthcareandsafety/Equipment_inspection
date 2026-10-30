import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@think/shared';
import { config } from '../config.ts';

export interface AuthUser { id: string; name: string; email: string; role: Role; clientId: string | null; teamMemberId: string | null }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

export function signToken(u: AuthUser): string {
  return jwt.sign(u, config.jwtSecret, { expiresIn: config.tokenTtl as jwt.SignOptions['expiresIn'] });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : (req.query.token as string | undefined);
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const p = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { id: p.id, name: p.name, email: p.email, role: p.role, clientId: p.clientId, teamMemberId: p.teamMemberId };
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not permitted for your role' });
  next();
};

export const isStaff = (u: AuthUser) => u.role !== 'client_admin';

/** SQL fragment + params restricting a query to the user's clients. */
export function scope(u: AuthUser, col = 'client_id', offset = 0): { sql: string; params: unknown[] } {
  if (u.role === 'client_admin') return { sql: `${col} = $${offset + 1}`, params: [u.clientId] };
  return { sql: 'true', params: [] };
}
