/**
 * Scan an equipment QR label with the camera and open that unit. Typing the tag
 * works too, for a damaged label or a phone that refuses the camera.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CameraOff } from 'lucide-react';
import { db } from '../lib/db.ts';
import { makeDetector, parseScan } from '../lib/qr.ts';
import { Button, haptic, Sheet } from './ui.tsx';

export function ScanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <Sheet open onClose={onClose} title="Scan a label"><Scanner onClose={onClose} /></Sheet> : null;
}

function Scanner({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'starting' | 'live' | 'blocked'>('starting');
  const [msg, setMsg] = useState('');
  const [tag, setTag] = useState('');

  async function openTarget(text: string): Promise<boolean> {
    const hit = parseScan(text);
    let id = hit.assetId && (await db.assets.get(hit.assetId))?.id;
    if (!id && hit.tag) id = (await db.assets.filter((a) => a.assetTag.toUpperCase() === hit.tag).first())?.id;
    if (!id) {
      setMsg(hit.assetId || hit.tag ? 'That unit is not in Think Inspect on this device yet. Sync, then try again.' : 'That code is not a Think Inspect label.');
      return false;
    }
    haptic(20);
    onClose();
    nav(`/assets/${id}`);
    return true;
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let timer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (stop) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setState('live');
        const detect = await makeDetector();
        let last = '';
        const tick = async () => {
          if (stop) return;
          try {
            const text = await detect(v, canvas.current!);
            if (text && text !== last) {
              last = text;
              if (await openTarget(text)) return;
            }
          } catch { /* keep scanning */ }
          timer = window.setTimeout(tick, 180);
        };
        tick();
      } catch {
        setState('blocked');
      }
    })();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {state !== 'blocked' ? (
        <div className="relative overflow-hidden rounded-[20px] bg-black" style={{ aspectRatio: '3 / 4', maxHeight: '55dvh', marginInline: 'auto' }}>
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-[58%] w-[70%] rounded-[22px] border-[3px] border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
          </div>
          <div className="absolute inset-x-0 bottom-3 text-center text-[14px] font-medium text-white/90">
            {state === 'starting' ? 'Starting camera…' : 'Point at the QR label on the unit'}
          </div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          <CameraOff className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-[15px]">The camera is not available. Allow camera access for this site in the browser settings, or use the phone's own camera app on the label. You can also type the tag below.</div>
        </div>
      )}
      <canvas ref={canvas} hidden />
      {msg && <div className="rounded-xl bg-rose-50 p-3 text-[15px] text-rose-800 ring-1 ring-rose-100">{msg}</div>}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (tag.trim()) await openTarget(tag.trim());
        }}
      >
        <input id="scan-tag" className="input flex-1 font-mono uppercase" placeholder="Or type the tag, e.g. JLL-NKP-WC-004" value={tag} onChange={(e) => setTag(e.target.value)} autoCapitalize="characters" />
        <Button type="submit" variant="primary" disabled={!tag.trim()}>Open</Button>
      </form>
    </div>
  );
}
