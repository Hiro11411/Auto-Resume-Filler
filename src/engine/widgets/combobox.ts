import { bestOfValues } from './choice';
import { isVisible } from '../discover';
import { fireBlur, realClick, setNativeValue, waitForList } from './native';

const OPTION_SELECTOR = '[role="option"], [id*="-option-"], [data-automation-id="promptOption"]';

/** How long to wait for a dropdown to open at all. Async (network) lists get the longer one. */
const COMBOBOX_TIMEOUT_MS = 2500;
const LISTBOX_TIMEOUT_MS = 2000;
/** Lists keep filtering for a moment after they first render; this much quiet means they're done. */
const QUIET_MS = 100;

function visibleOptions(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(OPTION_SELECTOR)].filter((o) => isVisible(o));
}

const optionText = (o: HTMLElement) => o.textContent ?? '';

/** Resolves to the match score, or null when no option list ever appeared. */
async function pickFromList(doc: Document, value: string, timeout: number): Promise<number | null> {
  const options = await waitForList(doc, () => visibleOptions(doc), {
    timeout,
    quietMs: QUIET_MS,
    // An exact match can be clicked right away, whatever the list does next.
    done: (opts) => bestOfValues(opts.map(optionText), value).score >= 1,
  });
  if (!options) return null;
  const m = bestOfValues(options.map(optionText), value);
  if (m.index < 0) return 0;
  realClick(options[m.index]);
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
  const score = await pickFromList(el.ownerDocument, value, COMBOBOX_TIMEOUT_MS);
  // No list at all: leave the typed text alone rather than blurring it away.
  if (score === null) return 0;
  if (!score) closeMenu(el);
  fireBlur(el);
  return score;
}

/** Button that opens a listbox (Workday "Select One"). */
export async function fillListbox(el: HTMLElement, value: string): Promise<number> {
  realClick(el);
  const score = await pickFromList(el.ownerDocument, value, LISTBOX_TIMEOUT_MS);
  if (!score) closeMenu(el);
  return score ?? 0;
}

function comboWrap(el: HTMLInputElement): Element | null | undefined {
  return el.closest('[class*="container"], [class*="control"]') ?? el.parentElement?.parentElement;
}

const SELECTED_SELECTOR = '[class*="singleValue"], [class*="single-value"], [class*="multiValue"]';

export function comboboxHasValue(el: HTMLInputElement): boolean {
  if (el.value.trim()) return true;
  return !!comboWrap(el)?.querySelector(SELECTED_SELECTOR);
}

/** The picked option's text (react-select renders it beside the input), else the typed text. */
export function comboboxText(el: HTMLInputElement): string | null {
  const picked = [...(comboWrap(el)?.querySelectorAll(SELECTED_SELECTOR) ?? [])]
    .map((n) => (n.textContent ?? '').trim())
    .filter(Boolean);
  if (picked.length) return picked.join('\n');
  return el.value.trim() || null;
}

export function listboxHasValue(el: HTMLElement): boolean {
  const t = (el.textContent ?? '').trim();
  return !!t && !/^(select|choose)/i.test(t);
}
