import nodemailer from 'nodemailer';
import { addDays, DUE_SOON_DAYS, EQUIPMENT_LABELS, formatDate, todayISO, uuid } from '@think/shared';
import { getDb } from '../db.ts';
import { config } from '../config.ts';

/**
 * Daily reminder run. Creates one in-app notification per asset per due date
 * (deduplicated, so re-running is harmless) for assets that are overdue or due
 * within DUE_SOON_DAYS, plus a "baseline" reminder for out-of-service assets,
 * then emails a digest per client to staff and that client's admins.
 */
export async function runReminders(today = todayISO()) {
  const db = await getDb();
  const horizon = addDays(today, DUE_SOON_DAYS);
  const rows = (await db.query<any>(`
    SELECT a.id, a.client_id, a.asset_tag, a.equipment_type, a.next_due_date, a.status, a.status_reason, b.name AS building, b.city, c.name AS client
    FROM assets a JOIN buildings b ON b.id = a.building_id JOIN clients c ON c.id = a.client_id
    WHERE a.status <> 'removed' AND ((a.next_due_date IS NOT NULL AND a.next_due_date <= $1) OR a.status IN ('out_of_service','retest_required'))`,
    [horizon])).rows;

  let created = 0;
  const digest = new Map<string, { client: string; lines: string[] }>();
  for (const a of rows) {
    const overdue = a.next_due_date && a.next_due_date < today;
    const kind = a.status === 'out_of_service' ? 'out_of_service' : a.status === 'retest_required' ? 'retest' : overdue ? 'overdue' : 'due_soon';
    const label = `${EQUIPMENT_LABELS[a.equipment_type as keyof typeof EQUIPMENT_LABELS]} ${a.asset_tag} · ${a.building}, ${a.city}`;
    const title = kind === 'out_of_service' ? `Out of service: ${a.asset_tag}` : kind === 'retest' ? `Re-test pending: ${a.asset_tag}`
      : overdue ? `Overdue: ${a.asset_tag}` : `Due ${formatDate(a.next_due_date)}: ${a.asset_tag}`;
    const body = kind === 'out_of_service' || kind === 'retest' ? `${label}. ${a.status_reason ?? ''}` : `${label} — inspection due ${formatDate(a.next_due_date)}.`;
    const r = await db.query(`INSERT INTO notifications (id, client_id, asset_id, kind, title, body, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`, [uuid(), a.client_id, a.id, kind, title, body, `${a.id}|${kind}|${a.next_due_date ?? today}`]);
    if (r.rows.length) {
      created++;
      const d = digest.get(a.client_id) ?? { client: a.client as string, lines: [] as string[] };
      d.lines.push(`• ${title} — ${body}`);
      digest.set(a.client_id, d);
    }
  }

  let emailed = 0;
  if (digest.size) {
    const transport = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;
    for (const [clientId, d] of digest) {
      const to = (await db.query<{ email: string }>(`SELECT email FROM users WHERE active AND email NOT LIKE '%.demo'
        AND (role IN ('inspector','reviewer','admin') OR client_id = $1)`, [clientId])).rows.map((x) => x.email);
      const subject = `Inspection reminders — ${d.client} (${d.lines.length})`;
      const text = `Think Healthcare and Safety\n\n${subject}\n\n${d.lines.join('\n')}\n`;
      if (transport && to.length) {
        await transport.sendMail({ from: config.mailFrom, to, subject, text });
        emailed += to.length;
      } else {
        console.log(`[reminders] ${subject}: ${d.lines.length} item(s) (email not configured — set SMTP_URL to send)`);
      }
    }
    await db.query(`UPDATE notifications SET emailed_at = now() WHERE emailed_at IS NULL`);
  }
  return { checked: rows.length, created, emailed };
}
