// Date helpers working on plain 'YYYY-MM-DD' strings so no timezone shifts creep in.

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * 86_400_000);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a) - toUTC(b)) / 86_400_000);
}

export function subtractAge(asOf: string, years: number, months: number, days = 0): string {
  const dt = new Date(toUTC(asOf));
  dt.setUTCFullYear(dt.getUTCFullYear() - years);
  dt.setUTCMonth(dt.getUTCMonth() - months);
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

export function isISODate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toUTC(v));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 30 Oct 2026 – unambiguous for an Indian / international audience. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y) return '—';
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${formatDate(todayISO(dt))}, ${hh}:${mm}`;
}

export type DueState = 'overdue' | 'due_soon' | 'ok' | 'never';

export const DUE_SOON_DAYS = 14;

export function dueState(nextDue: string | null | undefined, today: string = todayISO()): DueState {
  if (!nextDue) return 'never';
  const d = diffDays(nextDue, today);
  if (d < 0) return 'overdue';
  if (d <= DUE_SOON_DAYS) return 'due_soon';
  return 'ok';
}

export function relativeDue(nextDue: string | null | undefined, today: string = todayISO()): string {
  if (!nextDue) return 'Never inspected';
  const d = diffDays(nextDue, today);
  if (d === 0) return 'Due today';
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? '' : 's'}`;
  return `Due in ${d} day${d === 1 ? '' : 's'}`;
}
