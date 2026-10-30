import { DEFAULT_TEMPLATES, formatDate } from '@think/shared';
import { db } from './db.ts';
import { getSession } from './api.ts';
import { blobToDataUrl, imageSize } from './image.ts';
import { inspectionPack, type PhotoForPdf } from './pdf.ts';
import { templateFor } from './store.ts';
import { saveFile } from './files.ts';

/** Builds the certificate + checklist + evidence PDF entirely on the device. */
export async function downloadInspectionPack(inspectionId: string) {
  const insp = await db.inspections.get(inspectionId);
  if (!insp) throw new Error('Inspection not found');
  const [asset, building, client] = await Promise.all([db.assets.get(insp.assetId), db.buildings.get(insp.buildingId), db.clients.get(insp.clientId)]);
  const template = (await db.templates.where('id').equals(insp.templateId).filter((t) => t.version === insp.templateVersion).first())
    ?? (await templateFor(insp.templateId)) ?? DEFAULT_TEMPLATES[insp.templateId];
  const photos: PhotoForPdf[] = [];
  const all = await db.photos.where('inspectionId').equals(insp.id).toArray();
  for (const p of all.sort((a, b) => (a.checkNo ?? 99) - (b.checkNo ?? 99))) {
    let blob = p.blob;
    if (!blob && navigator.onLine && import.meta.env.VITE_DEMO !== '1') {
      const s = getSession();
      const r = await fetch(`/api/photos/${p.id}`, { headers: s ? { Authorization: `Bearer ${s.token}` } : {} }).catch(() => null);
      if (r?.ok) { blob = await r.blob(); await db.photos.update(p.id, { blob }); }
    }
    if (!blob) continue;
    const item = template.checks.find((c) => c.no === p.checkNo);
    const { w, h } = await imageSize(blob);
    photos.push({ dataUrl: await blobToDataUrl(blob), w, h,
      caption: `${item ? `Check #${item.no} — ${item.label}` : 'General'} · ${formatDate(p.createdAt.slice(0, 10))}` });
  }
  const doc = inspectionPack(insp, { asset, building, client, template, photos });
  await saveFile(`${insp.header.equipmentAssetId}_${insp.header.inspectionDate}_${insp.status}.pdf`, doc.output('blob'));
}
