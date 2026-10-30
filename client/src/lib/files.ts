/**
 * Saves a generated file. Inside a claude.ai artifact view, page-initiated
 * downloads are blocked, so the platform's `downloads` capability is used
 * (the viewer confirms the save). Everywhere else a normal browser download.
 */
interface DownloadsNs { save(r: { filename: string; data: Blob | string }): Promise<{ status: string }> }
type ClaudeWindow = Window & { claude?: { use(name: 'downloads'): Promise<DownloadsNs | null> } };

export async function saveFile(filename: string, data: Blob | string): Promise<void> {
  const host = (window as ClaudeWindow).claude;
  if (host?.use) {
    const downloads = await host.use('downloads').catch(() => null);
    if (downloads) {
      try { await downloads.save({ filename, data }); }
      catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== 'declined') throw new Error(code === 'rate_limited' ? 'A save is already waiting for your answer' : 'Saving files is not available in this view');
      }
      return;
    }
  }
  const blob = typeof data === 'string' ? new Blob(['﻿', data], { type: 'text/csv;charset=utf-8' }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
