/** Fuzzy matching of a profile value against a list of option labels. */

/** Lower-case, no accents or punctuation, "Bachelor’s" → "bachelor". */
export function norm(s: string): string {
  return s
    .replace(/[’‘`´]/g, "'")
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

const PLACEHOLDER_RE = /^(select|choose|please select|pick|--+|—|none selected|select one|select an option)\b/i;

export function isPlaceholderOption(label: string): boolean {
  const t = label.trim();
  return !t || PLACEHOLDER_RE.test(t);
}

const NEGATIVE_RE = /\b(no|not|don t|do not|won t|will not|never|n a|none|neither)\b/;
const DECLINE_RE = /decline|prefer not|not wish|don t wish|do not wish|choose not|not to (answer|disclose|say|self identify)|rather not/;

const ALIASES: Record<string, string[]> = {
  'united states': ['us', 'usa', 'u s', 'united states of america', 'america'],
  'united kingdom': ['uk', 'great britain', 'england', 'gb'],
  bachelor: ['bachelors', 'bs', 'ba', 'b s', 'b a', 'bsc', 'b sc', 'bachelor of science', 'bachelor of arts', 'undergraduate'],
  master: ['masters', 'ms', 'ma', 'm s', 'm a', 'msc', 'm sc', 'master of science', 'master of arts', 'graduate'],
  doctorate: ['phd', 'ph d', 'doctor', 'doctoral'],
  associate: ['associates', 'aa', 'as'],
  male: ['man', 'm'],
  female: ['woman', 'f'],
};

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

function variants(value: string): string[] {
  const v = norm(value);
  const out = new Set([v]);
  for (const [canon, alts] of Object.entries(ALIASES)) {
    if (v === canon || alts.includes(v) || v.startsWith(canon + ' ') || alts.some((a) => v.startsWith(a + ' '))) {
      out.add(canon);
      alts.forEach((a) => out.add(a));
    }
  }
  const upper = value.trim().toUpperCase();
  if (US_STATES[upper]) out.add(norm(US_STATES[upper]));
  for (const [abbr, name] of Object.entries(US_STATES)) if (norm(name) === v) out.add(abbr.toLowerCase());
  // "Boston, MA" should also match suggestions written "Boston, Massachusetts, United States".
  const expanded = value.replace(/\b([A-Z]{2})\b/g, (m) => US_STATES[m] ?? m);
  if (expanded !== value) out.add(norm(expanded));
  return [...out];
}

function tokenScore(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((t) => t.length > 1));
  const tb = new Set(b.split(' ').filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => tb.has(t) && inter++);
  return inter / Math.max(ta.size, tb.size);
}

/** Every word of the value appears in the option; fewer extra words scores higher. */
function subsetScore(o: string, v: string): number {
  const vt = v.split(' ').filter((t) => t.length > 1);
  const ot = new Set(o.split(' '));
  if (vt.length < 2 || !vt.every((t) => ot.has(t))) return 0;
  return 0.75 + 0.1 * (vt.length / ot.size);
}

function scoreText(option: string, value: string): number {
  const o = norm(option);
  if (!o) return 0;
  let best = 0;
  for (const v of variants(value)) {
    if (!v) continue;
    if (o === v) return 1;
    let s = 0;
    if (v.length >= 2 && (o.startsWith(v + ' ') || v.startsWith(o + ' '))) s = 0.85;
    else if (v.length >= 3 && (` ${o} `.includes(` ${v} `) || ` ${v} `.includes(` ${o} `))) s = 0.75;
    else s = Math.max(tokenScore(o, v) * 0.8, subsetScore(o, v));
    best = Math.max(best, s);
  }
  return best;
}

function scoreYesNo(option: string, yes: boolean): number {
  const o = norm(option);
  if (/^yes\b/.test(o)) return yes ? 1 : 0;
  if (/^no\b/.test(o)) return yes ? 0 : 1;
  if (DECLINE_RE.test(o)) return 0;
  const negative = NEGATIVE_RE.test(o);
  return yes === !negative ? 0.7 : 0;
}

export interface Match {
  index: number;
  score: number;
}

export function bestOption(options: string[], value: string): Match {
  const yn = value === 'yes' || value === 'no';
  const wantsDecline = DECLINE_RE.test(norm(value));
  let best: Match = { index: -1, score: 0 };
  options.forEach((label, index) => {
    if (isPlaceholderOption(label)) return;
    let score: number;
    if (yn) score = scoreYesNo(label, value === 'yes');
    else if (wantsDecline) score = DECLINE_RE.test(norm(label)) ? 0.95 : 0;
    else score = scoreText(label, value);
    if (score > best.score) best = { index, score };
  });
  return best.score >= 0.5 ? best : { index: -1, score: best.score };
}
