/**
 * Inventory importer for "FLS Equipment - INDIA.xlsx" style sheets.
 *
 * The sheet is a hand-maintained summary, not a register: one quantity cell
 * (often merged over several rows) covers a mix of stretcher types, makes,
 * models and ages written as free text ("21Nos are Med star", "Vissco (1 no's);
 * Make/Model not available -6 no's", "4 are 8 Years -and 2 are 7 years"...).
 *
 * This module is pure: it takes the sheet as a grid (merged cells already
 * resolved to their master value) and returns one record per physical unit,
 * each flagged where data is missing or had to be inferred. Nothing is
 * discarded; every record keeps the raw row it came from.
 */
import type { DataFlag, EquipmentType } from './types.ts';
import { subtractAge } from './dates.ts';

export interface GridRow {
  row: number;
  values: (string | number | null)[];
  /** Address of the merged-range master for each cell (own address if not merged). */
  masters: string[];
}

export interface ImportedUnit {
  key: string; // stable within an import: `${row}:${segment}:${unit}`
  city: string;
  cityNote: string | null;
  site: string;
  equipmentType: EquipmentType;
  manufacturer: string | null;
  model: string | null;
  candidateMakes: string[];
  installDate: string | null;
  installDateEstimated: boolean;
  ageRaw: string | null;
  floorHint: string | null;
  status: 'in_service' | 'out_of_service';
  statusReason: string | null;
  dataFlags: DataFlag[];
  source: { sheet: string; row: number; raw: Record<string, string> };
}

export interface ImportIssue { row: number; level: 'info' | 'warning'; message: string }

export interface ImportResult {
  units: ImportedUnit[];
  issues: ImportIssue[];
  asOfDate: string;
  asOfDerivedFrom: string | null;
  declaredTotal: number | null;
  sites: { city: string; site: string; count: number }[];
}

const clean = (v: unknown): string =>
  v == null ? '' : String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const NULLISH = /^(?:-|–|n\/?a|nil|none|not\s*available|no\s*brand(?:\s*name)?|generic(?:\s*\(no branding\))?|make\s*(?:&|and|\/)\s*model\s*not\s*available|(?:wheel\s*chairs?\s*-?\s*)?make\s*and\s*model\s*not\s*available)$/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// ----- column detection ---------------------------------------------------

type Col = 'city' | 'site' | 'details' | 'qty' | 'type' | 'make' | 'model' | 'age';
const HEADER_PATTERNS: [Col, RegExp][] = [
  ['city', /^city/i], ['site', /site/i], ['details', /equipment/i], ['qty', /qty|quantity/i],
  ['type', /stretcher\s*type|type/i], ['make', /make|brand/i], ['model', /model/i], ['age', /age/i],
];

function findHeader(grid: GridRow[]): { index: number; cols: Record<Col, number> } {
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const vals = grid[i].values.map(clean);
    if (!vals.some((v) => /^city$/i.test(v))) continue;
    const cols = {} as Record<Col, number>;
    vals.forEach((v, idx) => {
      if (!v) return;
      for (const [col, re] of HEADER_PATTERNS) if (cols[col] === undefined && re.test(v)) { cols[col] = idx; break; }
    });
    const missing = HEADER_PATTERNS.map(([c]) => c).filter((c) => cols[c] === undefined);
    if (missing.length) throw new Error(`Header row found but columns missing: ${missing.join(', ')}`);
    return { index: i, cols };
  }
  throw new Error('Could not find the header row (expected a "City" column).');
}

// ----- make / model normalisation ----------------------------------------

interface MakeNorm { manufacturer: string | null; model: string | null; candidates: string[]; flags: DataFlag[] }

const MAKE_RULES: [RegExp, string, string | null][] = [
  [/vissco\s*superio/i, 'Vissco Rehabilitation Aids Pvt. Ltd.', 'Superio'],
  [/vissco/i, 'Vissco Rehabilitation Aids Pvt. Ltd.', null],
  [/mobile\s*hospital\s*designers|^(?:m-?)?h?d{1,2}ipl$|^mhddipl$/i, 'Mobile Hospital Designers & Developers (India) Pvt. Ltd.', null],
  [/med[\s-]*e?[\s-]*move|^med-e$|medemove/i, 'Med-e-Move', null],
  [/karma\s*fighter|^fighter$/i, 'Karma Healthcare', 'Fighter'],
  [/satpuda/i, 'Satpuda Engineering', null],
  [/resguardo/i, 'Resguardo Industries Pvt. Ltd.', null],
  [/invacare/i, 'Invacare', null],
  [/med\s*star/i, 'Med Star', null],
  [/fast\s*cure/i, 'Fast Cure', null],
  [/cosmocare/i, 'Cosmocare', null],
  [/easy\s*care/i, 'Easy Care', null],
  [/xieeh/i, 'XIEEH', null],
];

