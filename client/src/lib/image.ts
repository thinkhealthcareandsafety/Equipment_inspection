const MAX_BYTES = 1_200_000; // a base64 photo must stay well under the host's 4.5 MB request limit

async function render(bmp: ImageBitmap, max: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', quality));
}

/** Downscales a camera photo to a JPEG under ~1.2 MB so it syncs quickly over weak connections. */
export async function compressImage(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) {
    if (file.size > MAX_BYTES * 2) throw new Error('That photo could not be read. Use the camera button to take it instead.');
    return file;
  }
  for (const [max, q] of [[1600, 0.8], [1280, 0.7], [1024, 0.6], [800, 0.5]] as const) {
    const b = await render(bmp, max, q);
    if (b && b.size <= MAX_BYTES) return b;
  }
  throw new Error('That photo is too large to attach. Take it again with the camera button.');
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b); });
}

export async function imageSize(b: Blob): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(b).catch(() => null);
  return bmp ? { w: bmp.width, h: bmp.height } : { w: 4, h: 3 };
}
