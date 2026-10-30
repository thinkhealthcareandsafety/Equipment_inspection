import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, X, Accessibility, BedSingle, Layers } from 'lucide-react';
import {
  dueState, relativeDue, type AssetStatus, type EquipmentType, type InspectionStatus,
} from '@think/shared';

export const cx = (...c: (string | number | false | null | undefined)[]) => c.filter((x) => typeof x === 'string' && x).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-900/10',
  dark: 'bg-ink-950 text-white hover:bg-ink-800 shadow-sm',
  secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
};

export function Button({ variant = 'secondary', size = 'md', className, icon, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button
      {...p}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-9 px-3 text-sm' : size === 'lg' ? 'h-12 px-5 text-[15px]' : 'h-10 px-4 text-sm', VARIANTS[variant], className)}
    >
      {icon}{children}
    </button>
  );
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('card', className)}>{children}</div>;
}

type Tone = 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'brand' | 'violet';
const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export function Badge({ tone = 'slate', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
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

export function EquipmentAvatar({ type, tone = 'default' }: { type: EquipmentType; tone?: 'default' | 'red' | 'amber' }) {
  return (
    <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset',
      tone === 'red' ? 'bg-rose-50 text-rose-600 ring-rose-100' : tone === 'amber' ? 'bg-amber-50 text-amber-700 ring-amber-100' : 'bg-brand-50 text-brand-700 ring-brand-100')}>
      <EquipmentIcon type={type} />
    </div>
  );
}

export function PageHeader({ title, subtitle, back, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; back?: string | true; actions?: ReactNode; eyebrow?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          typeof back === 'string'
            ? <Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ChevronLeft className="h-4 w-4" />Back</Link>
            : <button onClick={() => nav(-1)} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ChevronLeft className="h-4 w-4" />Back</button>
        )}
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-700">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
        {subtitle && <div className="mt-1 text-[15px] text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'default', icon, onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'red' | 'amber' | 'green'; icon?: ReactNode; onClick?: () => void }) {
  const color = tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cx('card p-4 text-left transition sm:p-5', onClick && 'hover:shadow-lift hover:-translate-y-0.5')}>
      <div className="flex items-center justify-between text-[13px] font-medium text-slate-500">{label}{icon && <span className="text-slate-400">{icon}</span>}</div>
      <div className={cx('mt-2 text-[28px] font-semibold leading-none tracking-tight tabular', color)}>{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </Comp>
  );
}

export function Bar({ value, tone }: { value: number; tone?: 'auto' | 'brand' }) {
  const v = Math.max(0, Math.min(100, value));
  const color = tone === 'brand' ? 'bg-brand-500' : v >= 90 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${v}%` }} /></div>;
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
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>}
      <div className="font-medium text-slate-800">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
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
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="text-base font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
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
    <div className={cx('inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1', disabled && 'opacity-60')}>
      {options.map((o) => (
        <button key={o.value} type="button" disabled={disabled || o.disabled} onClick={() => onChange(o.value)}
          className={cx('flex-1 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-40', size === 'lg' ? 'h-12 text-[15px]' : 'h-9 text-sm',
            value === o.value ? (o.activeClass ?? 'bg-white text-slate-900 shadow-sm') : 'text-slate-500 hover:text-slate-800')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button onClick={onClick} className={cx('inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition',
      active ? 'border-ink-950 bg-ink-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')}>
      {children}{count != null && <span className={cx('rounded-full px-1.5 text-xs tabular', active ? 'bg-white/20' : 'bg-slate-100 text-slate-500')}>{count}</span>}
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
          <div key={t.id} className={cx('animate-rise pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-lift',
            t.tone === 'err' ? 'bg-rose-600 text-white' : t.tone === 'info' ? 'bg-white text-slate-800 ring-1 ring-slate-200' : 'bg-ink-950 text-white')}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

