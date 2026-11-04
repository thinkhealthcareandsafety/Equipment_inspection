/**
 * Email the team when a site visit is planned, moved or cancelled.
 * To: the inspector who is going (everyone on the team when nobody is chosen yet). Cc: the rest of the team.
 * Each email carries a calendar invite, so the visit lands in their calendar; a change updates the same event
 * and a cancellation removes it. Needs SMTP_URL and MAIL_FROM; without them nothing is sent.
 */
import nodemailer from 'nodemailer';
import { formatDate, quarterOf, weekday, type SiteContact, type Visit } from '@think/shared';
import type { Queryable } from '../db.ts';
import { config } from '../config.ts';

export type VisitChange = 'planned' | 'changed' | 'cancelled';

export const mailEnabled = () => !!config.smtpUrl;

let transport: nodemailer.Transporter | null = null;
const mailer = () => (transport ??= nodemailer.createTransport(config.smtpUrl));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const day = (iso: string) => `${({ Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' } as Record<string, string>)[weekday(iso)]}, ${formatDate(iso)}`;
const addressOf = (from: string) => from.match(/<([^>]+)>/)?.[1] ?? from;

export async function sendVisitMail(q: Queryable, visit: Visit, change: VisitChange, before: Visit | null, byName: string) {
  if (!mailEnabled()) return { sent: false, reason: 'Email is not set up (SMTP_URL)' };
  const b = (await q.query<{ name: string; city: string; address: string | null; contacts: SiteContact[] }>(
    'SELECT name, city, address, contacts FROM buildings WHERE id = $1', [visit.buildingId])).rows[0];
  if (!b) return { sent: false, reason: 'Site not found' };
  const team = (await q.query<{ name: string; email: string }>(
    `SELECT name, email FROM team_members WHERE active AND email IS NOT NULL AND email <> '' ORDER BY name`)).rows;
  if (!team.length) return { sent: false, reason: 'No team member has an email address' };
  const going = visit.inspector ? team.find((m) => m.name.trim().toLowerCase() === visit.inspector.trim().toLowerCase()) : undefined;
  const to = going ? [going] : team;
  const cc = going ? team.filter((m) => m.email !== going.email) : [];
  const qStart = quarterOf(visit.date).from;
  const units = Number((await q.query<{ n: string }>(
    `SELECT count(*) AS n FROM assets WHERE building_id = $1 AND status <> 'removed' AND (last_inspection_date IS NULL OR last_inspection_date < $2)`,
    [visit.buildingId, qStart])).rows[0]?.n ?? 0);
  const contact = (b.contacts ?? []).find((c) => c.phone) ?? (b.contacts ?? [])[0];
  const po = (await q.query<{ number: string; doc_date: string | null }>(
    `SELECT number, doc_date FROM documents WHERE building_id = $1 AND NOT deleted ORDER BY COALESCE(doc_date, '') DESC, created_at DESC LIMIT 1`, [visit.buildingId])).rows[0];
  const site = `${b.name}, ${b.city}`;
  const who = visit.inspector || 'Not decided yet';
  const link = `${config.appUrl}/sites/${visit.buildingId}`;
  const verb = change === 'planned' ? 'planned' : change === 'changed' ? 'changed' : 'cancelled';
  const subject = change === 'cancelled'
    ? `Cancelled: inspection visit to ${site} on ${formatDate(visit.date)}`
    : `Inspection visit${change === 'changed' ? ' changed' : ''}: ${site} · ${day(visit.date)} · ${who}`;
  const moved = change === 'changed' && before && before.date !== visit.date ? `Moved from ${day(before.date)}.` : '';

  const rows: [string, string][] = [
    ['Site', site],
    ['Date', day(visit.date)],
    ['Inspector', who],
    ['Units to inspect', String(units)],
    ...(contact ? [['Site contact', [contact.name, contact.role, contact.phone].filter(Boolean).join(' · ')] as [string, string]] : []),
    ...(po ? [['Purchase order', `${po.number}${po.doc_date ? ` (${formatDate(po.doc_date)})` : ''}`] as [string, string]] : []),
    ...(visit.note ? [['Note', visit.note] as [string, string]] : []),
    ['Planned by', byName],
  ];
  const text = [
    `Inspection visit ${verb}.`, moved, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    change === 'cancelled' ? '' : `Open the site: ${link}`, '',
    'Think Inspect · Think Healthcare and Safety',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const tone = change === 'cancelled' ? '#e5352b' : '#0d8f7a';
  const html = `<!doctype html><html><body style="margin:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#1c1c1e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:${tone};padding:18px 24px;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.02em">Think Inspect · Think Healthcare and Safety</td></tr>
<tr><td style="padding:24px 24px 8px">
<div style="font-size:22px;font-weight:700;letter-spacing:-.02em">Inspection visit ${esc(verb)}</div>
<div style="margin-top:6px;font-size:16px;color:#56565a">${esc(site)} · ${esc(day(visit.date))}${moved ? `<br><span style="color:#b45309">${esc(moved)}</span>` : ''}</div>
</td></tr>
<tr><td style="padding:12px 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">
${rows.map(([k, v]) => `<tr><td style="padding:9px 0;border-top:1px solid #ececf0;color:#6e6e73;width:140px;vertical-align:top">${esc(k)}</td><td style="padding:9px 0;border-top:1px solid #ececf0;font-weight:600">${k === 'Site contact' && contact?.phone ? `${esc(v)} &nbsp;<a href="tel:${esc(contact.phone.replace(/[^\d+]/g, ''))}" style="color:#0d8f7a">Call</a>` : esc(v)}</td></tr>`).join('')}
</table></td></tr>
${change === 'cancelled' ? '' : `<tr><td style="padding:16px 24px 28px"><a href="${esc(link)}" style="display:inline-block;background:#0d8f7a;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 22px;border-radius:12px">Open the site</a></td></tr>`}
</table>
<div style="max-width:560px;margin-top:12px;font-size:12px;color:#8e8e93">The calendar invite in this email adds the visit to your calendar.</div>
</td></tr></table></body></html>`;

  // Calendar invite: an all-day event; the visit id keeps the same event across changes.
  const ymd = (iso: string) => iso.replace(/-/g, '');
  const next = new Date(Date.UTC(+visit.date.slice(0, 4), +visit.date.slice(5, 7) - 1, +visit.date.slice(8, 10) + 1)).toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const from = addressOf(config.mailFrom);
  const method = change === 'cancelled' ? 'CANCEL' : 'REQUEST';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Think Healthcare and Safety//Think Inspect//EN', `METHOD:${method}`, 'BEGIN:VEVENT',
    `UID:visit-${visit.id}@think-inspect`, `SEQUENCE:${Math.floor(Date.now() / 1000)}`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(visit.date)}`, `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${icsText(`Inspection visit: ${site}`)}`, `LOCATION:${icsText(b.address ? `${b.address}, ${b.city}` : site)}`,
    `DESCRIPTION:${icsText(rows.map(([k, v]) => `${k}: ${v}`).join('\n') + (change === 'cancelled' ? '' : `\n${link}`))}`,
    `STATUS:${change === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:TRANSPARENT',
    `ORGANIZER;CN=Think Inspect:mailto:${from}`,
    ...[...to, ...cc].map((m) => `ATTENDEE;CN=${icsText(m.name)};ROLE=${to.includes(m) ? 'REQ-PARTICIPANT' : 'OPT-PARTICIPANT'};RSVP=FALSE:mailto:${m.email}`),
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');

  await mailer().sendMail({
    from: config.mailFrom,
    to: to.map((m) => `${m.name} <${m.email}>`).join(', '),
    cc: cc.length ? cc.map((m) => `${m.name} <${m.email}>`).join(', ') : undefined,
    subject, text, html,
    icalEvent: { method, filename: 'visit.ics', content: ics },
  });
  return { sent: true, to: to.map((m) => m.email), cc: cc.map((m) => m.email) };
}
