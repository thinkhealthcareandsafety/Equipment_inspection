/**
 * Our own dropdown and calendar, in place of the browser's. They look the same on every phone and computer,
 * open as a soft popover under the field (above it when there is no room), work with a finger, a mouse or
 * the keyboard, and escape any scrolling sheet they sit in.
 */
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { addDays, todayISO } from '@think/shared';
import { cx, haptic } from './ui.tsx';

// ---------- shared popover placement ----------

function usePopover(open: boolean, anchor: React.RefObject<HTMLElement | null>, opts: { width?: number; maxHeight: number }) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const place = useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 6, edge = 8;
    const width = Math.min(opts.width ?? Math.max(r.width, 220), vw - edge * 2);
    const left = Math.min(Math.max(edge, r.left), vw - width - edge);
    const below = vh - r.bottom - gap - edge, above = r.top - gap - edge;
    const down = below >= Math.min(opts.maxHeight, 260) || below >= above;
    const maxHeight = Math.max(160, Math.min(opts.maxHeight, down ? below : above));
    setStyle(down
      ? { position: 'fixed', left, width, top: r.bottom + gap, maxHeight, transformOrigin: 'top' }
      : { position: 'fixed', left, width, bottom: vh - r.top + gap, maxHeight, transformOrigin: 'bottom' });
  }, [anchor, opts.width, opts.maxHeight]);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, place]);
  return style;
}

function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!refs.some((r) => r.current?.contains(e.target as Node))) close(); };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open, close]); // eslint-disable-line react-hooks/exhaustive-deps
}

const PANEL = 'animate-pop z-[70] overflow-hidden rounded-[16px] bg-white shadow-[0_18px_48px_-12px_rgb(0_0_0/0.3),0_0_0_0.5px_rgb(0_0_0/0.08)]';

// ---------- Select ----------

export interface SelectOption<T extends string = string> { value: T; label: ReactNode; hint?: ReactNode; text?: string; disabled?: boolean }

export function Select<T extends string = string>({ value, onChange, options, placeholder = 'Choose…', disabled, error, id, ariaLabel, footer, className }: {
  value: T; onChange: (v: T) => void; options: SelectOption<T>[]; placeholder?: string; disabled?: boolean; error?: boolean; id?: string;
  ariaLabel?: string; footer?: (close: () => void) => ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const style = usePopover(open, btn, { maxHeight: 340 });
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [btn, panel]);
  const sel = options.find((o) => o.value === value);
  const typed = useRef({ s: '', t: 0 });

  const openList = () => {
    if (disabled) return;
    haptic();
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o: SelectOption<T>) => { if (o.disabled) return; haptic(); onChange(o.value); setOpen(false); btn.current?.focus(); };
  useEffect(() => { if (open) panel.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active]);

  const step = (from: number, by: number) => {
    for (let i = 1; i <= options.length; i++) {
      const n = (from + by * i + options.length * 4) % options.length;
      if (!options[n].disabled) return n;
    }
    return from;
  };
  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => step(i, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => step(i, -1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(step(-1, 1)); }
    else if (e.key === 'End') { e.preventDefault(); setActive(step(options.length, -1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) pick(options[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } setOpen(false); }
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : '') + e.key.toLowerCase(), t: now };
      const i = options.findIndex((o) => !o.disabled && (o.text ?? (typeof o.label === 'string' ? o.label : '')).toLowerCase().startsWith(typed.current.s));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button ref={btn} id={id} type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={ariaLabel}
        className={cx('input flex items-center gap-2 text-left', error && 'input-error', open && '!shadow-[inset_0_0_0_1.5px_var(--color-brand-500),0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]', disabled && 'cursor-not-allowed', className)}>
        <span className={cx('min-w-0 flex-1 truncate', !sel && 'text-slate-400')}>{sel ? sel.label : placeholder}</span>
        <ChevronDown className={cx('h-[18px] w-[18px] shrink-0 text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && createPortal(
        <div ref={panel} className={cx(PANEL, 'flex flex-col')} style={style} onKeyDown={onKey}>
          <div id={listId} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            {options.map((o, i) => {
              const on = o.value === value;
              return (
                <div key={o.value || `__${i}`} role="option" aria-selected={on} aria-disabled={o.disabled || undefined} data-i={i}
                  onPointerEnter={() => !o.disabled && setActive(i)} onClick={() => pick(o)}
                  className={cx('flex min-h-[44px] cursor-pointer select-none items-center gap-3 rounded-[10px] px-3 py-2 text-[16px] transition-colors duration-100',
                    o.disabled ? 'cursor-not-allowed opacity-40' : i === active ? 'bg-brand-500/[.1]' : '',
                    on ? 'font-semibold text-brand-700' : 'text-slate-900')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block truncate text-[13px] font-normal text-slate-500">{o.hint}</span>}
                  </span>
                  {on && <Check className="h-[18px] w-[18px] shrink-0 text-brand-600" strokeWidth={2.4} />}
                </div>
              );
            })}
            {options.length === 0 && <div className="px-3 py-4 text-center text-[15px] text-slate-500">Nothing to choose yet</div>}
          </div>
          {footer && <div className="border-t-[0.5px] border-black/10 p-1.5">{footer(close)}</div>}
        </div>, document.body)}
    </>
  );
}

// ---------- DateField ----------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const dow = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).getUTCDay();
/** "Wed, 04 Nov 2026" */
export function longDate(s: string) {
  if (!s) return '';
  return `${WD[dow(s)]}, ${s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1].slice(0, 3)} ${s.slice(0, 4)}`;
}

export function DateField({ value, onChange, min, max, placeholder = 'Pick a date', clearable, error, id, ariaLabel, className, compact }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string; clearable?: boolean; error?: boolean;
  id?: string; ariaLabel?: string; className?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const style = usePopover(open, btn, { width: 320, maxHeight: 420 });
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [btn, panel]);
  const done = (v: string) => { haptic(); onChange(v); setOpen(false); btn.current?.focus(); };
  return (
    <>
      <button ref={btn} id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => { haptic(); setOpen((o) => !o); }}
        className={cx('input flex items-center gap-2.5 text-left', error && 'input-error', compact && '!py-2', open && '!shadow-[inset_0_0_0_1.5px_var(--color-brand-500),0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]', className)}>
        <CalendarDays className="h-[18px] w-[18px] shrink-0 text-brand-600" />
        <span className={cx('min-w-0 flex-1 truncate tabular', !value && 'text-slate-400')}>{value ? longDate(value) : placeholder}</span>
        {clearable && value && (
          <span role="button" tabIndex={-1} aria-label="Clear date" onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/[.06] text-slate-500 hover:bg-black/10"><X className="h-3.5 w-3.5" strokeWidth={2.6} /></span>
        )}
      </button>
      {open && createPortal(
        <div ref={panel} role="dialog" aria-label={ariaLabel ?? 'Choose a date'} className={cx(PANEL, 'overflow-y-auto')} style={style}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); } }}>
          <Calendar value={value} min={min} max={max} onPick={done} onClear={clearable ? () => done('') : undefined} />
        </div>, document.body)}
    </>
  );
}

