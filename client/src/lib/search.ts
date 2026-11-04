/**
 * Forgiving search over sites and units, run on the device (works offline, instant on every key).
 *
 *  - Any order, any separators: "nkp wc 4", "NKP-WC-004", "wc004 nkp" all find JLL-NKP-WC-004.
 *  - Numbers ignore leading zeros: "4" matches "004"; "00" while typing still matches.
 *  - Partial words and typos: "whee", "wheelchiar", "bengalru"; common names: Bangalore, Bombay.
 *  - Every word typed must match something (tag, site, city, type, make, model, serial, floor, location).
 *  - Best match first: exact tag, then tag words, then site, then the rest.
 */
import { EQUIPMENT_LABELS, type Asset, type Building, type Floor, type Location } from '@think/shared';

/** Lower-case words, accents removed, letters and digits split ("wc004" -> "wc", "004"). */
export function words(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Names people use that differ from the records. */
const ALIASES: Record<string, string[]> = {
  bengaluru: ['bangalore', 'blr', 'banglore'],
  mumbai: ['bombay'],
  gandhinagar: ['gift', 'gujarat'],
  wheelchair: ['wc', 'chair', 'wheel'],
  scoop: ['ss'],
  foldable: ['fs', 'folding', 'fold'],
};
const aliasWords = (ws: string[]) => ws.flatMap((w) => ALIASES[w] ?? []);

/** Damerau-Levenshtein distance, stopping early once it exceeds max. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const isNum = (s: string) => /^\d+$/.test(s);

/** How well one typed word matches one stored word: 0 (no) to 1 (exact). */
function wordScore(q: string, w: string): number {
  if (q === w) return 1;
  if (isNum(q) && isNum(w)) {
    if (Number(q) === Number(w)) return 1; // "4" = "004"
    if (w.startsWith(q)) return 0.6; // still typing "00"
    return 0;
  }
  if (w.startsWith(q)) return q.length === 1 ? 0.45 : 0.8;
  if (q.length >= 4 && !isNum(q)) {
    const max = q.length >= 8 ? 2 : 1;
    // Compare against the whole word and against its start (typo while still typing).
    const dWhole = distance(q, w, max);
    const dPrefix = w.length > q.length ? distance(q, w.slice(0, q.length), max) : dWhole;
    const dd = Math.min(dWhole, dPrefix);
    if (dd <= max) return dd === 1 ? 0.55 : 0.4;
  }
  return 0;
}

interface Field { words: string[]; weight: number }
export interface Hit<T> { item: T; score: number }

function scoreFields(qWords: string[], fields: Field[]): number {
  let total = 0;
  for (const q of qWords) {
    let best = 0;
    for (const f of fields) for (const w of f.words) {
      const s = wordScore(q, w) * f.weight;
      if (s > best) best = s;
    }
    if (best === 0) return 0; // every typed word must match something
    total += best;
  }
  return total;
}

export interface SearchIndex {
  sites: { b: Building; fields: Field[] }[];
  units: { a: Asset; tag: string; fields: Field[] }[];
}

export function buildIndex(data: { buildings: Building[]; assets: Asset[]; floors: Floor[]; locations: Location[] }): SearchIndex {
  const bById = new Map(data.buildings.map((b) => [b.id, b]));
  const fById = new Map(data.floors.map((f) => [f.id, f]));
  const lById = new Map(data.locations.map((l) => [l.id, l]));
  return {
    sites: data.buildings.map((b) => {
      const name = words(b.name), city = words(b.city);
      return { b, fields: [
        // the name as one word too, so "bluebay" or "etvparcel9" still find it
        { words: [...name, compact(b.name)], weight: 2.2 }, { words: [...city, ...aliasWords(city)], weight: 1.6 },
        { words: words(b.code), weight: 1.4 },
      ] };
    }),
    units: data.assets.filter((a) => a.status !== 'removed').map((a) => {
      const b = bById.get(a.buildingId);
      const type = words(EQUIPMENT_LABELS[a.equipmentType]);
      const city = words(b?.city);
      return {
        a, tag: compact(a.assetTag),
        fields: [
          { words: words(a.assetTag), weight: 3 },
          { words: [...type, ...aliasWords(type)], weight: 1.5 },
          { words: [...words(b?.name), compact(b?.name ?? '')], weight: 1.4 },
          { words: [...city, ...aliasWords(city)], weight: 1 },
          { words: [...words(a.manufacturer), ...words(a.model), ...a.candidateMakes.flatMap(words)], weight: 1.1 },
          { words: words(a.serialNumber), weight: 2 },
          { words: [...words(a.floorId ? fById.get(a.floorId)?.name : ''), ...words(a.locationId ? lById.get(a.locationId)?.name : '')], weight: 1 },
        ],
      };
    }),
  };
}

export function search(index: SearchIndex, query: string, limits = { sites: 4, units: 8 }) {
  const qWords = words(query);
  const qCompact = compact(query);
  if (!qWords.length) return { sites: [] as Hit<Building>[], units: [] as Hit<Asset>[], totalUnits: 0 };

  const sites = index.sites
    .map(({ b, fields }) => ({ item: b, score: scoreFields(qWords, fields) }))
    .filter((h) => h.score > 0)
    .sort((x, y) => y.score - x.score || x.item.name.localeCompare(y.item.name));

  const units = index.units
    .map(({ a, tag, fields }) => {
      let score = scoreFields(qWords, fields);
      // Typed (part of) the tag as one block, e.g. "NKP-WC-004" or "nkpwc004"
      if (qCompact.length >= 3 && tag.includes(qCompact)) score = Math.max(score, 1) + (tag === qCompact ? 20 : tag.endsWith(qCompact) ? 8 : 5);
      return { item: a, score };
    })
    .filter((h) => h.score > 0)
    .sort((x, y) => y.score - x.score || x.item.assetTag.localeCompare(y.item.assetTag, undefined, { numeric: true }));

  // A unit-specific query (it contains a number) shows units before sites.
  return { sites: sites.slice(0, /\d/.test(query) ? 2 : limits.sites), units: units.slice(0, limits.units), totalUnits: units.length };
}

/** True when every word of the query matches the text (used by the simple list filters). */
export function textMatches(query: string, ...texts: (string | null | undefined)[]): boolean {
  const qWords = words(query);
  if (!qWords.length) return true;
  const ws = texts.flatMap(words);
  const all = [...ws, ...aliasWords(ws)];
  return qWords.every((q) => all.some((w) => wordScore(q, w) > 0)) || compact(texts.join('')).includes(compact(query));
}

/** Highlights the parts of a title that match the typed words. */
export function highlight(title: string, query: string): { text: string; on: boolean }[] {
  const qWords = words(query);
  if (!qWords.length) return [{ text: title, on: false }];
  return title.split(/([^A-Za-z0-9]+)/).filter(Boolean).flatMap((part) => {
    if (!/[A-Za-z0-9]/.test(part)) return [{ text: part, on: false }];
    // Split mixed chunks like "WC004" so each piece can light up separately.
    // (No look-behind regex: older iPhones cannot parse it.)
    return (part.match(/[A-Za-z]+|\d+/g) ?? [part]).map((p) => ({ text: p, on: qWords.some((q) => wordScore(q, p.toLowerCase()) >= 0.55) }));
  });
}

/* Recently opened sites, remembered on this device */
const RECENT_SITES = 'think.recentSites';
export function rememberSite(id: string) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_SITES) ?? '[]') as string[];
    localStorage.setItem(RECENT_SITES, JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, 4)));
  } catch { /* storage blocked */ }
}
export function recentSites(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_SITES) ?? '[]') as string[]; } catch { return []; }
}

/* Recently opened units, remembered on this device */
const RECENT_KEY = 'think.recentUnits';
export function rememberUnit(id: string) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, 6)));
  } catch { /* storage blocked */ }
}
export function recentUnits(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; }
}
