import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, setSession, type Session } from '../lib/api.ts';
import { wipeLocal } from '../lib/db.ts';
import { Button, cx } from '../components/ui.tsx';

/** Number of digits in the access code. Change VITE_ACCESS_CODE_LENGTH if the code gets longer. */
const LENGTH = Math.min(8, Math.max(4, Number(import.meta.env.VITE_ACCESS_CODE_LENGTH ?? 4) || 4));

/** One shared access code opens the app, typed into separate boxes like a bank PIN. */
export function Login() {
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join('');

  useEffect(() => { boxes.current[0]?.focus(); }, []);

  const focus = (i: number) => boxes.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  const submit = async (value = code) => {
    if (value.length < LENGTH || busy) return;
    if (!navigator.onLine) { setError('Connect to the internet once to open the app. After that it works offline.'); return; }
    setBusy(true); setError('');
    try {
      const s = await api<Session>('/auth/login', { method: 'POST', json: { code: value } });
      await wipeLocal();
      setSession(s);
    } catch (err) {
      const m = (err as Error).message;
      setError(/code|access|unauthor|401|403/i.test(m) ? 'That code is not right. Try again.' : m);
      setDigits(Array(LENGTH).fill(''));
      setShake(true); setTimeout(() => setShake(false), 450);
      setTimeout(() => focus(0), 30);
    } finally { setBusy(false); }
  };

  /** Puts digits in from box i onwards (typing one digit, or pasting the whole code). */
  const fill = (i: number, raw: string) => {
    const incoming = raw.replace(/\D/g, '');
    if (!incoming) return;
    const next = [...digits];
    let j = i;
    for (const ch of incoming) { if (j >= LENGTH) break; next[j++] = ch; }
    setDigits(next);
    setError('');
    if (next.every(Boolean)) { boxes.current[LENGTH - 1]?.blur(); void submit(next.join('')); }
    else focus(j);
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) { next[i] = ''; setDigits(next); }
      else if (i > 0) { next[i - 1] = ''; setDigits(next); focus(i - 1); }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); focus(i - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focus(i + 1); }
    else if (e.key === 'Enter') { e.preventDefault(); void submit(); }
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-6">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />
      <div className="animate-rise relative w-full max-w-[340px]">
        <div className="flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-[88px] w-[88px] rounded-[22px] shadow-lift" alt="" />
          <h1 className="mt-6 text-[32px] font-bold leading-tight tracking-[-0.03em] text-slate-900">Think Inspect</h1>
          <p className="mt-1 text-[16px] text-slate-500">Think Healthcare and Safety</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-10">
          <div id="access-code-label" className="mb-3 text-center text-[15px] font-medium text-slate-600">Enter the access code</div>
          <div role="group" aria-labelledby="access-code-label" className={cx('flex justify-center gap-3', shake && 'animate-shake')}>
            {digits.map((d, i) => (
              <input key={i} ref={(el) => { boxes.current[i] = el; }}
                id={`pin-${i}`} aria-label={`Digit ${i + 1} of ${LENGTH}`}
                type="text" inputMode="numeric" pattern="[0-9]*" style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties} maxLength={LENGTH} autoComplete={i === 0 ? 'one-time-code' : 'off'}
                value={d} disabled={busy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) { const n = [...digits]; n[i] = ''; setDigits(n); return; }
                  // Typing over a filled box: keep only the newly typed character(s).
                  fill(i, d && v.length > 1 && v.startsWith(d) ? v.slice(1) : v);
                }}
                onKeyDown={(e) => onKey(i, e)}
                onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData('text')); }}
                onFocus={(e) => e.currentTarget.select()}
                className={cx('h-[64px] w-[58px] rounded-[16px] bg-white text-center text-[28px] font-bold text-slate-900 transition duration-150 focus:outline-none disabled:opacity-60',
                  error ? 'pin-error' : d ? 'pin-filled' : 'pin-empty')} />
            ))}
          </div>
          <div className="h-9 pt-3 text-center text-[14px] font-medium text-rose-600" role="alert">{error}</div>
          <Button variant="primary" size="lg" className="w-full" disabled={busy || code.length < LENGTH}>{busy ? 'Opening…' : 'Open'}<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} /></Button>
        </form>
        <p className="mt-8 text-center text-[13px] text-slate-400">Works offline once opened</p>
      </div>
    </div>
  );
}