function canonicalMake(raw: string): { manufacturer: string; model: string | null } {
  const stripped = raw.replace(/\((?:metal|plastic)\s*built\)/i, '').trim();
  for (const [re, name, model] of MAKE_RULES) if (re.test(stripped)) return { manufacturer: name, model };
  return { manufacturer: stripped.replace(/\s+/g, ' '), model: null };
}

export function normalizeMake(raw: string): MakeNorm {
  const text = clean(raw).replace(/^[-–:\s]+|[-–:\s]+$/g, '');
  if (!text || NULLISH.test(text) || /not\s*available|taken\s*for\s*replacement/i.test(text)) {
    return { manufacturer: null, model: null, candidates: [], flags: ['MAKE_UNKNOWN'] };
  }
  const parts = text.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const candidates = [...new Set(parts.map((p) => canonicalMake(p).manufacturer))];
    return { manufacturer: null, model: null, candidates, flags: ['MAKE_AMBIGUOUS'] };
  }
  const c = canonicalMake(text);
  return { manufacturer: c.manufacturer, model: c.model, candidates: [], flags: [] };
}

function normalizeModel(raw: string): string | null {
  const t = clean(raw);
  if (!t || NULLISH.test(t) || /not\s*available/i.test(t)) return null;
  return t;
}

// ----- quantities embedded in free text -----------------------------------

interface Segment { make: string; count: number | null; balance: boolean }

