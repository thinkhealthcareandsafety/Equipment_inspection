import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, X, Accessibility, BedSingle, Layers, Search } from 'lucide-react';
import {
  dueState, relativeDue, type AssetStatus, type EquipmentType, type InspectionStatus,
} from '@think/shared';

export const cx = (...c: (string | number | false | null | undefined)[]) => c.filter((x) => typeof x === 'string' && x).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white active:bg-brand-700',
  dark: 'bg-ink-950 text-white active:bg-ink-800',
  secondary: 'bg-black/[.06] text-slate-900 hover:bg-black/[.09] active:bg-black/[.12]',
  ghost: 'text-brand-700 hover:bg-brand-50 active:bg-brand-100',
  danger: 'bg-rose-600 text-white active:bg-rose-700',
};

export function Button({ variant = 'secondary', size = 'md', className, icon, children, onClick, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button
      {...p}
      onClick={(e) => { haptic(); onClick?.(e); }}
      className={cx('inline-flex items-center justify-center gap-2 font-semibold transition duration-150 ease-out active:scale-[.97] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-9 rounded-[12px] px-3.5 text-[15px]' : size === 'lg' ? 'h-[52px] rounded-[16px] px-6 text-[17px]' : 'h-11 rounded-[14px] px-5 text-[16px]', VARIANTS[variant], className)}
    >
      {icon}{children}
    </button>
  );
}

/** A light tap on phones that support it (Android). Silent elsewhere. */
export function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch { /* not supported */ } }

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('card', className)}>{children}</div>;
}

type Tone = 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'brand' | 'violet';
const TONES: Record<Tone, string> = {
  slate: 'bg-black/[.06] text-slate-700',
  green: 'bg-emerald-500/[.14] text-emerald-700',
  red: 'bg-rose-500/[.12] text-rose-600',
  amber: 'bg-amber-500/[.16] text-amber-700',
  blue: 'bg-sky-500/[.12] text-sky-700',
  brand: 'bg-brand-500/[.12] text-brand-700',
  violet: 'bg-violet-500/[.12] text-violet-700',
};
export function Badge({ tone = 'slate', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}
    </span>
  );
}

export function DueBadge({ nextDue }: { nextDue: string | null }) {
  const s = dueState(nextDue);
  const tone: Tone = s === 'overdue' ? 'red' : s === 'due_soon' ? 'amber' : s === 'never' ? 'slate' : 'green';
  return <Badge tone={tone} dot>{relativeDue(nextDue)}</Badge>;
}

export const ASSET_STATUS: Record<AssetStatus, { label: string; tone: Tone }> = {
  in_service: { label: 'In service', tone: 'green' },
  out_of_service: { label: 'Out of service', tone: 'red' },
  retest_required: { label: 'Re-test required', tone: 'amber' },
  removed: { label: 'Removed', tone: 'slate' },
};
export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const s = ASSET_STATUS[status];
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export const INSPECTION_STATUS: Record<InspectionStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'slate' },
  submitted: { label: 'Awaiting review', tone: 'blue' },
  returned: { label: 'Returned', tone: 'amber' },
  finalized: { label: 'Finalised', tone: 'green' },
};
export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  const s = INSPECTION_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function EquipmentIcon({ type, className = 'h-5 w-5' }: { type: EquipmentType; className?: string }) {
  const I = type === 'wheelchair' ? Accessibility : type === 'scoop_stretcher' ? Layers : BedSingle;
  return <I className={className} strokeWidth={1.8} />;
}

/** Rounded-square glyph tile, like an app icon in Settings. Colour tells the product apart; red/amber flag a problem. */
export function EquipmentAvatar({ type, tone = 'default' }: { type: EquipmentType; tone?: 'default' | 'red' | 'amber' }) {
  const bg = tone === 'red' ? 'bg-rose-500' : tone === 'amber' ? 'bg-amber-500'
    : type === 'wheelchair' ? 'bg-sky-500' : type === 'scoop_stretcher' ? 'bg-brand-500' : 'bg-violet-500';
  return (
    <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.1)]', bg)}>
      <EquipmentIcon type={type} className="h-[22px] w-[22px]" />
    </div>
  );
}

