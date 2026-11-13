import { bestOption, isPlaceholderOption, type Match } from '../match';
import type { Classified } from '../types';
import { fireInput, setNativeValue } from './native';

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Try the value plus alternate spellings (May → 05 → 5). */
export function bestOfValues(options: string[], value: string): Match {
  const tries = [value];
  const mi = MONTH_NAMES.indexOf(value.toLowerCase());
  if (mi >= 0) tries.push(String(mi + 1).padStart(2, '0'), String(mi + 1), value.slice(0, 3));
  let best: Match = { index: -1, score: 0 };
  for (const v of tries) {
    const m = bestOption(options, v);
    if (m.score > best.score) best = m;
  }
  return best.index >= 0 ? best : { index: -1, score: 0 };
}

export function fillSelect(el: HTMLSelectElement, value: string): number {
  const labels = [...el.options].map((o) => o.text || o.value);
  const m = bestOfValues(labels, value);
  if (m.index < 0) {
    // Fall back to matching option values (country codes etc.).
    const byValue = bestOfValues([...el.options].map((o) => o.value), value);
    if (byValue.index < 0) return 0;
    Object.assign(m, byValue);
  }
  setNativeValue(el, el.options[m.index].value);
  fireInput(el);
  return m.score;
}

export function selectIsEmpty(el: HTMLSelectElement): boolean {
  if (el.multiple) return el.selectedOptions.length === 0;
  const opt = el.selectedOptions[0];
  return !opt || opt.value === '' || (el.selectedIndex === 0 && isPlaceholderOption(opt.text));
}

export function fillRadioGroup(f: Classified, value: string): number {
  const choices = f.choices ?? [];
  const m = bestOfValues(choices.map((c) => c.label), value);
  if (m.index < 0) return 0;
  const input = choices[m.index].el as HTMLInputElement;
  if (!input.checked) input.click();
  return m.score;
}

/** Tick each of several options in a checkbox group; the score is the weakest match. */
export function fillCheckboxes(f: Classified, values: string[]): number {
  const choices = f.choices ?? [];
  const labels = choices.map((c) => c.label);
  const picks = values.map((v) => bestOfValues(labels, v));
  if (!picks.length || picks.some((m) => m.index < 0)) return 0;
  for (const m of picks) {
    const input = choices[m.index].el as HTMLInputElement;
    if (!input.checked) input.click();
  }
  return Math.min(...picks.map((m) => m.score));
}

/** Single checkbox: value 'yes' means checked. */
export function fillCheckbox(el: HTMLInputElement, value: string): number {
  const want = value === 'yes';
  if (el.checked !== want) el.click();
  return 1;
}
