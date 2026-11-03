/**
 * QR codes on equipment. Each label encodes the unit's page on the live site, so any
 * phone camera opens it directly (after the access code on a new device). The in-app
 * scanner reads the same codes.
 */
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { EQUIPMENT_LABELS, type Asset, type Building } from '@think/shared';
import { saveFile } from './files.ts';

/** The address printed on labels. Preview and snapshot links on vercel.app are private
 *  and short-lived, so labels always point at the live site; a self-hosted install
 *  (office PC on the Wi-Fi) uses its own address. */
export const LIVE_URL = 'https://equipmentinspection.vercel.app';
export function publicOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');
  return location.hostname.endsWith('.vercel.app') ? LIVE_URL : location.origin;
}
export const unitUrl = (assetId: string) => `${publicOrigin()}/assets/${assetId}`;

export function qrDataUrl(text: string, px = 320): Promise<string> {
  return QRCode.toDataURL(text, { margin: 0, width: px, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } });
}

/** Reads a scanned code: a unit link from any Think Inspect address, or a bare asset tag. */
export function parseScan(text: string): { assetId?: string; tag?: string } {
  const t = text.trim();
  const m = t.match(/\/assets\/([0-9a-f-]{36})/i);
  if (m) return { assetId: m[1].toLowerCase() };
  if (/^[A-Z0-9]+(-[A-Z0-9]+){2,}$/i.test(t)) return { tag: t.toUpperCase() };
  return {};
}

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [100, 108, 120];
const TEAL: [number, number, number] = [19, 163, 139];
const EDGE: [number, number, number] = [210, 214, 220];

/**
 * Draws a QR code as filled squares (vector), not a picture. A picture per label made a
 * 50-label sheet about 12 MB and slow to open on a phone; squares keep it small and print
 * perfectly sharp at any size. Runs of dark modules on a row are merged into one rectangle.
 */
function drawQr(doc: jsPDF, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const m = size / n;
  doc.setFillColor(...INK);
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.modules.get(r, c)) { c++; continue; }
      const start = c;
      while (c < n && qr.modules.get(r, c)) c++;
      // Each run reaches 0.08 mm into its neighbours so viewers and printers show no white seams
      // between rows (well under a tenth of a module, so scanning is unaffected).
      doc.rect(x + start * m, y + r * m, (c - start) * m + 0.08, m + 0.08, 'F');
    }
  }
}

/**
 * A4 sheet of 21 labels (3 x 7, 63.5 x 38.1 mm: the common "L7160" sticker size).
 * Cut lines are drawn so plain paper works too.
 */
export async function downloadQrLabels(assets: Asset[], building: Building, fileName?: string) {
  await new Promise((r) => setTimeout(r, 30)); // let the button show "Preparing…" first
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const LW = 63.5, LH = 38.1, GAP = 2.5;
  const left = (210 - (LW * 3 + GAP * 2)) / 2;
  const top = (297 - LH * 7) / 2;
  const list = [...assets].sort((a, b) => a.assetTag.localeCompare(b.assetTag, undefined, { numeric: true }));

  for (let k = 0; k < list.length; k++) {
    const a = list[k];
    const slot = k % 21;
    if (k > 0 && slot === 0) doc.addPage();
    const x = left + (slot % 3) * (LW + GAP);
    const y = top + Math.floor(slot / 3) * LH;

    doc.setDrawColor(...EDGE); doc.setLineWidth(0.15);
    doc.roundedRect(x, y, LW, LH, 2.5, 2.5, 'S');
    drawQr(doc, unitUrl(a.id), x + 3, y + 4.5, 29);

    const tx = x + 35;
    doc.setFillColor(...TEAL); doc.roundedRect(tx, y + 4.5, 25.5, 4.6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(255, 255, 255);
    doc.text('THINK INSPECT', tx + 1.5, y + 7.7);

    // Tag on two lines so the unit number reads large: "JLL-NKP-" / "WC-004"
    const parts = a.assetTag.split('-');
    const head = parts.length > 2 ? `${parts.slice(0, 2).join('-')}-` : '';
    const tail = parts.length > 2 ? parts.slice(2).join('-') : a.assetTag;
    doc.setTextColor(...INK); doc.setFont('courier', 'bold');
    if (head) { doc.setFontSize(8.5); doc.text(head, tx, y + 14.5); }
    doc.setFontSize(11.5); doc.text(tail, tx, y + 19.8);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(...INK);
    doc.text(EQUIPMENT_LABELS[a.equipmentType], tx, y + 24.6);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(`${building.name}, ${building.city}`, 26)[0] ?? '', tx, y + 28);
    doc.setFontSize(5.4);
    doc.text(doc.splitTextToSize('Scan with the phone camera to open and inspect', 26.5).slice(0, 2), tx, y + 31.6);
  }
  const name = fileName ?? (list.length === 1 ? `${list[0].assetTag} QR label.pdf` : `${building.name} QR labels (${list.length}).pdf`);
  await saveFile(name, doc.output('blob'));
}

/* ------------------------------------------------------------------ */
/* Camera scanning                                                     */
/* ------------------------------------------------------------------ */

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

/** Chrome on Android has a built-in QR reader; Safari and others fall back to jsQR. */
export async function makeDetector(): Promise<(video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (BD) {
    try {
      const formats = (await BD.getSupportedFormats?.()) ?? ['qr_code'];
      if (formats.includes('qr_code')) {
        const det = new BD({ formats: ['qr_code'] });
        return async (video) => (await det.detect(video))[0]?.rawValue ?? null;
      }
    } catch { /* fall through */ }
  }
  const { default: jsQR } = await import('jsqr');
  return async (video, canvas) => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 720 / Math.max(w, h));
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}
