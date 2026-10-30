/**
 * The inspection form, built for speed on a phone:
 * one scrolling screen, details pre-filled and folded away, one row per check
 * with big P / F / M buttons, remark and photo only when needed, a saved
 * signature, and "start next asset" straight after submitting.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight, Check, ChevronLeft, CloudOff, Download, Ellipsis, Eye, History, Lock, PenLine, ShieldAlert, Undo2,
} from 'lucide-react';
import {
  addDays, blocking, canEdit, DEFAULT_TEMPLATES, deriveResult, EQUIPMENT_LABELS, formatDate, formatDateTime, FUNCTIONAL_TEST_LABELS,
  functionalTestBlockers, HEADER_FIELDS, RESULT_LABELS, STATUS_LABELS, validateInspection,
  type Asset, type CheckEntry, type CheckStatus, type ChecklistTemplate, type Inspection,
} from '@think/shared';
import { db } from '../lib/db.ts';
import { can, useUser } from '../lib/hooks.ts';
import { addPhoto, nextDueOnFloor, openOrCreateInspection, reviewInspection, saveInspection, submitInspection, templateFor } from '../lib/store.ts';
import { useSync } from '../lib/sync.ts';
import { downloadInspectionPack } from '../lib/exportPack.ts';
import { describeEvent } from '../lib/pdf.ts';
import { PaperView } from '../components/PaperView.tsx';
import { PersonPicker, PhotoStrip, SignaturePad } from '../components/Inputs.tsx';
import { Badge, Button, Card, cx, Empty, EquipmentAvatar, Field, InspectionStatusBadge, Segmented, Sheet, useToast } from '../components/ui.tsx';

const STATUS_STYLE: Record<CheckStatus, string> = {
  P: 'bg-emerald-600 text-white ring-emerald-600',
  F: 'bg-rose-600 text-white ring-rose-600',
  M: 'bg-sky-600 text-white ring-sky-600',
  NA: 'bg-slate-600 text-white ring-slate-600',
  RECT: 'bg-amber-500 text-white ring-amber-500',
};

const SIG_KEY = (userId: string) => `think.signature.${userId}`;
const loadSig = (userId: string) => { try { return localStorage.getItem(SIG_KEY(userId)); } catch { return null; } };
const storeSig = (userId: string, url: string) => { try { localStorage.setItem(SIG_KEY(userId), url); } catch { /* storage blocked */ } };

