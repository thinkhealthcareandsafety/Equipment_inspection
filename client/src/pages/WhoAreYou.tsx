/**
 * Shown straight after every login, before anything else: the person picks their name, so
 * every inspection and signature carries the right person. It cannot be skipped.
 */
import { getSession, setSession } from '../lib/api.ts';
import { PersonChooser } from '../components/Inputs.tsx';

export function WhoAreYou() {
  const choose = (name: string) => {
    const s = getSession();
    if (s) setSession({ ...s, user: { ...s.user, name }, named: true });
  };
  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas px-5 pb-10 pt-[max(48px,env(safe-area-inset-top))]">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />
      <div className="animate-rise relative mx-auto w-full max-w-[440px]">
        <div className="flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-[64px] w-[64px] rounded-[17px] shadow-lift" alt="" />
          <h1 className="mt-5 text-[30px] font-bold leading-tight tracking-[-0.03em] text-slate-900">Who is inspecting?</h1>
          <p className="mt-1.5 max-w-[340px] text-[16px] text-slate-500">Pick your name. It goes on every inspection and certificate you sign on this device.</p>
        </div>
        <div className="mt-8"><PersonChooser onPick={choose} /></div>
      </div>
    </div>
  );
}
