/**
 * Drawn pictures of the three products, used wherever a unit appears. Each sits on its own soft tile so the
 * type reads at a glance (blue wheelchair, red scoop, green foldable), and a red or amber tile with a mark
 * says the unit has a problem. Pure SVG: crisp at any size, works offline, no image downloads.
 */
import type { EquipmentType } from '@think/shared';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const INK = '#23262d';
const STEEL = '#8f9aa6';

function Wheelchair() {
  const spokes = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return <line key={i} x1={24 + Math.cos(a) * 2.6} y1={40 + Math.sin(a) * 2.6} x2={24 + Math.cos(a) * 13} y2={40 + Math.sin(a) * 13} stroke="#c3cad3" strokeWidth=".6" />;
  });
  return (
    <>
      <ellipse cx="33" cy="57.6" rx="22" ry="2" fill="#0b2545" opacity=".13" />
      {/* backrest and push handle */}
      <path d="M16.4 11 L21.8 11.4 L24.6 31 L19.9 31 Z" fill="#2f5aa8" />
      <path d="M16.4 11 L21.8 11.4 L22.2 14 L16.8 13.6 Z" fill="#4f7cc9" />
      <path d="M15.4 10.4 L19.6 31.6 L22 33.2" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.4 10.4 L10.6 10.9" stroke="#15171b" strokeWidth="3.4" strokeLinecap="round" />
      {/* rear wheel */}
      <circle cx="24" cy="40" r="15.4" fill="none" stroke={INK} strokeWidth="3.4" />
      <circle cx="24" cy="40" r="13.5" fill="none" stroke="#b9c1cb" strokeWidth="1" />
      {spokes}
      <circle cx="24" cy="40" r="10.9" fill="none" stroke="#7c8692" strokeWidth="1.3" />
      <circle cx="24" cy="40" r="2.7" fill="#3a3f48" />
      <circle cx="24" cy="40" r="1" fill="#d3d9e0" />
      {/* seat, armrest and front frame */}
      <rect x="20" y="29.4" width="25.4" height="4.8" rx="2.3" fill="#2f5aa8" />
      <rect x="21" y="29.4" width="23.4" height="1.5" rx=".75" fill="#4f7cc9" />
      <path d="M44 33.6 L47.6 47.4" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M25.4 23 L41.4 23" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M40.4 23.4 L42 29.6" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M46.4 47.8 L55.4 47.8" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      {/* front castor */}
      <path d="M46.2 46.6 L48.6 50.6" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="48.8" cy="53.4" r="3.9" fill="#e9edf1" stroke={INK} strokeWidth="2.3" />
      <circle cx="48.8" cy="53.4" r="1" fill={INK} />
    </>
  );
}

function ScoopStretcher() {
  return (
    <>
      <g transform="rotate(-28 32 32)">
        <path d="M9 22 L55 25.5 Q59 25.8 59 29.5 L59 34.5 Q59 38.2 55 38.5 L9 42 Q5 42 5 38 L5 26 Q5 22 9 22 Z" transform="translate(2.4 4.2)" fill="#5a1a10" opacity=".12" />
        {/* frame */}
        <path d="M9 22 L55 25.5 Q59 25.8 59 29.5 L59 34.5 Q59 38.2 55 38.5 L9 42 Q5 42 5 38 L5 26 Q5 22 9 22 Z" fill="#e2452f" />
        <path d="M9 22 L55 25.5 Q59 25.8 59 29.5 L59 30 L5 30 L5 26 Q5 22 9 22 Z" fill="#ee5a43" />
        {/* the two blades */}
        <path d="M10 24.5 L54.4 27.7 Q56.6 27.9 56.6 30 L56.6 34 Q56.6 36.1 54.4 36.3 L10 39.5 Q7.5 39.5 7.5 37 L7.5 27 Q7.5 24.5 10 24.5 Z" fill="#dde3e9" />
        <path d="M10 24.5 L54.4 27.7 Q56.6 27.9 56.6 30 L56.6 31.4 L7.5 31.4 L7.5 27 Q7.5 24.5 10 24.5 Z" fill="#eef2f5" />
        {/* lightening slots */}
        <rect x="12.5" y="26.9" width="11" height="3.2" rx="1.5" fill="#a9b3be" />
        <rect x="27" y="27.6" width="11" height="2.7" rx="1.3" fill="#a9b3be" />
        <rect x="41.5" y="28.4" width="9.5" height="2.2" rx="1.1" fill="#a9b3be" />
        <rect x="12.5" y="33.9" width="11" height="3.2" rx="1.5" fill="#97a2ae" />
        <rect x="27" y="33.7" width="11" height="2.7" rx="1.3" fill="#97a2ae" />
        <rect x="41.5" y="33.4" width="9.5" height="2.2" rx="1.1" fill="#97a2ae" />
        {/* split line and end latches */}
        <path d="M7.5 32 L56.6 32" stroke="#7d8894" strokeWidth="1.1" />
        <rect x="4.2" y="28.6" width="3.6" height="6.8" rx="1.2" fill={INK} />
        <rect x="56" y="29.6" width="3.6" height="4.8" rx="1.2" fill={INK} />
        <circle cx="31.5" cy="23.8" r="1.1" fill="#8e2617" />
        <circle cx="31.5" cy="40.2" r="1.1" fill="#8e2617" />
      </g>
    </>
  );
}

