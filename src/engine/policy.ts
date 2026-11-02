import type { Files, Profile, Settings } from '../profile/schema';
import { selectIsEmpty } from './widgets/choice';
import { comboboxHasValue, listboxHasValue } from './widgets/combobox';
import { QUESTION_TYPES, SENSITIVE_TYPES, type Classified, type Status } from './types';
import { valueFor } from './values';

/** Below this, a fill is shown as "check this" rather than plain "filled". */
export const CONFIDENT = 0.75;

export type Decision =
  | { action: 'fill'; value: string; confident: boolean }
  | { action: 'skip'; status: Exclude<Status, 'filled' | 'check' | 'answered'>; note?: string };

export const SENSITIVE_NOTE = 'Citizenship / export-control question. Only filled from your saved profile, never guessed.';

export function hasValue(f: Classified): boolean {
  const el = f.el as HTMLInputElement;
  switch (f.kind) {
    case 'text':
    case 'textarea':
      return el.value.trim() !== '';
    case 'contenteditable':
      return (f.el.textContent ?? '').trim() !== '';
    case 'select':
      return !selectIsEmpty(f.el as HTMLSelectElement);
    case 'radio':
    case 'checkboxGroup':
      return (f.choices ?? []).some((c) => (c.el as HTMLInputElement).checked);
    case 'checkbox':
      return el.checked;
    case 'combobox':
      return comboboxHasValue(el);
    case 'listbox':
      return listboxHasValue(f.el);
    case 'file':
      return (el.files?.length ?? 0) > 0;
  }
}

/**
 * The user's fill policy:
 * - profile facts are filled;
 * - free-text prompts are always left empty for the user;
 * - optional screening questions are left empty unless `fillOptional` is on;
 * - citizenship / export-control / work-authorization questions come only from
 *   saved profile answers; with none they stay empty and are flagged;
 * - nothing the page (or the user) already filled is overwritten.
 */
export function decide(f: Classified, profile: Profile, settings: Settings, files: Files): Decision {
  if (hasValue(f)) return { action: 'skip', status: 'prefilled' };
  if (f.type === 'freeText') return { action: 'skip', status: 'freeText' };
  if (f.type === 'unknown') return { action: 'skip', status: f.required ? 'missing' : 'ignored' };

  if (SENSITIVE_TYPES.has(f.type)) {
    const value = valueFor(f, profile);
    // Flag even optional ones: a blank legal answer should always be the user's call.
    if (!value) return { action: 'skip', status: 'missing', note: SENSITIVE_NOTE };
    return { action: 'fill', value, confident: true };
  }

  if (f.type === 'resume' || f.type === 'coverLetter') {
    const file = f.type === 'resume' ? files.resume : files.coverLetter;
    if (!file) return { action: 'skip', status: f.required ? 'missing' : 'ignored' };
    return { action: 'fill', value: file.name, confident: f.confidence >= CONFIDENT };
  }

  if (QUESTION_TYPES.has(f.type) && !f.required && !settings.fillOptional) {
    return { action: 'skip', status: 'optional' };
  }

  const value = valueFor(f, profile);
  if (!value) return { action: 'skip', status: f.required ? 'missing' : 'ignored' };
  return { action: 'fill', value, confident: f.confidence >= CONFIDENT };
}
