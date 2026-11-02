import { isVisible } from '../discover';
import { bestOfValues } from './choice';
import { realClick, setNativeValue, sleep, waitFor } from './native';

/**
 * Suggestion rows from common typeahead widgets. Lever's location box renders
 * `.dropdown-location` rows; Google Places uses `.pac-item`; ARIA widgets use role=option.
 */
const SUGGESTION_SELECTOR = [
  '[role="option"]',
  '[id*="-option-"]',
  '[data-automation-id="promptOption"]',
  '.dropdown-location',
  '.pac-item',
  '.autocomplete-suggestion',
  '[class*="suggestion-item"]',
].join(',');

/** Lever and others only search on a keypress, then wait ~500 ms and call the network. */
const SUGGESTION_TIMEOUT_MS = 4000;

function suggestions(doc: Document, exclude: ReadonlySet<Element>): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(SUGGESTION_SELECTOR)].filter(
    (o) => !exclude.has(o) && (o.textContent ?? '').trim() !== '' && isVisible(o),
  );
}

export interface TypeaheadResult {
  /** Match score of the picked suggestion; 0 when nothing was picked. */
  score: number;
  note?: string;
}

/**
 * Type like a person, wait for the suggestion list, and pick the matching row.
 *
 * Fires keydown/input/keyup (Lever starts its search on keydown) and never
 * fires blur: Lever clears the box on blur while its list is open, so the
 * pick has to happen first. If no list appears, the typed text is left as is.
 */
export async function fillTypeahead(el: HTMLInputElement, value: string, query = value): Promise<TypeaheadResult> {
  const doc = el.ownerDocument;
  const before = new Set(suggestions(doc, new Set()));
  el.focus({ preventScroll: true });
  setNativeValue(el, query);
  const key = query.slice(-1) || 'a';
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: query, inputType: 'insertText' }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));

  const appeared = await waitFor(() => {
    const list = suggestions(doc, before);
    return list.length ? list : null;
  }, SUGGESTION_TIMEOUT_MS);
  if (!appeared) {
    return { score: 0, note: 'No suggestions appeared. Typed text left in place; pick from the list if the site requires it.' };
  }
  // Lists keep updating briefly after they first render.
  await sleep(200);
  const rows = suggestions(doc, before);
  const m = bestOfValues(rows.map((r) => r.textContent ?? ''), value);
  if (m.index < 0) {
    return { score: 0, note: `No suggestion matched "${value}". Pick one from the list.` };
  }
  realClick(rows[m.index]);
  return { score: m.score };
}

/**
 * Text inputs that need a suggestion picked rather than free text: ARIA
 * autocompletes, or a box with a dropdown container next to it (Lever's
 * location field has `.dropdown-container` plus a hidden `selectedLocation`).
 */
export function isTypeahead(el: HTMLInputElement, isLocation: boolean): boolean {
  const aria = el.getAttribute('aria-autocomplete');
  if (aria === 'list' || aria === 'both') return true;
  if (el.hasAttribute('list')) return false; // native <datalist>: plain typing works
  const box = el.parentElement;
  const hasDropdown = !!box?.querySelector('[class*="dropdown"], [class*="autocomplete"], [class*="suggest"], [role="listbox"]');
  if (!hasDropdown) return false;
  const hasHiddenPick = !!box?.querySelector('input[type="hidden"]');
  return isLocation || hasHiddenPick || /location|autocomplete|typeahead|places/i.test(el.className);
}
