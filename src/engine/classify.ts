import {
  ACK_WORDS_RE,
  AUTOCOMPLETE,
  CHOICE_KINDS,
  EXPORT_ACK_RE,
  FREE_TEXT_RE,
  RULES,
  SANCTIONED_RE,
  SENSITIVE_RE,
  US_PERSON_DETAIL_RE,
  US_PERSON_RE,
  type Rule,
  type Section,
} from './dictionary';
import { clean } from './label';
import { EDU_TYPES, WORK_TYPES, type Classified, type Field, type FieldType } from './types';

const WORK_RE = /work\s*experience|employment|work\s*history|experience|\bjobs?\b|employer/i;
const EDU_RE = /education|school|universit|academic/i;
const SECTION_DEPTH = 8;

function attrText(el: Element): string {
  return ['id', 'class', 'data-automation-id', 'aria-label', 'data-section', 'name']
    .map((a) => el.getAttribute(a) ?? '')
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Is this control inside a work-history or education block? */
export function sectionOf(el: Element): Section {
  let node: Element | null = el.parentElement;
  for (let i = 0; i < SECTION_DEPTH && node && node.tagName !== 'BODY'; i++, node = node.parentElement) {
    const attrs = attrText(node);
    if (EDU_RE.test(attrs)) return 'education';
    if (WORK_RE.test(attrs)) return 'work';
    const heading = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > [role="heading"]');
    const text = clean(heading?.textContent);
    if (text && text.length < 60) {
      if (EDU_RE.test(text)) return 'education';
      if (WORK_RE.test(text)) return 'work';
    }
  }
  return null;
}

function datePart(f: Field): 'month' | 'year' | undefined {
  const s = `${f.label} ${f.hints}`.toLowerCase();
  const month = /\bmonth\b|\bmm\b/.test(s);
  const year = /\byear\b|\byyyy\b/.test(s);
  if (month && !year) return 'month';
  if (year && !month) return 'year';
  return undefined;
}

function ruleScore(rule: Rule, f: Field, section: Section): number {
  if (rule.kinds && !rule.kinds.includes(f.kind)) return 0;
  if (!rule.kinds && f.kind === 'file') return 0;
  if (rule.section === 'none' && section) return 0;
  if (rule.section && rule.section !== 'none' && rule.section !== section) return 0;
  if (rule.not?.test(f.label)) return 0;
  const byLabel = !!(rule.label && f.label && rule.label.test(f.label));
  const byHint = !!(rule.hint && f.hints && rule.hint.test(f.hints));
  if (byLabel && byHint) return 0.95;
  if (byLabel) return 0.9;
  // A hint alone is weaker, and ignored when the visible label clearly says something else.
  if (byHint) return f.label ? 0.6 : 0.75;
  return 0;
}

/** Citizenship / export-control questions get their own types; see SENSITIVE_TYPES. */
function sensitiveType(f: Field): FieldType | null {
  if (f.kind === 'file') return null;
  const options = (f.choices ?? []).map((c) => c.label).join(' ');
  const ackKind = f.kind === 'radio' || f.kind === 'checkbox' || f.kind === 'checkboxGroup';
  if (ackKind && (EXPORT_ACK_RE.test(f.label) || EXPORT_ACK_RE.test(options)) && (ACK_WORDS_RE.test(options) || ACK_WORDS_RE.test(f.label))) {
    return 'exportControlAck';
  }
  if (SANCTIONED_RE.test(f.label)) return 'sanctionedCountry';
  if (US_PERSON_RE.test(f.label) && US_PERSON_DETAIL_RE.test(f.label)) return 'usPerson';
  if (SENSITIVE_RE.test(f.label)) return 'sensitive';
  return null;
}

const TEXTY = new Set(['text', 'textarea', 'contenteditable']);
/** Profile facts that are legitimately long-form and can live in a textarea. */
const TEXTAREA_OK = new Set<FieldType>(['street', 'skills', 'workDescription', 'languages', 'certifications']);

export function classifyOne(f: Field, extraRules: Rule[] = []): Omit<Classified, 'ordinal'> {
  const section = sectionOf(f.el);

  const sensitive = sensitiveType(f);
  if (sensitive) return { ...f, type: sensitive, confidence: 0.95, datePart: undefined };

  const auto = f.autocomplete.split(/\s+/).pop() ?? '';
  if (AUTOCOMPLETE[auto] && f.kind !== 'file') {
    return { ...f, type: AUTOCOMPLETE[auto], confidence: 0.95, datePart: datePart(f) };
  }

  let best: { type: FieldType; confidence: number } = { type: 'unknown', confidence: 0 };
  for (const rule of [...extraRules, ...RULES]) {
    const s = ruleScore(rule, f, section);
    if (s > best.confidence) best = { type: rule.type, confidence: s };
  }

  // Unlabelled file inputs are almost always the resume.
  if (f.kind === 'file' && best.type === 'unknown') best = { type: 'resume', confidence: 0.6 };

  // Open-ended prompts in text boxes are the user's to write.
  if (TEXTY.has(f.kind)) {
    const openQuestion = FREE_TEXT_RE.test(f.label);
    const longBox = f.kind !== 'text' || f.maxLength > 500;
    const factFits = best.confidence >= 0.6 && (f.kind === 'text' || TEXTAREA_OK.has(best.type));
    if (openQuestion && !(best.type === 'workDescription' && section === 'work')) {
      best = { type: 'freeText', confidence: 0.9 };
    } else if (longBox && !factFits) {
      best = { type: 'freeText', confidence: 0.7 };
    }
  }

  // Yes/no questions only make sense as choices; a text box mentioning "sponsor" is a sentence prompt.
  if (
    (best.type === 'workAuthorized' || best.type === 'needsSponsorship' || best.type === 'over18' || best.type === 'hispanic') &&
    !CHOICE_KINDS.has(f.kind) &&
    f.kind !== 'text'
  ) {
    best = { type: 'freeText', confidence: 0.7 };
  }

  return { ...f, type: best.type, confidence: best.confidence, datePart: datePart(f) };
}

export function classifyAll(fields: Field[], extraRules: Rule[] = []): Classified[] {
  const counts = new Map<string, number>();
  return fields.map((f) => {
    const c = classifyOne(f, extraRules);
    const repeating = WORK_TYPES.has(c.type) || EDU_TYPES.has(c.type);
    const key = `${c.type}:${c.datePart ?? ''}`;
    const ordinal = repeating ? (counts.get(key) ?? 0) : 0;
    counts.set(key, ordinal + 1);
    return { ...c, ordinal };
  });
}