export function InspectionPage() {
  const { inspectionId = '' } = useParams();
  const stored = useLiveQuery(async () => (await db.inspections.get(inspectionId)) ?? null, [inspectionId]);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  useEffect(() => {
    if (stored) void templateFor(stored.templateId).then((t) => setTemplate(t.version === stored.templateVersion ? t : DEFAULT_TEMPLATES[stored.templateId]));
  }, [stored?.templateId, stored?.templateVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  if (stored === undefined || (stored && !template)) return <div className="h-96 animate-pulse rounded-2xl bg-slate-200/60" />;
  if (!stored) return <Empty title="Inspection not found on this device">It may still be syncing.</Empty>;
  return <Editor key={stored.id} initial={stored} template={template!} />;
}

function Editor({ initial, template: t }: { initial: Inspection; template: ChecklistTemplate }) {
  const user = useUser();
  const toast = useToast();
  const nav = useNavigate();
  const sync = useSync();
  const [insp, setInsp] = useState(initial);
  const [paper, setPaper] = useState(initial.status === 'submitted' || initial.status === 'finalized');
  const [showErrors, setShowErrors] = useState(false);
  const [editDetails, setEditDetails] = useState(false);
  const [menu, setMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [done, setDone] = useState<{ next: Asset | null } | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving'>('saved');
  const stored = useLiveQuery(() => db.inspections.get(initial.id), [initial.id]);
  const asset = useLiveQuery(() => db.assets.get(initial.assetId), [initial.assetId]);
  const pending = useRef<Inspection | null>(null);
  const timer = useRef<number>(undefined);
  const editable = canEdit(insp, user.role, user.id);

  // Pick up changes made elsewhere (sync, review) when nothing is unsaved here.
  useEffect(() => {
    if (stored && !pending.current && (stored.rev !== insp.rev || stored.status !== insp.status)) setInsp(stored);
  }, [stored]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    const doc = pending.current; if (!doc) return;
    pending.current = null; window.clearTimeout(timer.current);
    try {
      const savedDoc = await saveInspection(doc, user);
      if (!pending.current) setInsp((cur) => ({ ...cur, result: savedDoc.result, events: savedDoc.events, functionalTest: savedDoc.functionalTest }));
    } catch (e) { toast((e as Error).message, 'err'); }
    setSaved('saved');
  }, [user, toast]);
  useEffect(() => () => { void flush(); }, [flush]);

  const update = (fn: (d: Inspection) => Inspection) => {
    if (!editable) return;
    setInsp((cur) => {
      const next = fn(cur);
      pending.current = next;
      setSaved('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 400);
      return next;
    });
  };

  const issues = useMemo(() => validateInspection(t, insp, true), [t, insp]);
  const errors = blocking(issues).filter((i) => i.path !== 'technicianSignature');
  const err = (path: string) => (showErrors ? issues.find((i) => i.path === path && i.severity === 'error')?.message : undefined);
  const derived = deriveResult(t, insp.checks, insp.functionalTest);
  const answered = insp.checks.filter((c) => c.status).length;
  const blockers = functionalTestBlockers(insp.checks);
  const h = insp.header;

  const setCheck = (no: number, patch: Partial<CheckEntry>) => update((d) => ({ ...d, checks: d.checks.map((c) => (c.no === no ? { ...c, ...patch } : c)) }));
  const allPass = () => {
    const before = insp.checks;
    const n = before.filter((c) => !c.status).length;
    if (!n) return;
    update((d) => ({ ...d, checks: d.checks.map((c) => (c.status ? c : { ...c, status: 'P' })) }));
    toast(`${n} check${n > 1 ? 's' : ''} marked P — tap any row to change it`, 'info');
  };
  const onPhoto = async (no: number | null, blob: Blob) => {
    await flush();
    const id = await addPhoto(insp, no, blob, user);
    if (no != null) setCheck(no, { photoIds: [...(insp.checks.find((c) => c.no === no)?.photoIds ?? []), id] });
  };

  const jumpToFirstError = () => {
    setShowErrors(true);
    const e = errors[0]; if (!e) return;
    if (e.path.startsWith('header')) setEditDetails(true);
    const target = e.path.startsWith('header') ? 'sec-details' : e.path.startsWith('checks') ? `chk-${e.path.split('.')[1]}` : e.path.startsWith('functionalTest') ? 'sec-test' : 'sec-result';
    setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const submit = async (dataUrl: string, remember: boolean) => {
    if (remember) storeSig(user.id, dataUrl);
    const sig = { name: h.technician || user.name, userId: user.id, dataUrl, signedAt: new Date().toISOString() };
    const errs = blocking(validateInspection(t, { ...insp, technicianSignature: sig }, true));
    if (errs.length) { setSignOpen(false); jumpToFirstError(); return; }
    await flush();
    const doc = await submitInspection({ ...insp, technicianSignature: sig }, sig, user);
    setInsp(doc); setSignOpen(false); setPaper(true);
    const a = await db.assets.get(insp.assetId);
    setDone({ next: a ? await nextDueOnFloor(a) : null });
  };

  const startNext = async (a: Asset) => { setDone(null); nav(`/inspections/${await openOrCreateInspection(a, user)}`, { replace: true }); };

  // Required header fields that are empty are shown even when details are folded.
  const missingHeader = HEADER_FIELDS.filter((f) => !f.linkedTo && ['technician', 'siteLocationDepartment', 'inspectionDate', 'nextDueDate'].includes(f.key) && !String(h[f.key] ?? '').trim());

  return (
    <div className="mx-auto max-w-3xl">
      {/* Top bar */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 border-b border-slate-200/70 bg-canvas/95 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex items-center gap-2">
          <button onClick={() => nav(-1)} className="rounded-xl p-2 text-slate-500 hover:bg-white" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link to={`/assets/${insp.assetId}`} className="truncate text-[17px] font-semibold hover:text-brand-700">{h.equipmentAssetId}</Link>
              {insp.status !== 'draft' && <InspectionStatusBadge status={insp.status} />}
              {insp.kind === 'retest' && <Badge tone="violet">Re-test</Badge>}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              {t.shortName} · {answered}/{t.checks.length}
              {editable && <span className="inline-flex items-center gap-1">· {!sync.online && <CloudOff className="h-3 w-3" />}{saved === 'saving' ? 'Saving…' : 'Saved'}</span>}
            </div>
          </div>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="rounded-xl p-2 text-slate-500 hover:bg-white" aria-label="More"><Ellipsis className="h-5 w-5" /></button>
            {menu && (
              <div className="absolute right-0 top-11 z-20 w-52 overflow-hidden rounded-2xl bg-white py-1 shadow-lift ring-1 ring-slate-200" onClick={() => setMenu(false)}>
                <MenuItem icon={<Eye className="h-4 w-4" />} onClick={() => setPaper(!paper)}>{paper ? 'Back to form' : 'View as paper form'}</MenuItem>
                <MenuItem icon={<History className="h-4 w-4" />} onClick={() => setHistoryOpen(true)}>Change history</MenuItem>
                {insp.status !== 'draft' && insp.status !== 'returned' && <MenuItem icon={<Download className="h-4 w-4" />} onClick={() => downloadInspectionPack(insp.id).catch((e) => toast(e.message, 'err'))}>Certificate PDF</MenuItem>}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(answered / t.checks.length) * 100}%` }} /></div>
      </div>

      {insp.status === 'returned' && insp.reviewerComment && <Banner tone="amber" title="Returned by reviewer">{insp.reviewerComment}</Banner>}
      {insp.status === 'finalized' && <Banner tone="green" title="Finalised and locked">Approved by {insp.reviewerSignature?.name}, {formatDateTime(insp.reviewerSignature?.signedAt)}.</Banner>}
      {insp.status === 'submitted' && !can.review(user.role) && <Banner tone="blue" title="Submitted — waiting for review">Signed by {insp.technicianSignature?.name}, {formatDateTime(insp.technicianSignature?.signedAt)}.</Banner>}
      {insp.status === 'submitted' && can.review(user.role) && <ReviewPanel insp={insp} />}

      {paper || !editable ? <PaperView insp={insp} template={t} /> : (
        <div className="space-y-4 pb-28">
          {/* Details — pre-filled, folded */}
          <Card id="sec-details" className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-slate-900">{h.customerSite}{h.siteLocationDepartment ? ` · ${h.siteLocationDepartment}` : ''}</div>
                <div className="mt-0.5 text-slate-500">{formatDate(h.inspectionDate)} · {h.technician || 'No technician'} · Next due {formatDate(h.nextDueDate)}</div>
              </div>
              <button onClick={() => setEditDetails(!editDetails)} className="shrink-0 text-sm font-medium text-brand-700">{editDetails ? 'Done' : 'Edit details'}</button>
            </div>
            {!editDetails && missingHeader.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {missingHeader.map((f) => <HeaderInput key={f.key} f={f} insp={insp} t={t} update={update} error={err(`header.${f.key}`)} />)}
              </div>
            )}
            {editDetails && (
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                {HEADER_FIELDS.filter((f) => !f.linkedTo && f.kind !== 'equipmentType').map((f) => <HeaderInput key={f.key} f={f} insp={insp} t={t} update={update} error={err(`header.${f.key}`)} />)}
              </div>
            )}
          </Card>

          {/* Checks */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div>
                <div className="font-semibold">Checks</div>
                <div className="text-xs text-slate-500">P Pass · F Fail · M Maintenance</div>
              </div>
              <Button size="sm" variant="dark" icon={<Check className="h-4 w-4" />} disabled={answered === t.checks.length} onClick={allPass}>All P</Button>
            </div>
            <div className="divide-y divide-slate-100">
              {t.checks.map((item) => (
                <CheckRow key={item.no} item={item} e={insp.checks.find((c) => c.no === item.no)!} onSet={(p) => setCheck(item.no, p)}
                  onPhoto={(b) => onPhoto(item.no, b)} statusError={err(`checks.${item.no}.status`)} remarkError={err(`checks.${item.no}.remark`)} />
              ))}
            </div>
          </Card>

          {/* Functional test */}
          <Card id="sec-test" className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-semibold">Functional test required?</div>
              <div className="sm:w-56"><Segmented value={insp.functionalTest.required} onChange={(v) => update((d) => ({ ...d, functionalTest: { ...d.functionalTest, required: v } }))}
                options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} /></div>
            </div>
            {err('functionalTest.required') && <div className="mt-1 text-xs font-medium text-rose-600">{err('functionalTest.required')}</div>}
            {insp.functionalTest.required === 'yes' && (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={FUNCTIONAL_TEST_LABELS.method} error={err('functionalTest.method')}>
                    <input className="input" list="test-methods" value={insp.functionalTest.method} onChange={(e) => update((d) => ({ ...d, functionalTest: { ...d.functionalTest, method: e.target.value } }))} />
                    <datalist id="test-methods"><option value="As per manufacturer instructions" /><option value="Push and brake test on ramp with occupant" /><option value="Assemble, lock and lift test" /></datalist>
                  </Field>
                  <Field label={FUNCTIONAL_TEST_LABELS.observations} error={err('functionalTest.observations')}>
                    <input className="input" value={insp.functionalTest.observations} onChange={(e) => update((d) => ({ ...d, functionalTest: { ...d.functionalTest, observations: e.target.value } }))} />
                  </Field>
                </div>
                <Segmented size="lg" value={insp.functionalTest.result === 'na' ? null : insp.functionalTest.result} onChange={(v) => update((d) => ({ ...d, functionalTest: { ...d.functionalTest, result: v } }))}
                  options={[{ value: 'pass', label: 'Pass', activeClass: STATUS_STYLE.P, disabled: blockers.length > 0 }, { value: 'fail', label: 'Fail', activeClass: STATUS_STYLE.F }]} />
                {blockers.length > 0 && <div className="text-xs text-rose-700">Pass is locked because check {blockers.map((n) => `#${n}`).join(', ')} is F.</div>}
                {err('functionalTest.result') && <div className="text-xs font-medium text-rose-600">{err('functionalTest.result')}</div>}
              </div>
            )}
          </Card>

          {/* Result — automatic */}
          {derived.complete && (
            <Card id="sec-result" className="p-4 sm:p-5">
              <Verdict derived={derived} retest={insp.result.retestRequired} />
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Tick on={insp.result.allPassed} label={RESULT_LABELS.allPassed} />
                <Tick on={insp.result.defectsIdentified} label={RESULT_LABELS.defectsIdentified} />
                <button type="button" disabled={derived.retestAuto} onClick={() => update((d) => ({ ...d, result: { ...d.result, retestManual: !d.result.retestManual } }))}>
                  <Tick on={insp.result.retestRequired} label={RESULT_LABELS.retestRequired} />
                </button>
              </div>
              {(derived.failedChecks.length > 0 || derived.testFailed) && (
                <div className="mt-4"><Field label={RESULT_LABELS.correctiveActionRef} required error={err('result.correctiveActionRef')}>
                  <input className="input" placeholder="Work order / CAR number" value={insp.result.correctiveActionRef} onChange={(e) => update((d) => ({ ...d, result: { ...d.result, correctiveActionRef: e.target.value } }))} />
                </Field></div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* One action at the bottom */}
      {editable && !paper && (
        <div className="fixed inset-x-0 bottom-16 z-20 px-4 lg:bottom-0 lg:pl-[264px]">
          <div className="safe-bottom mx-auto max-w-3xl pb-2 pt-2 lg:pb-5">
            {errors.length > 0
              ? <Button size="lg" variant="dark" className="w-full shadow-lift" onClick={jumpToFirstError}>{errors.length} item{errors.length > 1 ? 's' : ''} left — show next<ArrowRight className="h-4 w-4" /></Button>
              : <Button size="lg" variant="primary" className="w-full shadow-lift" icon={<PenLine className="h-5 w-5" />} onClick={() => setSignOpen(true)}>Sign &amp; submit</Button>}
          </div>
        </div>
      )}

      <SignSheet open={signOpen} onClose={() => setSignOpen(false)} name={h.technician || user.name} savedSig={loadSig(user.id)} onSign={submit} />

      <Sheet open={!!done} onClose={() => setDone(null)} title="Submitted">
        <div className="space-y-4">
          <div className={cx('rounded-2xl p-4 text-center font-semibold text-white', derived.outOfService ? 'bg-rose-600' : 'bg-emerald-600')}>
            {derived.outOfService ? `${h.equipmentAssetId} is now OUT OF SERVICE` : `${h.equipmentAssetId} submitted for review`}
          </div>
          {done?.next ? (
            <Button size="lg" variant="primary" className="w-full" onClick={() => startNext(done.next!)}>
              Start next: {done.next.assetTag} · {EQUIPMENT_LABELS[done.next.equipmentType]}<ArrowRight className="h-4 w-4" />
            </Button>
          ) : <div className="text-center text-sm text-slate-500">Everything on this floor is inspected for this cycle.</div>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => nav(`/sites/${insp.buildingId}${asset?.floorId ? `?floor=${asset.floorId}` : ''}`)}>Back to floor</Button>
            <Button className="flex-1" icon={<Download className="h-4 w-4" />} onClick={() => downloadInspectionPack(insp.id).catch((e) => toast(e.message, 'err'))}>PDF</Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Change history">
        <ol className="space-y-3 text-sm">
          {[...insp.events].reverse().map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              <div><div>{describeEvent(e)}</div><div className="text-xs text-slate-500">{e.byName} · {formatDateTime(e.at)}{e.offline ? ' · offline' : ''}</div></div>
            </li>
          ))}
        </ol>
      </Sheet>
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">{icon}{children}</button>;
}

function CheckRow({ item, e, onSet, onPhoto, statusError, remarkError }: {
  item: ChecklistTemplate['checks'][number]; e: CheckEntry; onSet: (p: Partial<CheckEntry>) => void; onPhoto: (b: Blob) => void;
  statusError?: string; remarkError?: string;
}) {
  const [more, setMore] = useState(e.status === 'NA' || e.status === 'RECT');
  const needsRemark = e.status === 'F' || e.status === 'M' || e.status === 'RECT';
  const btn = (s: CheckStatus, disabled = false) => (
    <button key={s} type="button" disabled={disabled} onClick={() => onSet({ status: s })} title={STATUS_LABELS[s]}
      className={cx('h-11 min-w-11 flex-1 rounded-xl px-2 text-[15px] font-bold ring-1 ring-inset transition active:scale-95 disabled:opacity-30',
        e.status === s ? STATUS_STYLE[s] : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300')}>{s}</button>
  );
  return (
    <div id={`chk-${item.no}`} className={cx('px-4 py-3 sm:px-5', e.status === 'F' && 'bg-rose-50/60', statusError && 'bg-rose-50')}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="w-5 shrink-0 pt-0.5 text-right text-sm font-semibold text-slate-400 tabular">{item.no}</span>
          <div className="min-w-0 text-[15px] leading-snug text-slate-800">
            {item.label}
            {item.safetyCritical && <ShieldAlert className="ml-1 inline h-4 w-4 -translate-y-px text-rose-500" aria-label="Safety-critical" />}
          </div>
        </div>
        <div className="flex gap-1.5 pl-8 sm:w-64 sm:pl-0">
          {btn('P')}{btn('F')}{btn('M')}
          {more ? <>{btn('NA', !item.allowNA)}{btn('RECT')}</> : (
            <button type="button" onClick={() => setMore(true)} className="h-11 w-11 shrink-0 rounded-xl text-slate-400 ring-1 ring-inset ring-slate-200 hover:text-slate-700" title="NA / RECT">
              <Ellipsis className="mx-auto h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      {item.measurement && (
        <div className="mt-2 flex items-center gap-2 pl-8 text-sm text-slate-500">
          {item.measurement.label}
          <input type="number" inputMode="decimal" className="input h-9 w-24 py-1" value={e.measurement ?? ''} onChange={(ev) => onSet({ measurement: ev.target.value === '' ? null : Number(ev.target.value) })} />
          {item.measurement.unit}{item.measurement.hint && <span className="text-xs text-slate-400">({item.measurement.hint})</span>}
        </div>
      )}
      {(needsRemark || e.photoIds.length > 0) && (
        <div className="mt-3 space-y-2 pl-8">
          <input autoFocus={needsRemark && !e.remark} className={cx('input', remarkError && 'input-error')} value={e.remark} onChange={(ev) => onSet({ remark: ev.target.value })}
            placeholder={e.status === 'F' ? 'What is wrong? (required)' : e.status === 'M' ? 'What maintenance is needed? (required)' : e.status === 'RECT' ? 'What did you fix? (required)' : 'Remark'} />
          <PhotoStrip photoIds={e.photoIds} onAdd={onPhoto} onRemove={(id) => onSet({ photoIds: e.photoIds.filter((p) => p !== id) })} />
          {e.status === 'F' && item.safetyCritical && <div className="text-xs font-medium text-rose-700">Safety-critical — the asset goes out of service when you submit.</div>}
        </div>
      )}
      {statusError && <div className="mt-1 pl-8 text-xs font-medium text-rose-600">{statusError}</div>}
    </div>
  );
}

function HeaderInput({ f, insp, t, update, error }: { f: (typeof HEADER_FIELDS)[number]; insp: Inspection; t: ChecklistTemplate; update: (fn: (d: Inspection) => Inspection) => void; error?: string }) {
  const h = insp.header;
  const set = (v: string) => update((d) => {
    const nh = { ...d.header, [f.key]: v };
    if (f.key === 'technician' && (d.header.inspectionPerformedBy === d.header.technician || !d.header.inspectionPerformedBy)) nh.inspectionPerformedBy = v;
    if (f.key === 'inspectionDate' && v && (!d.header.nextDueDate || d.header.nextDueDate === addDays(d.header.inspectionDate, t.intervalDays))) nh.nextDueDate = addDays(v, t.intervalDays);
    return { ...d, header: nh };
  });
  if (f.kind === 'person') return <Field label={f.label} error={error}><PersonPicker value={h[f.key] as string} onChange={set} error={!!error} /></Field>;
  if (f.kind === 'date') return (
    <Field label={f.label} error={error} hint={f.key === 'nextDueDate' ? 'Quarterly: +90 days' : undefined}>
      <input type="date" className={cx('input', error && 'input-error')} value={(h[f.key] as string) ?? ''} onChange={(e) => set(e.target.value)} />
    </Field>
  );
  return (
    <Field label={f.label} error={error}>
      <input className={cx('input', error && 'input-error')} placeholder={f.key === 'siteLocationDepartment' ? 'e.g. 10th Floor · Lift lobby' : undefined}
        value={(h[f.key] as string) ?? ''} onChange={(e) => set(e.target.value)} />
    </Field>
  );
}

function SignSheet({ open, onClose, name, savedSig, onSign }: { open: boolean; onClose: () => void; name: string; savedSig: string | null; onSign: (dataUrl: string, remember: boolean) => Promise<void> }) {
  const [drawNew, setDrawNew] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async (url: string, rem: boolean) => { setBusy(true); try { await onSign(url, rem); } finally { setBusy(false); setDrawNew(false); } };
  return (
    <Sheet open={open} onClose={onClose} title="Sign & submit">
      {savedSig && !drawNew ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 p-4"><img src={savedSig} className="h-20" alt="Your saved signature" /><div className="mt-1 text-sm font-medium">{name}</div></div>
          <Button size="lg" variant="primary" className="w-full" disabled={busy} icon={<PenLine className="h-5 w-5" />} onClick={() => go(savedSig, false)}>Sign with this &amp; submit</Button>
          <button className="w-full text-sm text-slate-500 underline" onClick={() => setDrawNew(true)}>Draw a new signature</button>
        </div>
      ) : (
        <div className="space-y-3">
          <SignaturePad name={name} onDone={(url) => go(url, remember)} />
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember my signature on this device</label>
        </div>
      )}
    </Sheet>
  );
}

function Banner({ tone, title, children }: { tone: 'amber' | 'green' | 'blue'; title: string; children: React.ReactNode }) {
  const c = { amber: 'border-amber-200 bg-amber-50 text-amber-900', green: 'border-emerald-200 bg-emerald-50 text-emerald-900', blue: 'border-sky-200 bg-sky-50 text-sky-900' }[tone];
  const icon = tone === 'amber' ? <Undo2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />;
  return <div className={cx('mb-4 flex gap-3 rounded-2xl border p-4', c)}><span className="mt-0.5 shrink-0">{icon}</span><div><div className="font-semibold">{title}</div><div className="text-sm opacity-90">{children}</div></div></div>;
}

function Tick({ on, label }: { on: boolean; label: string }) {
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset', on ? 'bg-ink-950 text-white ring-ink-950' : 'text-slate-400 ring-slate-200')}>{on && <Check className="h-3 w-3" />}{label}</span>;
}

function Verdict({ derived, retest }: { derived: ReturnType<typeof deriveResult>; retest: boolean }) {
  const [label, cls] = derived.outOfService ? ['Not fit for use — out of service', 'bg-rose-600'] : retest ? ['Fit for use — re-test required', 'bg-amber-500']
    : derived.defectsIdentified ? ['Fit for use — defects rectified', 'bg-emerald-600'] : derived.maintenanceChecks.length ? ['Fit for use — maintenance advised', 'bg-sky-600'] : ['Fit for use', 'bg-emerald-600'];
  return <div className={cx('rounded-xl px-4 py-3 text-center font-semibold text-white', cls)}>{label}</div>;
}

function ReviewPanel({ insp }: { insp: Inspection }) {
  const user = useUser();
  const toast = useToast();
  const [mode, setMode] = useState<'approve' | 'return' | null>(null);
  const [comment, setComment] = useState('');
  const saved = loadSig(user.id);
  const approve = async (dataUrl: string) => {
    storeSig(user.id, dataUrl);
    await reviewInspection(insp, user, { finalize: true, signature: { name: user.name, userId: user.id, dataUrl, signedAt: new Date().toISOString() } });
    setMode(null); toast('Approved and locked');
  };
  return (
    <Card className="mb-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-semibold">Review</div><div className="text-sm text-slate-500">By {insp.technicianSignature?.name} · {formatDateTime(insp.technicianSignature?.signedAt)}</div></div>
        <div className="flex gap-2">
          <Button icon={<Undo2 className="h-4 w-4" />} onClick={() => setMode('return')}>Return</Button>
          <Button variant="primary" icon={<Lock className="h-4 w-4" />} onClick={() => saved ? void approve(saved) : setMode('approve')}>{saved ? 'Approve & sign' : 'Approve'}</Button>
        </div>
      </div>
      <Sheet open={mode === 'approve'} onClose={() => setMode(null)} title="Reviewer signature">
        <p className="mb-4 text-sm text-slate-600">Approving locks the inspection and issues the certificate. Your signature is remembered on this device for the next approvals.</p>
        <SignaturePad name={user.name} onDone={approve} />
      </Sheet>
      <Sheet open={mode === 'return'} onClose={() => setMode(null)} title="Return to inspector" footer={<Button variant="dark" className="flex-1" disabled={!comment.trim()} onClick={async () => {
        await reviewInspection(insp, user, { finalize: false, comment: comment.trim() }); setMode(null); toast('Returned to inspector');
      }}>Return with comment</Button>}>
        <Field label="What needs correcting?"><textarea id="return-comment" rows={4} className="input" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Sheet>
    </Card>
  );
}

