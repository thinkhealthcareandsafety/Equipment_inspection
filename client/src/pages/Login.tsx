import { useEffect, useState } from 'react';
import { ArrowRight, CloudOff, FileText, ShieldCheck, WifiOff } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@think/shared';
import { api, setSession, type Session } from '../lib/api.ts';
import { wipeLocal } from '../lib/db.ts';
import { Button, Field } from '../components/ui.tsx';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<{ email: string; name: string; role: Role }[]>([]);

  useEffect(() => { api<typeof demo>('/auth/demo-accounts').then(setDemo).catch(() => {}); }, []);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    if (!navigator.onLine) { setError('Signing in needs a connection once. After that the app works offline.'); return; }
    setBusy(true); setError('');
    try {
      const s = await api<Session>('/auth/login', { method: 'POST', json: creds ?? { email, password } });
      await wipeLocal();
      setSession(s);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-48 -left-24 h-[420px] w-[420px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-10 w-10 rounded-xl" alt="" />
          <div><div className="font-semibold">Think Inspect</div><div className="text-sm text-slate-400">Think Healthcare and Safety</div></div>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Every wheelchair and stretcher, inspected, certified and accounted for.</h1>
          <p className="mt-4 text-lg text-slate-400">The paper checklist you know — on your phone, offline, with photos, signatures and certificates generated on the spot.</p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-sm">
            {[[<WifiOff key="a" className="h-5 w-5" />, 'Works without signal'], [<ShieldCheck key="b" className="h-5 w-5" />, 'Safety-critical lockout'], [<FileText key="c" className="h-5 w-5" />, 'Instant certificates']].map(([i, t]) => (
              <div key={String(t)} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"><div className="text-brand-400">{i}</div><div className="mt-2 text-slate-300">{t}</div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-10 w-10 rounded-xl" alt="" />
            <div><div className="font-semibold">Think Inspect</div><div className="text-sm text-slate-500">Think Healthcare and Safety</div></div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-slate-500">Inspectors, reviewers and client administrators.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email"><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {error && <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{!navigator.onLine && <CloudOff className="mt-0.5 h-4 w-4" />}{error}</div>}
            <Button variant="dark" size="lg" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight className="h-4 w-4" /></Button>
          </form>
          {demo.length > 0 && (
            <div className="mt-10">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Demo accounts</div>
              <div className="space-y-2">
                {demo.map((d) => (
                  <button key={d.email} onClick={() => submit(undefined, { email: d.email, password: 'Think@2026' })}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm transition hover:border-slate-300 hover:shadow-card">
                    <span><span className="font-medium">{d.name}</span><span className="block text-xs text-slate-500">{d.email}</span></span>
                    <span className="text-xs font-medium text-brand-700">{ROLE_LABELS[d.role]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
