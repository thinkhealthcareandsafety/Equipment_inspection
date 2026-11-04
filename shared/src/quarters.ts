/**
 * Think Healthcare works in Indian financial-year quarters, and every unit is inspected once per quarter:
 *   Q1 Apr–Jun · Q2 Jul–Sep · Q3 Oct–Dec · Q4 Jan–Mar   (FY 2026-27 = 1 Apr 2026 – 31 Mar 2027)
 *
 * A unit inspected in Q3 is "done for Q3". Its next inspection opens on the first day of Q4 and is due by the
 * last day of Q4. When a quarter ends nothing has to be closed by hand: on 1 Jan every unit is simply
 * "to do in Q4" again, and Q3's results become a past quarter.
 */
import { diffDays, formatDate, todayISO } from './dates.ts';
import type { Asset } from './types.ts';

export interface Quarter {
  /** Stable id, e.g. "2026-Q3" (FY start year + quarter). */
  key: string;
  /** Financial year start, e.g. 2026 for FY 2026-27. */
  fy: number;
  n: 1 | 2 | 3 | 4;
  from: string; // first day, YYYY-MM-DD
  to: string; // last day, YYYY-MM-DD
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function build(fy: number, n: 1 | 2 | 3 | 4): Quarter {
  const startMonth = n === 4 ? 1 : 4 + (n - 1) * 3; // calendar month, 1-12
  const year = n === 4 ? fy + 1 : fy;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return { key: `${fy}-Q${n}`, fy, n, from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

export function quarterOf(iso: string = todayISO()): Quarter {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  if (m >= 4) return build(y, (Math.floor((m - 4) / 3) + 1) as 1 | 2 | 3);
  return build(y - 1, 4);
}

export function shiftQuarter(q: Quarter, by: number): Quarter {
  const idx = q.fy * 4 + (q.n - 1) + by;
  return build(Math.floor(idx / 4), ((((idx % 4) + 4) % 4) + 1) as 1 | 2 | 3 | 4);
}

export function quarterFromKey(key: string): Quarter | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key);
  return m ? build(Number(m[1]), Number(m[2]) as 1 | 2 | 3 | 4) : null;
}

/** "Oct–Dec 2026" */
export function quarterMonths(q: Quarter): string {
  const s = Number(q.from.slice(5, 7)), e = Number(q.to.slice(5, 7));
  return `${MON[s - 1]}–${MON[e - 1]} ${q.to.slice(0, 4)}`;
}
/** "FY 2026-27" */
export const fyLabel = (q: Quarter) => `FY ${q.fy}-${pad((q.fy + 1) % 100)}`;
/** "Q3 · Oct–Dec 2026" */
export const quarterLabel = (q: Quarter) => `Q${q.n} · ${quarterMonths(q)}`;
/** "Q3" */
export const quarterName = (q: Quarter) => `Q${q.n}`;

export const inQuarter = (iso: string | null | undefined, q: Quarter) => !!iso && iso.slice(0, 10) >= q.from && iso.slice(0, 10) <= q.to;

/** Days left including today (31 Dec → 1). */
export const daysLeftIn = (q: Quarter, today: string = todayISO()) => Math.max(0, diffDays(q.to, today) + 1);
export const quarterLength = (q: Quarter) => diffDays(q.to, q.from) + 1;
/** Share of the quarter's days already gone, 0..1 (today counts as half gone). */
export function quarterElapsed(q: Quarter, today: string = todayISO()): number {
  if (today < q.from) return 0;
  if (today > q.to) return 1;
  return (diffDays(today, q.from) + 0.5) / quarterLength(q);
}

/** In the last two weeks of a quarter the units still to do are urgent. */
export const CLOSING_DAYS = 14;

/** The certificate's "Next due" date: the last day of the following quarter. */
export function nextQuarterDue(inspectionDate: string): string {
  return shiftQuarter(quarterOf(inspectionDate), 1).to;
}

/** Done for this quarter: the unit's latest signed inspection falls inside it. */
export function doneInQuarter(asset: Pick<Asset, 'lastInspectionDate'>, q: Quarter): boolean {
  return inQuarter(asset.lastInspectionDate, q);
}

export type UnitQuarterState = 'done' | 'todo' | 'closing';

export function unitQuarterState(asset: Pick<Asset, 'lastInspectionDate'>, today: string = todayISO()): UnitQuarterState {
  const q = quarterOf(today);
  if (doneInQuarter(asset, q)) return 'done';
  return daysLeftIn(q, today) <= CLOSING_DAYS ? 'closing' : 'todo';
}

/** Still needs this quarter's inspection (removed units never do). */
export const needsInspection = (asset: Pick<Asset, 'lastInspectionDate' | 'status'>, today: string = todayISO()) =>
  asset.status !== 'removed' && !doneInQuarter(asset, quarterOf(today));

export interface QuarterLock { quarter: Quarter; opens: Quarter; lastDate: string }

/**
 * One inspection per unit per quarter. A unit already inspected this quarter cannot be inspected again until
 * the next quarter opens. The exception is a unit that failed: it must be re-checked after repair, so a
 * re-test is always allowed.
 */
export function quarterLock(asset: Pick<Asset, 'lastInspectionDate' | 'status'>, today: string = todayISO()): QuarterLock | null {
  if (asset.status === 'out_of_service' || asset.status === 'retest_required') return null;
  const q = quarterOf(today);
  if (!doneInQuarter(asset, q)) return null;
  return { quarter: q, opens: shiftQuarter(q, 1), lastDate: asset.lastInspectionDate! };
}

export function lockMessage(tag: string, lock: QuarterLock): string {
  return `${tag} is already done for ${quarterName(lock.quarter)} (inspected ${formatDate(lock.lastDate)}). `
    + `The ${quarterName(lock.opens)} inspection opens on ${formatDate(lock.opens.from)}.`;
}

/** Every quarter from the one containing `firstDate` up to (not including) the current one, newest first. */
export function pastQuarters(firstDate: string | null, today: string = todayISO()): Quarter[] {
  const now = quarterOf(today);
  if (!firstDate) return [];
  const out: Quarter[] = [];
  for (let q = shiftQuarter(now, -1); q.to >= firstDate && out.length < 40; q = shiftQuarter(q, -1)) out.push(q);
  return out;
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
/** "Today", "Tomorrow", "Thu 12 Nov" (adds the year only when it differs from today's). */
export function dayLabel(iso: string, today: string = todayISO()): string {
  const d = diffDays(iso, today);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  const [y, m, day] = iso.split('-').map(Number);
  return `${weekday(iso)} ${day} ${MON[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`;
}
