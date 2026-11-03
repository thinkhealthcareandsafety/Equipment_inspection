/**
 * How to use Think Inspect: one page for inspectors and for the manager, written
 * for someone opening the app for the first time. The buttons shown here are the
 * same ones the inspection screen uses.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Cloud, Ellipsis, FileText, PenLine, Printer, ScanLine, ShieldAlert } from 'lucide-react';
import { Card, cx, PageHeader } from '../components/ui.tsx';

const SECTIONS = [
  { id: 'inspect', label: 'Inspect a unit' },
  { id: 'buttons', label: 'The buttons' },
  { id: 'fails', label: 'When something fails' },
  { id: 'qr', label: 'QR labels' },
  { id: 'offline', label: 'No signal' },
  { id: 'manager', label: 'For the manager' },
  { id: 'faq', label: 'Questions' },
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="mb-3 mt-10 px-1 text-[22px] font-bold tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 px-4 py-4 sm:px-5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-[15px] font-bold text-white">{n}</span>
      <div className="min-w-0">
        <div className="text-[17px] font-semibold tracking-[-0.01em]">{title}</div>
        <div className="mt-1 space-y-1.5 text-[15px] leading-relaxed text-slate-600">{children}</div>
      </div>
    </li>
  );
}

function Key({ code, word, cls }: { code: string; word: string; cls: string }) {
  return (
    <span className={cx('inline-flex h-[54px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[12px] leading-none', cls)}>
      {code && <span className="text-[17px] font-semibold">{code}</span>}
      <span className={cx('text-center font-semibold', code ? 'mt-1 text-[11px]' : 'px-1 text-[12px] leading-tight')}>{word}</span>
    </span>
  );
}

const BUTTONS: { code: string; word: string; cls: string; when: string; note?: string }[] = [
  { code: '✓', word: 'OK', cls: 'bg-emerald-600 text-white', when: 'It works as it should and is safe to use.' },
  { code: '✗', word: 'Problem', cls: 'bg-rose-600 text-white', when: 'It does not work or is not safe.', note: 'Write what is wrong. Add a photo if you can.' },
  { code: '', word: 'Service needed', cls: 'bg-sky-600 text-white', when: 'Under More. It works, but needs maintenance soon (loose, worn, dirty).', note: 'Write what needs doing.' },
  { code: '', word: 'N/A', cls: 'bg-slate-600 text-white', when: 'Under More. This check does not apply to this unit, for example no restraints fitted.', note: 'Only some checks allow it.' },
  { code: '', word: 'Fixed now', cls: 'bg-amber-500 text-white', when: 'Under More. It was wrong and you fixed it on the spot.', note: 'Write what you did.' },
];

export function Help() {
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <PageHeader eyebrow="Think Inspect" title="How to use" subtitle="Replaces the paper checklists and the Master Inspection & Fitness Certificate for wheelchairs, scoop stretchers and foldable stretchers." />

      <nav aria-label="On this page" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }); }}
            className="h-9 shrink-0 rounded-full bg-white px-4 text-[15px] font-medium leading-9 text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:ring-slate-300 active:scale-95">
            {s.label}
          </a>
        ))}
      </nav>

      <Section id="inspect" title="Inspect a unit in 5 steps">
        <Card className="overflow-hidden">
          <ol className="divide-y divide-slate-100">
            <Step n={1} title="Open the unit">
              <p>On Home tap <strong>Pick a site</strong>, choose the site, then tap the unit. Or type its tag (for example <span className="whitespace-nowrap">"NKP WC 004"</span>) in the search on Home.</p>
              <p>Once QR labels are stuck on the units (see <strong>QR labels</strong> below), point the phone camera at the label instead, or tap <ScanLine className="inline h-4 w-4 -translate-y-px" /> <strong>Scan</strong>.</p>
            </Step>
            <Step n={2} title="Tap Start inspection">
              <p>Site, date, your name and the next due date are already filled in. Tap the <strong>floor</strong> the unit is on. If the app asks for the location, type where it is (for example "10th Floor · lift lobby").</p>
            </Step>
            <Step n={3} title="Answer every check">
              <p>Tap <strong>OK</strong> or <strong>Problem</strong> for each line. If most lines are fine, mark the problems first, then tap <strong>Rest OK</strong> to mark all the others OK.</p>
            </Step>
            <Step n={4} title="If something is wrong, say what">
              <p>After <strong>Problem</strong>, type what is wrong and take a photo. The button at the bottom always shows what is still missing; tap it to jump there.</p>
            </Step>
            <Step n={5} title="Sign and submit">
              <p>Tap <PenLine className="inline h-4 w-4 -translate-y-px" /> <strong>Sign &amp; submit</strong> and sign with your finger. The phone remembers your signature for next time.</p>
              <p>Then tap <strong>Start next</strong> to go straight to the next unit on the same floor.</p>
            </Step>
          </ol>
        </Card>
      </Section>

      <Section id="buttons" title="The buttons">
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100">
            {BUTTONS.map((b) => (
              <div key={b.word} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                <Key code={b.code} word={b.word} cls={b.cls} />
                <div className="min-w-0 text-[15px] leading-relaxed">
                  <div className="text-slate-800">{b.when}</div>
                  {b.note && <div className="text-slate-500">{b.note}</div>}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
              <span className="inline-flex h-[54px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[12px] bg-black/[.05] text-slate-500"><Ellipsis className="h-5 w-5" /><span className="mt-0.5 text-[10px] font-medium">More</span></span>
              <div className="text-[15px] leading-relaxed text-slate-800">Shows Service needed, N/A and Fixed now.</div>
            </div>
            <div className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
              <span className="grid h-[54px] w-[62px] shrink-0 place-items-center rounded-[12px] bg-rose-50"><ShieldAlert className="h-6 w-6 text-rose-500" /></span>
              <div className="text-[15px] leading-relaxed text-slate-800"><strong>Safety-critical check.</strong> A Problem here takes the unit out of service.</div>
            </div>
          </div>
        </Card>
      </Section>

      <Section id="fails" title="When something fails">
        <Card className="space-y-4 p-4 text-[15px] leading-relaxed text-slate-700 sm:p-5">
          <div className="flex gap-3 rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-100">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div><strong>Problem on a safety-critical check (shield):</strong> when you submit, the unit becomes <strong>Out of service</strong>. Put a DO NOT USE tag on it. It stays red on Home and in Reports until a re-test passes.</div>
          </div>
          <p><strong>Problem on any other check:</strong> the unit stays in service but needs a re-test.</p>
          <p><strong>Work order / CAR number:</strong> filled in for you when there is a problem. Replace it with the repair job number if there is one.</p>
          <p><strong>Functional test:</strong> appears once every line is answered. Say whether the manufacturer requires one; if yes, write how you tested it and whether it passed.</p>
          <p><strong>After the repair:</strong> open the unit and tap <strong>Start re-test</strong>. A passing re-test puts it back in service.</p>
        </Card>
      </Section>

      <Section id="qr" title="QR labels">
        <Card className="space-y-3 p-4 text-[15px] leading-relaxed text-slate-700 sm:p-5">
          <p className="rounded-2xl bg-brand-500/[.08] p-3 text-slate-800">The units do not have QR labels yet. You print them from the app once and stick one on each unit. Until then, open units from <strong>Sites</strong> or the search on Home; nothing else changes.</p>
          <p><strong>Print:</strong> open a site and tap <Printer className="inline h-4 w-4 -translate-y-px" /> <strong>QR labels</strong>. You get a PDF with 21 labels per A4 page, sized for standard 63.5 × 38.1 mm sticker sheets (often sold as "L7160"). Plain paper and clear tape also work. To print just a few, filter the site's list first. A single unit's label is on that unit's page (Label PDF).</p>
          <p><strong>Stick:</strong> on the frame, where hands and cleaning will not rub it off and where the camera can reach.</p>
          <p><strong>Scan:</strong> the phone's normal camera opens the unit. A new phone asks for the access code once.</p>
        </Card>
      </Section>

      <Section id="offline" title="No signal on site">
        <Card className="space-y-3 p-4 text-[15px] leading-relaxed text-slate-700 sm:p-5">
          <p>Keep working. Everything, including photos and signatures, is saved on the phone first and sent to the office automatically when the signal comes back.</p>
          <p>The <Cloud className="inline h-4 w-4 -translate-y-px" /> cloud at the top shows the state: a <span className="font-semibold text-emerald-600">green</span> dot means everything is sent; a number means that many changes are waiting.</p>
          <p>Do not lock the app or clear the browser while changes are waiting. They would be lost.</p>
          <p><strong>Install it like an app:</strong> in the browser menu choose <strong>Add to Home Screen</strong> (iPhone: Share, then Add to Home Screen).</p>
        </Card>
      </Section>

      <Section id="manager" title="For the manager">
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100 text-[15px] leading-relaxed text-slate-700">
            <li className="px-4 py-4 sm:px-5"><strong className="text-slate-900">Home</strong> shows the whole quarter at a glance: how many units are done, how many still to inspect, what is out of service and open defects. Below are the round by city, today's inspections by person and the sites with the most work left. Tap any number to see the list behind it.</li>
            <li className="px-4 py-4 sm:px-5"><strong className="text-slate-900">Review</strong> lists submitted inspections. Open one, check it, then <strong>Approve &amp; sign</strong> to lock it and issue the certificate, or <strong>Return</strong> it to the inspector with a comment.</li>
            <li className="px-4 py-4 sm:px-5"><strong className="text-slate-900">Reports:</strong> choose a city or site, the period and the equipment type. <strong>PDF</strong> gives a report you can send the client; <strong>Excel</strong> gives the list for the office.</li>
            <li className="px-4 py-4 sm:px-5"><FileText className="mr-1 inline h-4 w-4 -translate-y-px text-slate-500" /><strong className="text-slate-900">Certificates:</strong> open any submitted inspection, tap <strong>⋯</strong> at the top, then <strong>Certificate PDF</strong>. It uses the same layout and wording as the paper form.</li>
          </ul>
        </Card>
      </Section>

      <Section id="faq" title="Questions">
        <Card className="overflow-hidden">
          <dl className="divide-y divide-slate-100 text-[15px] leading-relaxed">
            {[
              ['Where do the numbers come from?', 'The 331 units are from the inventory sheet "FLS Equipment - INDIA.xlsx" (22 sites, 7 cities). Every submitted inspection updates the numbers for everyone.'],
              ['What does "in date" mean?', 'The unit was inspected in the last 90 days. Each unit is due again 90 days after its last inspection.'],
              ['What is the password?', 'The shared access code your office gave you. An administrator can change it.'],
              ['The app shows the wrong person.', 'Tap your name at the bottom of the menu (on a phone: More) and choose yourself. Your name goes on the certificate.'],
              ['A serial number, make or floor is wrong or missing.', 'Open the unit and tap Edit. Every change is recorded with your name and the time.'],
              ['A unit is not in the list.', 'Check the tag on the unit and search for it on Home. If it is really missing, tell the office so it can be added to the inventory.'],
            ].map(([q, a]) => (
              <div key={q} className="px-4 py-4 sm:px-5">
                <dt className="font-semibold text-slate-900">{q}</dt>
                <dd className="mt-1 text-slate-600">{a}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <p className="mt-6 px-1 text-[15px] text-slate-500">Ready? <Link to="/sites" className="font-medium text-brand-700">Pick a site</Link> and inspect your first unit.</p>
      </Section>
    </div>
  );
}
