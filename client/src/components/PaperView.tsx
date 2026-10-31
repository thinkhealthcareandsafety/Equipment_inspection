import { EQUIPMENT_LABELS, formatDate, formatDateTime, FUNCTIONAL_TEST_LABELS, HEADER_FIELDS, ORG_NAME, RESULT_LABELS,
  type ChecklistTemplate, type EquipmentType, type Inspection, type Signature } from '@think/shared';
import { cx } from './ui.tsx';

/** On-screen replica of the paper checklist — same rows, wording and order. */
export function PaperView({ insp, template }: { insp: Inspection; template: ChecklistTemplate }) {
  const ft = insp.functionalTest;
  return (
    <div className="mx-auto max-w-[820px] rounded-sm bg-white p-5 text-[13px] text-slate-900 shadow-lift ring-1 ring-slate-200 sm:p-10">
      <div className="flex justify-end"><Logo /></div>
      <div className="mt-2 text-center">
        <div className="text-sm font-bold tracking-wide text-slate-600">{ORG_NAME}</div>
        <div className="mt-1 text-lg font-bold sm:text-xl">{template.title}</div>
        <div className="mt-1 text-xs italic text-slate-500">{template.subtitle}</div>
      </div>
      <table className="mt-4 w-full border-collapse">
        <tbody>
          {HEADER_FIELDS.map((f, i) => (
            <tr key={i}>
              <th className="w-[38%] border border-slate-500 px-2 py-1 text-left font-semibold">{f.label}</th>
              <td className="border border-slate-500 px-2 py-1">
                {f.kind === 'equipmentType' ? (
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    {(['wheelchair', 'scoop_stretcher', 'folding_stretcher'] as EquipmentType[]).map((t) => <Box key={t} on={insp.header.equipmentType === t}>{EQUIPMENT_LABELS[t]}</Box>)}
                  </span>
                ) : f.kind === 'date' ? formatDate(insp.header[f.key] as string) : String(insp.header[f.key] ?? '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-5 font-bold">Equipment-Specific Checks</div>
      <table className="mt-1 w-full border-collapse">
        <thead><tr className="bg-[#585858] text-left text-xs text-white">
          <th className="border border-slate-500 px-2 py-1">No.</th><th className="border border-slate-500 px-2 py-1">Inspection / Functional Test</th>
          <th className="border border-slate-500 px-2 py-1">Status (P/F/M/NA/RECT)</th><th className="border border-slate-500 px-2 py-1">Remarks / Measurements</th>
        </tr></thead>
        <tbody>
          {template.checks.map((c) => {
            const e = insp.checks.find((x) => x.no === c.no);
            return (
              <tr key={c.no}>
                <td className="border border-slate-500 px-2 py-1 align-top">{c.no}</td>
                <td className="border border-slate-500 px-2 py-1 align-top">{c.label}{c.safetyCritical && <span className="text-rose-600"> *</span>}</td>
                <td className={cx('border border-slate-500 px-2 py-1 text-center align-top font-bold', e?.status === 'F' ? 'text-rose-600' : e?.status === 'RECT' ? 'text-amber-600' : e?.status === 'M' ? 'text-sky-700' : e?.status === 'P' ? 'text-emerald-700' : 'text-slate-500')}>{e?.status ?? ''}</td>
                <td className="border border-slate-500 px-2 py-1 align-top">
                  {[e?.remark, c.measurement && e?.measurement != null ? `${c.measurement.label}: ${e.measurement} ${c.measurement.unit}` : '', e?.photoIds.length ? `[${e.photoIds.length} photo]` : ''].filter(Boolean).join(' · ')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-5 font-bold">{FUNCTIONAL_TEST_LABELS.section}</div>
      <table className="mt-1 w-full border-collapse">
        <tbody>
          <tr><th className="w-[38%] border border-slate-500 px-2 py-1 text-left">{FUNCTIONAL_TEST_LABELS.required}</th>
            <td className="border border-slate-500 px-2 py-1"><span className="flex flex-wrap gap-4"><Box on={ft.required === 'yes'}>Yes</Box><Box on={ft.required === 'no'}>No</Box><span>Reference: {ft.reference}</span></span></td></tr>
          <tr><th className="border border-slate-500 px-2 py-1 text-left">{FUNCTIONAL_TEST_LABELS.method}</th><td className="border border-slate-500 px-2 py-1">{ft.method || (ft.required === null && ft.result === 'na' ? 'Not performed — a check failed' : '')}</td></tr>
          <tr><th className="border border-slate-500 px-2 py-1 text-left">{FUNCTIONAL_TEST_LABELS.criteria}</th><td className="border border-slate-500 px-2 py-1">{[ft.criteria, ft.specifiedLoadKg != null && `${ft.specifiedLoadKg} kg`].filter(Boolean).join(' · ')}</td></tr>
          <tr><th className="border border-slate-500 px-2 py-1 text-left">{FUNCTIONAL_TEST_LABELS.observations}</th><td className="border border-slate-500 px-2 py-1">{[ft.observations, ft.actualLoadKg != null && `Applied ${ft.actualLoadKg} kg`].filter(Boolean).join(' · ')}</td></tr>
          <tr><th className="border border-slate-500 px-2 py-1 text-left">{FUNCTIONAL_TEST_LABELS.result}</th>
            <td className="border border-slate-500 px-2 py-1"><span className="flex flex-wrap gap-4"><Box on={ft.result === 'pass'}>Pass</Box><Box on={ft.result === 'fail'}>Fail</Box><Box on={ft.result === 'na'}>Not applicable</Box></span></td></tr>
        </tbody>
      </table>

      <div className="mt-5 font-bold">{RESULT_LABELS.section}</div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        <Box on={insp.result.allPassed}>{RESULT_LABELS.allPassed}</Box><Box on={insp.result.defectsIdentified}>{RESULT_LABELS.defectsIdentified}</Box><Box on={insp.result.retestRequired}>{RESULT_LABELS.retestRequired}</Box>
      </div>
      <table className="mt-2 w-full border-collapse">
        <tbody>
          <tr><th className="w-[38%] border border-slate-500 px-2 py-1 text-left">{RESULT_LABELS.correctiveActionRef}</th><td className="border border-slate-500 px-2 py-1">{insp.result.correctiveActionRef}</td></tr>
          <tr><th className="border border-slate-500 px-2 py-1 text-left">{RESULT_LABELS.technicianSignature}</th><td className="border border-slate-500 px-2 py-1"><Sig s={insp.technicianSignature} /></td></tr>
          <tr><th className="border border-slate-500 px-2 py-1 text-left">{RESULT_LABELS.reviewerSignature}</th><td className="border border-slate-500 px-2 py-1"><Sig s={insp.reviewerSignature} /></td></tr>
        </tbody>
      </table>
      <div className="mt-2 text-[11px] italic text-slate-500">P = Pass · F = Fail · M = Maintenance · NA = Not applicable · RECT = Rectified · * Safety-critical item</div>
    </div>
  );
}

function Box({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cx('grid h-3.5 w-3.5 place-items-center border border-slate-600 text-[10px] leading-none', on && 'bg-slate-900 text-white')}>{on ? '✓' : ''}</span>{children}</span>;
}

function Sig({ s }: { s: Signature | null }) {
  if (!s) return <span className="text-slate-400">—</span>;
  return <span className="flex items-center gap-3"><img src={s.dataUrl} className="h-10" alt="" /><span><span className="block font-medium">{s.name}</span><span className="text-xs text-slate-500">{formatDateTime(s.signedAt)}</span></span></span>;
}

export function Logo() {
  return (
    <span className="relative inline-block pr-1 pt-3">
      <span className="absolute right-0 top-0 rounded-[4px] bg-brand-500 px-1 text-[10px] font-bold leading-[14px] text-white">health</span>
      <span className="text-lg font-semibold text-slate-500">think</span>
    </span>
  );
}
