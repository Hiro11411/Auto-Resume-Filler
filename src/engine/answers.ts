import type { Answers } from '../profile/schema';
import { ACK_WORDS_RE } from './dictionary';
import { norm } from './match';
import type { Classified, FieldKind } from './types';
import { widgetFor } from './widgets';

/**
 * Remembered answers: when the user answers a custom question the rules don't
 * know ("Are you open to hybrid work?"), the answer is saved and reused the next
 * time the same question (same wording, same options) shows up.
 *
 * Only `unknown` fields qualify. That excludes, by construction, every profile
 * fact, free-text prompt and citizenship / export-control / work-authorization
 * question (those get their own types before `unknown` is ever assigned). Consent
 * wording and single checkboxes are excluded on top of that, so a remembered
 * answer can never agree to terms for the user.
 */

const REMEMBER_KINDS: ReadonlySet<FieldKind> = new Set(['text', 'select', 'radio', 'checkboxGroup', 'combobox', 'listbox']);
const CONSENT_RE = /\bagree|consent|\bterms\b|privacy|acknowledg|certif|attest|\bconfirm|i\s*understand|true\s*and\s*(complete|correct|accurate)|signature|\bsign\b|e-?sign/i;
/** Longer than this is a sentence, not a reusable answer. */
const MAX_TEXT = 200;

export function answerKey(f: Classified): string | null {
  const label = norm(f.label);
  if (label.length < 3) return null;
  const options = (f.kind === 'select' ? [...(f.el as HTMLSelectElement).options].map((o) => o.text) : (f.choices ?? []).map((c) => c.label))
    .map(norm)
    .filter(Boolean)
    .sort();
  return `${f.kind === 'textarea' ? 'text' : f.kind}|${label}|${options.join('/')}`;
}

export function canRemember(f: Classified): boolean {
  if (f.type !== 'unknown' || !REMEMBER_KINDS.has(f.kind)) return false;
  if (f.inputType === 'email' || f.inputType === 'tel' || f.inputType === 'password') return false;
  const options = (f.choices ?? []).map((c) => c.label).join(' ');
  return !CONSENT_RE.test(f.label) && !ACK_WORDS_RE.test(f.label) && !ACK_WORDS_RE.test(options);
}

/** The user's current answer if it's one worth saving, else null. */
export function readAnswer(f: Classified): string | null {
  if (!canRemember(f)) return null;
  const v = widgetFor(f).read(f);
  if (!v || (f.kind === 'text' && v.length > MAX_TEXT)) return null;
  return v;
}

export function savedAnswer(f: Classified, answers: Answers | undefined): string | null {
  if (!answers || !canRemember(f)) return null;
  const key = answerKey(f);
  return (key && answers[key]?.value) || null;
}