function FoldingStretcher() {
  // Two poles in a three-quarter view: A is the far pole, B the near one.
  const A = (t: number) => [6 + 46 * t, 40 - 21 * t] as const;
  const B = (t: number) => [14 + 46 * t, 49.5 - 21 * t] as const;
  const pole = (P: typeof A, key: string) => (
    <g key={key}>
      <line x1={P(0.06)[0]} y1={P(0.06)[1]} x2={P(0.94)[0]} y2={P(0.94)[1]} stroke={STEEL} strokeWidth="2.6" strokeLinecap="round" />
      <line x1={P(0.06)[0]} y1={P(0.06)[1] - 0.7} x2={P(0.94)[0]} y2={P(0.94)[1] - 0.7} stroke="#d8dde3" strokeWidth=".7" strokeLinecap="round" />
      <line x1={P(0)[0]} y1={P(0)[1]} x2={P(0.09)[0]} y2={P(0.09)[1]} stroke={INK} strokeWidth="3.3" strokeLinecap="round" />
      <line x1={P(0.91)[0]} y1={P(0.91)[1]} x2={P(1)[0]} y2={P(1)[1]} stroke={INK} strokeWidth="3.3" strokeLinecap="round" />
      <circle cx={P(0.5)[0]} cy={P(0.5)[1]} r="1.5" fill={INK} />
    </g>
  );
  const leg = (P: typeof A, t: number, key: string) => (
    <g key={key}>
      <line x1={P(t)[0]} y1={P(t)[1]} x2={P(t)[0]} y2={P(t)[1] + 4.8} stroke="#6f7a86" strokeWidth="1.7" strokeLinecap="round" />
      <ellipse cx={P(t)[0]} cy={P(t)[1] + 5} rx="1.6" ry=".8" fill={INK} />
    </g>
  );
  const quad = (t0: number, t1: number) => `M${A(t0)} L${A(t1)} L${B(t1)} L${B(t0)} Z`;
  return (
    <>
      <path d={quad(0.08, 0.92)} transform="translate(1.8 8)" fill="#0b3b33" opacity=".1" />
      {leg(A, 0.14, 'la1')}{leg(A, 0.86, 'la2')}
      {pole(A, 'a')}
      <path d={quad(0.12, 0.88)} fill="#1f9e89" />
      <path d={quad(0.12, 0.5)} fill="#26ad97" />
      <line x1={A(0.5)[0]} y1={A(0.5)[1]} x2={B(0.5)[0]} y2={B(0.5)[1]} stroke="#0f6f60" strokeWidth="1.2" />
      {[0.1, 0.9].map((t) => <line key={t} x1={A(t)[0]} y1={A(t)[1]} x2={B(t)[0]} y2={B(t)[1]} stroke="#6f7a86" strokeWidth="1.6" strokeLinecap="round" />)}
      {pole(B, 'b')}
      {leg(B, 0.14, 'lb1')}{leg(B, 0.86, 'lb2')}
    </>
  );
}

const TILE: Record<EquipmentType, string> = {
  wheelchair: 'bg-[linear-gradient(160deg,#eef6fe,#dcebfb)]',
  scoop_stretcher: 'bg-[linear-gradient(160deg,#fff4f0,#fde3da)]',
  folding_stretcher: 'bg-[linear-gradient(160deg,#ecf9f5,#d5f1e9)]',
};

/** The product picture on its tile. `size` in px; `tone` red/amber marks a unit that must not be used / needs a re-test. */
export function EquipmentArt({ type, size = 44, tone = 'default', className }: { type: EquipmentType; size?: number; tone?: 'default' | 'red' | 'amber'; className?: string }) {
  const radius = Math.round(size * 0.26);
  return (
    <div className={cx('relative shrink-0', className)} style={{ width: size, height: size }}>
      <div className={cx('h-full w-full overflow-hidden shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.06)]',
        tone === 'red' ? 'bg-[linear-gradient(160deg,#fff1f0,#ffdcd9)]' : tone === 'amber' ? 'bg-[linear-gradient(160deg,#fff8eb,#ffe9c2)]' : TILE[type])}
        style={{ borderRadius: radius }}>
        <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
          {type === 'wheelchair' ? <Wheelchair /> : type === 'scoop_stretcher' ? <ScoopStretcher /> : <FoldingStretcher />}
        </svg>
      </div>
      {tone !== 'default' && (
        <span className={cx('absolute -right-1 -top-1 grid place-items-center rounded-full font-bold text-white ring-2 ring-white',
          tone === 'red' ? 'bg-rose-500' : 'bg-amber-500')}
          style={{ width: Math.min(22, Math.max(14, size * 0.34)), height: Math.min(22, Math.max(14, size * 0.34)), fontSize: Math.min(13, Math.max(9, size * 0.22)) }}>!</span>
      )}
    </div>
  );
}
