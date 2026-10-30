/** Downscales a camera photo to ≤1600px JPEG so it syncs quickly over weak connections. */
export async function compressImage(file: Blob, max = 1600, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', quality));
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b); });
}

export async function imageSize(b: Blob): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(b).catch(() => null);
  return bmp ? { w: bmp.width, h: bmp.height } : { w: 4, h: 3 };
}
