import { isVisible } from './discover';
import type { Classified } from './types';

const ERROR_CLASS_RE = /(^|[\s_-])(has-error|error|invalid|is-invalid)($|[\s_-])/i;
const ERROR_TEXT_SELECTOR = '.error-message, [role="alert"], .invalid-feedback, [class*="error-text"], [class*="errorMessage"], [class*="field-error"]';
/** How far up to look for the question's container. */
const CONTAINER_DEPTH = 5;

function nativeReason(input: HTMLInputElement): string | null {
  const v = input.validity;
  if (!v || v.valid) return null;
  if (v.valueMissing) return 'still empty';
  if (v.typeMismatch || v.patternMismatch) return `format not accepted (${input.validationMessage || 'pattern'})`;
  if (v.tooLong || v.tooShort) return 'wrong length';
  if (v.rangeOverflow || v.rangeUnderflow || v.stepMismatch) return 'value out of range';
  if (v.customError) return input.validationMessage || 'rejected by the page';
  return input.validationMessage || 'invalid';
}

function containerReason(el: HTMLElement): string | null {
  let node: HTMLElement | null = el;
  for (let i = 0; i < CONTAINER_DEPTH && node && node.tagName !== 'FORM'; i++, node = node.parentElement) {
    if (node !== el && ERROR_CLASS_RE.test(node.className && typeof node.className === 'string' ? node.className : '')) {
      return 'page marks the question as an error';
    }
    const msg = node.querySelector<HTMLElement>(ERROR_TEXT_SELECTOR);
    const text = msg && isVisible(msg) ? (msg.textContent ?? '').trim() : '';
    if (text) return `page says: "${text.slice(0, 120)}"`;
  }
  return null;
}

/**
 * Does the page still consider this field invalid? Reads constraint validation
 * state (`validity`, which fires no events), `aria-invalid`, and error classes or
 * messages around the question. Returns a short reason, or null when it looks fine.
 */
export function invalidReason(f: Classified): string | null {
  const inputs = (f.choices?.map((c) => c.el) ?? [f.el]) as HTMLInputElement[];
  for (const input of inputs) {
    if (input.getAttribute('aria-invalid') === 'true') return 'page marks the field invalid (aria-invalid)';
  }
  // A radio group is valid once any option is checked; checking one input covers the group.
  const native = nativeReason(inputs[0]);
  if (native) return native;
  return containerReason(f.anchor);
}