/** Splits a make cell into segments, extracting embedded unit counts. */
export function parseMakeSegments(raw: string): Segment[] {
  const text = clean(raw);
  if (!text) return [{ make: '', count: null, balance: false }];
  return text.split(';').map((part) => {
    let s = part.trim();
    let count: number | null = null;
    let balance = false;
    let m: RegExpMatchArray | null;
    if ((m = s.match(/\((\d+)\s*no'?s?\.?\)/i))) { count = +m[1]; s = s.replace(m[0], ''); }
    else if ((m = s.match(/\(\s*balance\s*\)/i))) { balance = true; s = s.replace(m[0], ''); }
    else if ((m = s.match(/[-–]?\s*(\d+)\s*no'?s?\.?\s*$/i))) { count = +m[1]; s = s.slice(0, m.index); }
    else if ((m = s.match(/^(\d+)\s*nos?\.?\s*(?:are)?\s*[-–]?\s*/i))) { count = +m[1]; s = s.slice(m[0].length); }
    else if ((m = s.match(/^(\d+)\s+wheel\s*chairs?\s*[-–]?\s*/i))) { count = +m[1]; s = s.slice(m[0].length); }
    else if ((m = s.match(/^\d+\.\s+/))) { s = s.slice(m[0].length); } // "1. Med-e" is list numbering, not a count
    return { make: s.trim(), count, balance };
  });
}

/** Trailing count in the stretcher-type column: "Scoop Stretcher-6", "Clothe -2", "Stretcher - 23". */
export function parseTypeCount(raw: string): number | null {
  const m = clean(raw).match(/[-–]\s*(\d+)\s*[-–]?\s*$/);
  return m ? +m[1] : null;
}

export function classifyType(details: string, typeText: string): { type: EquipmentType; inferred: boolean } {
  const t = `${clean(typeText)}`.toLowerCase();
  const d = clean(details).toLowerCase();
  if (/wheel\s*chair/.test(d) && !t) return { type: 'wheelchair', inferred: false };
  if (/scoop/.test(t) || (!t && /scoop/.test(d))) return { type: 'scoop_stretcher', inferred: false };
  // "Clothe / Cloth / Clother stretcher" = canvas stretcher; canvas stretchers fold, so they use the foldable checklist.
  if (/cloth/.test(t) || (!t && /cloth/.test(d))) return { type: 'folding_stretcher', inferred: true };
  if (/fold/.test(t)) return { type: 'folding_stretcher', inferred: false };
  if (/wheel\s*chair/.test(d)) return { type: 'wheelchair', inferred: false };
  return { type: 'generic_stretcher', inferred: !/stretcher/.test(t) };
}

// ----- ageing -------------------------------------------------------------

interface AgeValue { years: number; months: number; days: number; ranged: boolean }
type AgeInfo =
  | { kind: 'unknown' }
  | { kind: 'date'; date: string; estimated: boolean }
  | { kind: 'age'; age: AgeValue }
  | { kind: 'split'; parts: { count: number; age: AgeValue }[] }
  | { kind: 'indexed'; parts: AgeValue[] }
  | { kind: 'ambiguous'; floorHint: string | null };

function parseAgeValue(s: string): AgeValue | null {
  const t = s.toLowerCase();
  let years = 0, months = 0, days = 0, found = false, ranged = false;
  const range = t.match(/(\d+)\s*[-–]\s*(\d+)\s*years?/);
  if (range) { years = Math.max(+range[1], +range[2]); ranged = true; found = true; }
  else {
    const y = t.match(/(\d+)\s*years?/); if (y) { years = +y[1]; found = true; }
  }
  const mo = t.match(/(\d+)\s*months?/); if (mo) { months = +mo[1]; found = true; }
  const d = t.match(/(\d+)\s*days?/); if (d) { days = +d[1]; found = true; }
  return found ? { years, months, days, ranged } : null;
}

export function parseAge(raw: string): AgeInfo {
  const text = clean(raw).replace(/\([^)]*\)/g, '').trim();
  if (!text || /^(?:not\s*available|na|n\/a)$/i.test(text)) return { kind: 'unknown' };
  let m: RegExpMatchArray | null;
  if ((m = text.match(/(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})/i)) && MONTHS[m[2].toLowerCase()]) {
    const mm = String(MONTHS[m[2].toLowerCase()]).padStart(2, '0');
    return { kind: 'date', date: `${m[3]}-${mm}-${m[1].padStart(2, '0')}`, estimated: false };
  }
  if ((m = text.match(/\b([a-z]{3})[a-z]*\s+(\d{4})/i)) && MONTHS[m[1].toLowerCase()]) {
    const mm = String(MONTHS[m[1].toLowerCase()]).padStart(2, '0');
    return { kind: 'date', date: `${m[2]}-${mm}-01`, estimated: true };
  }
  if (/floor/i.test(text)) {
    const ranges = text.split(';').map((p) => p.trim()).filter(Boolean);
    if (ranges.length === 1) {
      const age = parseAgeValue(ranges[0]);
      const hint = ranges[0].replace(/[-–]\s*\d+.*$/, '').trim();
      return age ? { kind: 'age', age: { ...age, ranged: false } } : { kind: 'ambiguous', floorHint: hint };
    }
    return { kind: 'ambiguous', floorHint: ranges.map((r) => r.replace(/[-–]\s*\d+.*$/, '').trim()).join(' / ') };
  }
  const splits = [...text.matchAll(/(\d+)\s*are\s*(\d+\s*(?:years?|months?))/gi)];
  if (splits.length) {
    return { kind: 'split', parts: splits.map((s) => ({ count: +s[1], age: parseAgeValue(s[2])! })) };
  }
  const indexed = [...text.matchAll(/\b(\d+)\s*[–-]\s*(\d+\s*(?:years?|months?))/gi)];
  if (indexed.length > 1 && /stretcher|unit|no\./i.test(text)) {
    return { kind: 'indexed', parts: indexed.map((s) => parseAgeValue(s[2])!) };
  }
  const age = parseAgeValue(text);
  return age ? { kind: 'age', age } : { kind: 'unknown' };
}

/** Finds a "Pkd On: 12 May 2023; 3 years, 2 months, 18 days" pair and returns the date the sheet was compiled. */
export function deriveAsOf(text: string): string | null {
  const t = clean(text);
  const date = parseAge(t.split(';')[0]);
  const rest = t.split(';').slice(1).join(';');
  const age = parseAgeValue(rest);
  if (date.kind !== 'date' || date.estimated || !age || !age.days) return null;
  const d = new Date(`${date.date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + age.years);
  d.setUTCMonth(d.getUTCMonth() + age.months);
  d.setUTCDate(d.getUTCDate() + age.days);
  return d.toISOString().slice(0, 10);
}

// ----- allocation ---------------------------------------------------------

/** Splits `total` across `n` slots as evenly as possible (earlier slots get the remainder). */
function spread(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
}

/** Gives each undeclared slot a share of what remains; declared counts are kept. */
function allocate(target: number, declared: (number | null)[]): { counts: number[]; reconciled: boolean } {
  const known = declared.reduce<number>((a, c) => a + (c ?? 0), 0);
  const unknownIdx = declared.map((c, i) => (c == null ? i : -1)).filter((i) => i >= 0);
  const counts = declared.map((c) => c ?? 0);
  let reconciled = false;
  if (unknownIdx.length) {
    let remaining = target - known;
    if (remaining < unknownIdx.length) { remaining = unknownIdx.length; reconciled = true; }
    spread(remaining, unknownIdx.length).forEach((n, k) => { counts[unknownIdx[k]] = n; });
  } else if (known !== target) {
    reconciled = true;
  }
  return { counts, reconciled };
}

export interface ImportOptions { sheetName?: string; asOfDate?: string }

export function importInventory(grid: GridRow[], opts: ImportOptions = {}): ImportResult {
  const sheet = opts.sheetName ?? 'Sheet';
  const { index, cols } = findHeader(grid);
  const issues: ImportIssue[] = [];
  const headerNames = grid[index].values.map(clean);
  let declaredTotal: number | null = null;

  interface Row { r: GridRow; city: string; site: string; details: string; qty: number | null; qtyKey: string; type: string; typeKey: string; make: string; model: string; age: string }
  const rows: Row[] = [];
  let lastCity = '', lastSite = '', lastDetails = '';
  for (const r of grid.slice(index + 1)) {
    const v = (c: Col) => clean(r.values[cols[c]]);
    if (/^total$/i.test(v('city'))) { const q = Number(r.values[cols.qty]); declaredTotal = Number.isFinite(q) ? q : null; break; }
    if (!r.values.some((x) => clean(x))) continue;
    const city = v('city') || lastCity;
    const site = v('site') || lastSite;
    if (site !== lastSite) lastDetails = '';
    const details = v('details') || lastDetails;
    lastCity = city; lastSite = site; lastDetails = details;
    const qtyRaw = r.values[cols.qty];
    const qty = qtyRaw == null || clean(qtyRaw) === '' ? null : Number(qtyRaw);
    rows.push({ r, city, site, details, qty: Number.isFinite(qty) ? qty : null, qtyKey: r.masters[cols.qty],
      type: v('type'), typeKey: r.masters[cols.type], make: v('make'), model: v('model'), age: v('age') });
  }

  let asOf = opts.asOfDate ?? null;
  let asOfFrom: string | null = null;
  if (!asOf) {
    for (const row of rows) { const d = deriveAsOf(row.age); if (d) { asOf = d; asOfFrom = `Row ${row.r.row}: "${row.age}"`; break; } }
  }
  asOf ??= new Date().toISOString().slice(0, 10);

  // Group rows that share one quantity cell (merged ranges). A row with an empty, unmerged quantity joins the previous group of the same site.
  const groups: Row[][] = [];
  for (const row of rows) {
    const prev = groups.at(-1);
    const prevRow = prev?.at(-1);
    if (prev && prevRow && prevRow.site === row.site && (row.qtyKey === prevRow.qtyKey || row.qty == null)) prev.push(row);
    else groups.push([row]);
  }

  const units: ImportedUnit[] = [];
  for (const g of groups) {
    const qty = g[0].qty;
    // blocks: rows sharing a stretcher-type cell
    const blocks: Row[][] = [];
    for (const row of g) {
      const prev = blocks.at(-1);
      if (prev && row.type && prev[0].typeKey === row.typeKey) prev.push(row);
      else blocks.push([row]);
    }
    const blockSegs = blocks.map((b) => b.map((row) => parseMakeSegments(row.make)));
    const blockDeclared = blocks.map((b, bi) => {
      const fromType = parseTypeCount(b[0].type);
      if (fromType != null) return fromType;
      const segs = blockSegs[bi].flat();
      return segs.every((s) => s.count != null) ? segs.reduce((a, s) => a + (s.count ?? 0), 0) : null;
    });
    const target = qty ?? blockDeclared.reduce<number>((a, c) => a + (c ?? 1), 0);
    if (qty == null) issues.push({ row: g[0].r.row, level: 'warning', message: `No quantity for ${g[0].site}; used ${target} from line items.` });
    const { counts: blockCounts, reconciled: groupRec } = allocate(target, blockDeclared);
    if (groupRec) issues.push({ row: g[0].r.row, level: 'warning',
      message: `${g[0].site} ${g[0].details}: quantity ${qty} does not match line items (${blockDeclared.map((c) => c ?? '?').join(' + ')}); kept line-item counts.` });

    blocks.forEach((block, bi) => {
      // segments across all rows of the block, each carrying its row
      const segs = block.flatMap((row, ri) => blockSegs[bi][ri].map((s, si) => ({ row, s, si, rowSegCount: blockSegs[bi][ri].length })));
      const declared = segs.map(({ s }) => (s.balance ? null : s.count));
      const { counts, reconciled } = allocate(blockCounts[bi], declared);
      segs.forEach(({ row, s, si, rowSegCount }, k) => {
        const n = counts[k];
        const { type, inferred } = classifyType(row.details, row.type);
        const make = normalizeMake(s.make);
        const model = normalizeModel(row.model);
        const ageParts = row.age.split(';');
        const ageText = rowSegCount > 1 && ageParts.length === rowSegCount ? ageParts[si] : row.age;
        const age = parseAge(ageText);
        const taken = /taken\s*for\s*replacement/i.test(s.make);
        const raw: Record<string, string> = {};
        row.r.values.forEach((val, idx) => { if (headerNames[idx] && clean(val)) raw[headerNames[idx]] = clean(val); });
        const cityMatch = row.city.match(/^(.*?)\s*\((.*)\)\s*$/);
        let unitIdx = 0;
        for (let u = 0; u < n; u++) {
          const flags = new Set<DataFlag>([...make.flags, 'SERIAL_MISSING', 'FLOOR_UNASSIGNED']);
          if (!model && !make.model) flags.add('MODEL_UNKNOWN');
          if (inferred) flags.add('TYPE_INFERRED');
          if (reconciled || groupRec) flags.add('QTY_RECONCILED');
          if (taken) flags.add('TAKEN_FOR_REPLACEMENT');
          let installDate: string | null = null, estimated = false, floorHint: string | null = null;
          const fromAge = (a: AgeValue) => { installDate = subtractAge(asOf!, a.years, a.months, a.days); estimated = true; flags.add('AGE_ESTIMATED'); if (a.ranged) flags.add('AGE_AMBIGUOUS'); };
          switch (age.kind) {
            case 'unknown': flags.add('AGE_UNKNOWN'); break;
            case 'date': installDate = age.date; estimated = age.estimated; if (age.estimated) flags.add('AGE_ESTIMATED'); break;
            case 'age': fromAge(age.age); break;
            case 'split': {
              let acc = 0; const part = age.parts.find((p) => (acc += p.count) > unitIdx);
              part ? fromAge(part.age) : flags.add('AGE_UNKNOWN');
              break;
            }
            case 'indexed': age.parts[unitIdx] ? fromAge(age.parts[unitIdx]) : flags.add('AGE_UNKNOWN'); break;
            case 'ambiguous': flags.add('AGE_AMBIGUOUS'); flags.add('AGE_UNKNOWN'); floorHint = age.floorHint; break;
          }
          if (age.kind === 'age' && /floor/i.test(ageText)) floorHint = ageText.replace(/[-–]\s*\d+.*$/, '').trim();
          units.push({
            key: `${row.r.row}:${si}:${u}`,
            city: cityMatch ? cityMatch[1] : row.city,
            cityNote: cityMatch ? cityMatch[2] : null,
            site: row.site,
            equipmentType: type,
            manufacturer: make.manufacturer,
            model: model ?? make.model,
            candidateMakes: make.candidates,
            installDate, installDateEstimated: estimated,
            ageRaw: ageText || null,
            floorHint,
            status: taken ? 'out_of_service' : 'in_service',
            statusReason: taken ? 'Inventory notes this unit was taken for replacement' : null,
            dataFlags: [...flags],
            source: { sheet, row: row.r.row, raw },
          });
          unitIdx++;
        }
      });
    });
  }

  if (declaredTotal != null && declaredTotal !== units.length)
    issues.push({ row: 0, level: 'warning', message: `Sheet total is ${declaredTotal} but ${units.length} units were produced.` });

  const siteMap = new Map<string, { city: string; site: string; count: number }>();
  for (const u of units) {
    const k = `${u.city}|${u.site}`;
    siteMap.set(k, { city: u.city, site: u.site, count: (siteMap.get(k)?.count ?? 0) + 1 });
  }
  return { units, issues, asOfDate: asOf, asOfDerivedFrom: asOfFrom, declaredTotal, sites: [...siteMap.values()] };
}
