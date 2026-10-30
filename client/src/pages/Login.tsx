import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, setSession, type Session } from '../lib/api.ts';
import { wipeLocal } from '../lib/db.ts';
import { Button } from '../components/ui.tsx';

/** One shared access code opens the app. */
export function Login() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) { setError('Connect to the internet once to open the app. After that it works offline.'); return; }
    setBusy(true); setError('');
    try {
      const s = await api<Session>('/auth/login', { method: 'POST', json: { code } });
      await wipeLocal();
      setSession(s);
    } catch (err) { setError((err as Error).message); setCode(''); input.current?.focus(); } finally { setBusy(false); }
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
        <form onSubmit={submit} className="mt-10">
          <label htmlFor="access-code" className="sr-only">Access code</label>
          <input id="access-code" ref={input} autoFocus type="password" inputMode="numeric" autoComplete="off" placeholder="Access code"
            className={`input h-[56px] rounded-[16px] text-center text-[22px] tracking-[0.35em] placeholder:text-[17px] placeholder:tracking-normal ${error ? 'input-error' : ''}`}
            value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!error} />
          <div className="h-8 pt-2 text-center text-[14px] font-medium text-rose-600" role="alert">{error}</div>
          <Button variant="primary" size="lg" className="w-full" disabled={busy || !code}>{busy ? 'Opening…' : 'Open'}<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} /></Button>
        </form>
        <p className="mt-8 text-center text-[13px] text-slate-400">Works offline once opened</p>
      </div>
    </div>
  );
}