export function PageHeader({ title, subtitle, back, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; back?: string | true; actions?: ReactNode; eyebrow?: ReactNode }) {
  const nav = useNavigate();
  const backCls = '-ml-1.5 mb-1 inline-flex items-center gap-0.5 rounded-lg px-1 py-1 text-[17px] text-brand-700 active:opacity-60';
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          typeof back === 'string'
            ? <Link to={back} className={backCls}><ChevronLeft className="h-6 w-6" strokeWidth={2.2} />Back</Link>
            : <button onClick={() => nav(-1)} className={backCls}><ChevronLeft className="h-6 w-6" strokeWidth={2.2} />Back</button>
        )}
        {eyebrow && <div className="mb-0.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-slate-500">{eyebrow}</div>}
        <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900 sm:text-[34px]">{title}</h1>
        {subtitle && <div className="mt-1.5 text-[16px] text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'default', icon, onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'red' | 'amber' | 'green'; icon?: ReactNode; onClick?: () => void }) {
  const color = tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cx('card p-4 text-left sm:p-5', onClick && 'transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift active:scale-[.98]')}>
      <div className="flex items-center justify-between text-[13px] font-medium text-slate-500">{label}{icon && <span className="text-slate-400">{icon}</span>}</div>
      <div className={cx('mt-2 text-[30px] font-bold leading-none tracking-[-0.02em] tabular', color)}>{value}</div>
      {hint && <div className="mt-2 text-[13px] text-slate-500">{hint}</div>}
    </Comp>
  );
}

export function Bar({ value, tone }: { value: number; tone?: 'auto' | 'brand' }) {
  const v = Math.max(0, Math.min(100, value));
  const color = tone === 'brand' ? 'bg-brand-500' : v >= 90 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[.07]"><div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', color)} style={{ width: `${v}%` }} /></div>;
}

export function Ring({ value, size = 76, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  const color = v >= 90 ? '#10b981' : v >= 60 ? '#f59e0b' : '#e11d48';
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f3" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-all duration-700" />
      </svg>
      <div className="absolute text-center"><div className="text-lg font-semibold tabular">{Math.round(v)}%</div>{label && <div className="text-[10px] text-slate-500">{label}</div>}</div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-14 w-14 place-items-center rounded-[16px] bg-black/[.05] text-slate-400">{icon}</div>}
      <div className="text-[17px] font-semibold text-slate-900">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[15px] text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-scrim absolute inset-0 bg-black/30 backdrop-blur-[6px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-black/[.18] sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
          <div className="text-[20px] font-bold tracking-[-0.02em]">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/[.06] text-slate-500 transition hover:bg-black/10 active:scale-95" aria-label="Close"><X className="h-4 w-4" strokeWidth={2.5} /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-2">{children}</div>
        {footer && <div className="safe-bottom flex gap-2 border-t-[0.5px] border-black/10 px-5 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** `group` renders a <div role="group"> for button groups so tapping the label never activates the first button. */
export function Field({ label, hint, error, children, required, aside, group }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; required?: boolean; aside?: ReactNode; group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block" {...(group ? { role: 'group' } : {})}>
      <span className="label flex items-center justify-between gap-2"><span>{label}{required && <span className="text-rose-500"> *</span>}</span>{aside}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </Tag>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', disabled }: {
  value: T | null; onChange: (v: T) => void; options: { value: T; label: ReactNode; activeClass?: string; disabled?: boolean }[]; size?: 'md' | 'lg'; disabled?: boolean;
}) {
  return (
    <div className={cx('inline-flex w-full gap-0.5 rounded-[11px] bg-black/[.06] p-[3px]', disabled && 'opacity-60')}>
      {options.map((o) => (
        <button key={o.value} type="button" disabled={disabled || o.disabled} onClick={() => { haptic(); onChange(o.value); }}
          className={cx('flex-1 rounded-[9px] font-semibold transition-all duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40', size === 'lg' ? 'h-[46px] text-[16px]' : 'h-8 text-[14px]',
            value === o.value ? (o.activeClass ?? 'bg-white text-slate-900 shadow-[0_1px_3px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.04)]') : 'text-slate-600 hover:text-slate-900')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** iOS-style search field: grey capsule, no border, clear button. */
export function SearchField({ value, onChange, placeholder, id, className }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" />
      <input id={id} type="search" enterKeyHint="search" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-11 w-full rounded-[12px] bg-black/[.06] pl-10 pr-10 text-[17px] text-slate-900 transition placeholder:text-slate-500 focus:bg-black/[.08] focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-slate-400 text-white active:scale-90"><X className="h-3 w-3" strokeWidth={3} /></button>}
    </div>
  );
}

export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button onClick={onClick} className={cx('inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[15px] font-medium transition duration-150 active:scale-[.96]',
      active ? 'bg-ink-950 text-white' : 'bg-white text-slate-800 shadow-[0_0_0_0.5px_rgb(0_0_0/0.09)] hover:bg-slate-50')}>
      {children}{count != null && <span className={cx('rounded-full px-1.5 text-[13px] tabular', active ? 'bg-white/20' : 'text-slate-500')}>{count}</span>}
    </button>
  );
}

// ---- toasts ----
type ToastT = { id: number; text: string; tone: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<(text: string, tone?: ToastT['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: ToastT['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} role="status" className={cx('animate-pop pointer-events-auto max-w-md rounded-full px-5 py-3 text-[15px] font-medium shadow-lift backdrop-blur-xl',
            t.tone === 'err' ? 'bg-rose-600/95 text-white' : t.tone === 'info' ? 'bg-white/90 text-slate-900' : 'bg-black/80 text-white')}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

