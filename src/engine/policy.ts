import type { Answers, FilesMeta, Profile, Settings } from '../profile/schema';
import { savedAnswer } from './answers';
import { QUESTION_TYPES, SENSITIVE_TYPES, type Classified, type Status } from './types';
import { valueFor } from './values';
import { widgetFor } from './widgets';

/** Below this, a fill is shown as "check this" rather than plain "filled". */
export const CONFIDENT = 0.75;

export type Decision =
  | { action: 'fill'; value: string; confident: boolean; note?: string }
  | { action: 'skip'; status: Exclude<Status, 'filled' | 'check' | 'answered'>; note?: string };

export const SENSITIVE_NOTE = 'Citizenship / export-control question. Only filled from your saved profile, never guessed.';
export const SAVED_NOTE = 'Your answer from an earlier application.';

export function hasValue(f: Classified): boolean {
  return widgetFor(f).hasValue(f);
}

/**
 * The user's fill policy:
 * - profile facts are filled;
 * - free-text prompts are always left empty for the user;
 * - optional screening questions are left empty unless `fillOptional` is on;
 * - citizenship / export-control / work-authorization questions come only from
 *   saved profile answers; with none they stay empty and are flagged;
 * - custom questions the user answered before reuse that answer (shown as "check");
 * - nothing the page (or the user) already filled is overwritten.
 */
export function decide(f: Classified, profile: Profile, settings: Settings, files: FilesMeta, answers?: Answers): Decision {
  if (hasValue(f)) return { action: 'skip', status: 'prefilled' };
  if (f.type === 'freeText') return { action: 'skip', status: 'freeText' };
  if (f.type === 'unknown') {
    const saved = settings.rememberAnswers ? savedAnswer(f, answers) : null;
    if (saved) return { action: 'fill', value: saved, confident: false, note: SAVED_NOTE };
    return { action: 'skip', status: f.required ? 'missing' : 'ignored' };
  }

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
