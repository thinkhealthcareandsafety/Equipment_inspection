/**
 * "Find" from anywhere (top bar on phones, sidebar on desktop, Ctrl+K or "/" on a keyboard):
 * type a site or unit and jump straight to it, wherever you are in the app.
 */
import { useAllData } from '../lib/hooks.ts';
import { GlobalSearch } from './GlobalSearch.tsx';
import { Sheet } from './ui.tsx';

export function FindSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useAllData();
  return (
    <Sheet open={open} onClose={onClose} title="Find a site or unit">
      <div className="min-h-[320px] pb-2">
        {data && <GlobalSearch data={data} id="find-search" autoFocus placeholder="Site name, city, or unit tag" onNavigate={onClose} />}
        <p className="mt-3 px-1 text-[13px] text-slate-500">Examples: <b>NKP</b>, <b>Magma</b>, <b>Bangalore</b>, <b>NKP WC 4</b>. Spelling mistakes are fine.</p>
      </div>
    </Sheet>
  );
}
