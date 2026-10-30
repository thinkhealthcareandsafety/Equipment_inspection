import { useRef, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
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
    <div className="grid min-h-dvh place-items-center bg-ink-950 px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-16 w-16 rounded-2xl" alt="" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Think Inspect</h1>
          <p className="mt-1 text-slate-400">Think Healthcare and Safety</p>
        </div>
        <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-2xl">
          <label htmlFor="access-code" className="label flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />Access code</label>
          <input id="access-code" ref={input} autoFocus className="input h-14 text-center text-2xl tracking-[0.4em]" type="password" inputMode="numeric"
            autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!error} />
          {error && <div className="mt-2 text-center text-sm font-medium text-rose-600">{error}</div>}
          <Button variant="primary" size="lg" className="mt-4 w-full" disabled={busy || !code}>{busy ? 'Opening…' : 'Open'}<ArrowRight className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}
