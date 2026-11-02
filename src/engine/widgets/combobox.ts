import { bestOfValues } from './choice';
import { isVisible } from '../discover';
import { fireBlur, realClick, setNativeValue, sleep, waitFor } from './native';

const OPTION_SELECTOR = '[role="option"], [id*="-option-"], [data-automation-id="promptOption"]';

function visibleOptions(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(OPTION_SELECTOR)].filter((o) => isVisible(o));
}

/** Resolves to the match score, or null when no option list ever appeared. */
async function pickFromList(doc: Document, value: string): Promise<number | null> {
  const options = await waitFor(() => {
    const opts = visibleOptions(doc);
    return opts.length ? opts : null;
  }, 3000);
  if (!options) return null;
  // Async option lists keep filtering for a moment after they first appear.
  await sleep(150);
  const settled = visibleOptions(doc);
  const m = bestOfValues(settled.map((o) => o.textContent ?? ''), value);
  if (m.index < 0) return 0;
  realClick(settled[m.index]);
  return m.score;
}

function closeMenu(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

/** Typeahead inputs (react-select, location autocompletes). */
export async function fillCombobox(el: HTMLInputElement, value: string, query: string): Promise<number> {
  el.focus();
  realClick(el);
  setNativeValue(el, query);
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: query, inputType: 'insertText' }));
  const score = await pickFromList(el.ownerDocument, value);
  // No list at all: leave the typed text alone rather than blurring it away.
  if (score === null) return 0;
  if (!score) closeMenu(el);
  fireBlur(el);
  return score;
}

/** Button that opens a listbox (Workday "Select One"). */
export async function fillListbox(el: HTMLElement, value: string): Promise<number> {
  realClick(el);
  const score = await pickFromList(el.ownerDocument, value);
  if (!score) closeMenu(el);
  return score ?? 0;
}

export function comboboxHasValue(el: HTMLInputElement): boolean {
  if (el.value.trim()) return true;
  const wrap = el.closest('[class*="container"], [class*="control"]') ?? el.parentElement?.parentElement;
  return !!wrap?.querySelector('[class*="singleValue"], [class*="single-value"], [class*="multiValue"]');
}

export function listboxHasValue(el: HTMLElement): boolean {
  const t = (el.textContent ?? '').trim();
  return !!t && !/^(select|choose)/i.test(t);
}
