import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, Sheet } from './ui.tsx';

/**
 * In-app confirm / prompt dialogs. Native confirm() and prompt() are blocked in
 * embedded views (they silently return false/null) and look out of place on a phone.
 */
interface ConfirmOpts { title?: string; confirmLabel?: string; danger?: boolean }
interface PromptOpts { title?: string; placeholder?: string; confirmLabel?: string; initial?: string }
interface Dialogs {
  confirm: (message: ReactNode, opts?: ConfirmOpts) => Promise<boolean>;
  prompt: (message: ReactNode, opts?: PromptOpts) => Promise<string | null>;
}

const Ctx = createContext<Dialogs>({ confirm: async () => false, prompt: async () => null });
export const useDialogs = () => useContext(Ctx);

type State =
  | { kind: 'confirm'; message: ReactNode; opts: ConfirmOpts }
  | { kind: 'prompt'; message: ReactNode; opts: PromptOpts }
  | null;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<(v: unknown) => void>(() => {});

  const close = (result: unknown) => { setState(null); resolver.current(result); };
  const confirm = useCallback<Dialogs['confirm']>((message, opts = {}) => new Promise((res) => {
    resolver.current = res as (v: unknown) => void; setState({ kind: 'confirm', message, opts });
  }), []);
  const prompt = useCallback<Dialogs['prompt']>((message, opts = {}) => new Promise((res) => {
    resolver.current = res as (v: unknown) => void; setValue(opts.initial ?? ''); setState({ kind: 'prompt', message, opts });
  }), []);

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <Sheet open={!!state} onClose={() => close(state?.kind === 'prompt' ? null : false)} title={state?.opts.title ?? (state?.kind === 'prompt' ? 'Enter a name' : 'Please confirm')}
        footer={state && <>
          <Button className="flex-1" onClick={() => close(state.kind === 'prompt' ? null : false)}>Cancel</Button>
          <Button className="flex-1" variant={state.kind === 'confirm' && state.opts.danger ? 'danger' : 'primary'}
            disabled={state.kind === 'prompt' && !value.trim()}
            onClick={() => close(state.kind === 'prompt' ? value.trim() : true)}>{state.opts.confirmLabel ?? (state.kind === 'prompt' ? 'Save' : 'Confirm')}</Button>
        </>}>
        {state && <div className="space-y-3 text-[15px] text-slate-700">
          <div>{state.message}</div>
          {state.kind === 'prompt' && (
            <input id="dialog-prompt" autoFocus className="input" placeholder={state.opts.placeholder} value={value}
              onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) close(value.trim()); }} />
          )}
        </div>}
      </Sheet>
    </Ctx.Provider>
  );
}