type View = 'days' | 'months' | 'years';

/** The calendar panel itself (also usable inline). */
export function Calendar({ value, min, max, onPick, onClear }: { value: string; min?: string; max?: string; onPick: (v: string) => void; onClear?: () => void }) {
  const today = todayISO();
  const start = value || (max && today > max ? max : min && today < min ? min : today);
  const [y, setY] = useState(+start.slice(0, 4));
  const [m, setM] = useState(+start.slice(5, 7) - 1);
  const [focus, setFocus] = useState(start);
  const [view, setView] = useState<View>('days');
  const grid = useRef<HTMLDivElement>(null);
  const out = (d: string) => (!!min && d < min) || (!!max && d > max);

  const cells = useMemo(() => {
    const first = iso(y, m, 1);
    const lead = dow(first);
    return Array.from({ length: 42 }, (_, i) => addDays(first, i - lead));
  }, [y, m]);
  const go = (by: number) => { const n = new Date(Date.UTC(y, m + by, 1)); setY(n.getUTCFullYear()); setM(n.getUTCMonth()); };
  const moveFocus = (d: string) => { setFocus(d); setY(+d.slice(0, 4)); setM(+d.slice(5, 7) - 1); };
  useEffect(() => { if (view === 'days') grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true }); }, [focus, view, y, m]);

  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in map) { e.preventDefault(); moveFocus(addDays(focus, map[e.key])); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const n = new Date(Date.UTC(+focus.slice(0, 4), +focus.slice(5, 7) - 1 + (e.key === 'PageUp' ? -1 : 1), 1));
      const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate();
      moveFocus(iso(n.getUTCFullYear(), n.getUTCMonth(), Math.min(+focus.slice(8, 10), last)));
    } else if ((e.key === 'Enter' || e.key === ' ') && !out(focus)) { e.preventDefault(); onPick(focus); }
  };

  const decade = Math.floor(y / 12) * 12;
  const head = view === 'days' ? `${MONTHS[m]} ${y}` : view === 'months' ? String(y) : `${decade} – ${decade + 11}`;
  const prev = () => (view === 'days' ? go(-1) : view === 'months' ? setY(y - 1) : setY(y - 12));
  const next = () => (view === 'days' ? go(1) : view === 'months' ? setY(y + 1) : setY(y + 12));
  const nav = 'grid h-9 w-9 place-items-center rounded-full text-brand-700 transition hover:bg-brand-500/[.1] active:scale-90';

  return (
    <div className="select-none p-3">
      <div className="mb-2 flex items-center gap-1 pl-1">
        <button type="button" onClick={() => setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days')}
          className="flex h-9 items-center gap-1 rounded-[10px] px-2 text-[17px] font-semibold tracking-[-0.01em] text-slate-900 transition hover:bg-black/[.05]" aria-label="Change month or year">
          {head}<ChevronDown className={cx('h-4 w-4 text-brand-600 transition-transform duration-200', view !== 'days' && 'rotate-180')} strokeWidth={2.4} />
        </button>
        <div className="flex-1" />
        <button type="button" onClick={prev} className={nav} aria-label="Previous"><ChevronLeft className="h-5 w-5" strokeWidth={2.4} /></button>
        <button type="button" onClick={next} className={nav} aria-label="Next"><ChevronRight className="h-5 w-5" strokeWidth={2.4} /></button>
      </div>

      {view === 'days' && (
        <div ref={grid} onKeyDown={onKey} role="grid" aria-label={`${MONTHS[m]} ${y}`}>
          <div className="grid grid-cols-7 pb-1">
            {WD.map((d) => <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-400">{d.slice(0, 2)}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((d) => {
              const inMonth = +d.slice(5, 7) - 1 === m;
              const sel = d === value, isToday = d === today, disabled = out(d);
              return (
                <button key={d} type="button" data-day={d} tabIndex={d === focus ? 0 : -1} disabled={disabled} aria-selected={sel} aria-label={longDate(d)}
                  onClick={() => onPick(d)}
                  className={cx('relative mx-auto grid h-10 w-10 place-items-center rounded-full text-[16px] tabular transition duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
                    sel ? 'bg-brand-600 font-semibold text-white shadow-[0_4px_12px_-4px_rgb(13_143_122/0.8)]'
                      : disabled ? 'cursor-not-allowed text-slate-300'
                      : isToday ? 'font-semibold text-rose-600 hover:bg-rose-500/[.08]'
                      : inMonth ? 'text-slate-900 hover:bg-black/[.05] active:bg-black/[.09]' : 'text-slate-400 hover:bg-black/[.04]')}>
                  {+d.slice(8, 10)}
                  {isToday && !sel && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-rose-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === 'months' && (
        <div className="grid grid-cols-3 gap-1.5 py-1">
          {MONTHS.map((name, i) => {
            const on = i === m && y === +start.slice(0, 4);
            const dis = (!!max && iso(y, i, 1) > max) || (!!min && iso(y, i, new Date(Date.UTC(y, i + 1, 0)).getUTCDate()) < min);
            return (
              <button key={name} type="button" disabled={dis} onClick={() => { setM(i); setView('days'); }}
                className={cx('h-12 rounded-[12px] text-[15px] font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30',
                  on ? 'bg-brand-600 text-white' : 'bg-black/[.04] text-slate-800 hover:bg-black/[.07]')}>{name.slice(0, 3)}</button>
            );
          })}
        </div>
      )}

      {view === 'years' && (
        <div className="grid grid-cols-3 gap-1.5 py-1">
          {Array.from({ length: 12 }, (_, i) => decade + i).map((yr) => {
            const dis = (!!max && `${yr}-01-01` > max) || (!!min && `${yr}-12-31` < min);
            return (
              <button key={yr} type="button" disabled={dis} onClick={() => { setY(yr); setView('months'); }}
                className={cx('h-12 rounded-[12px] text-[15px] font-semibold tabular transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30',
                  yr === y ? 'bg-brand-600 text-white' : yr === +today.slice(0, 4) ? 'bg-rose-500/[.08] text-rose-600' : 'bg-black/[.04] text-slate-800 hover:bg-black/[.07]')}>{yr}</button>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t-[0.5px] border-black/10 pt-2">
        {onClear ? <button type="button" onClick={onClear} className="h-9 rounded-[10px] px-3 text-[15px] font-semibold text-slate-500 transition hover:bg-black/[.05]">Clear</button> : <span />}
        <button type="button" disabled={out(today)} onClick={() => onPick(today)}
          className="h-9 rounded-[10px] px-3 text-[15px] font-semibold text-brand-700 transition hover:bg-brand-500/[.1] disabled:opacity-30">Today</button>
      </div>
    </div>
  );
}

/** Tap-to-fill suggestions under a text field (in place of the browser's datalist). */
export function Suggestions({ items, onPick, label }: { items: string[]; onPick: (v: string) => void; label?: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {label && <span className="text-[12px] font-medium text-slate-500">{label}</span>}
      {items.map((s) => (
        <button key={s} type="button" onClick={() => { haptic(); onPick(s); }}
          className="rounded-full bg-brand-500/[.1] px-3 py-1.5 text-[13px] font-medium text-brand-700 transition hover:bg-brand-500/[.16] active:scale-95">{s}</button>
      ))}
    </div>
  );
}
