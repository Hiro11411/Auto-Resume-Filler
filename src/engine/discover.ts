import { optionLabel, resolveGroupLabel, resolveHints, resolveLabel } from './label';
import { isRequired, stripMarkers } from './required';
import type { Choice, Field, FieldKind } from './types';

export const OVERLAY_HOST_ID = 'aaf-overlay-root';

const SKIP_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'password',
  'search',
  'range',
  'color',
]);

const CONTROL_SELECTOR = [
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  'button[aria-haspopup="listbox"]',
].join(',');

/** Smaller than this (px) can't be a field a person would see and fill. */
const MIN_SIZE = 4;

/**
 * Would a person see this control? Besides display/visibility, this rejects
 * transparent, tiny and off-screen controls, which is how a malicious page would
 * try to collect profile data the user never sees being filled.
 */
export function isVisible(el: Element): boolean {
  const anyEl = el as Element & { checkVisibility?: (o?: object) => boolean };
  if (typeof anyEl.checkVisibility === 'function') {
    if (!anyEl.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const doc = el.ownerDocument;
    // jsdom has no layout: every rect is zero, so size checks only apply in a real browser.
    if (doc.documentElement.getBoundingClientRect().width === 0) return true;
    const r = el.getBoundingClientRect();
    if (r.width < MIN_SIZE || r.height < MIN_SIZE) return false;
    const view = doc.defaultView;
    const scrollW = Math.max(doc.documentElement.scrollWidth, view?.innerWidth ?? 0);
    return r.right + (view?.scrollX ?? 0) > 0 && r.bottom + (view?.scrollY ?? 0) > 0 && r.left < scrollW;
  }
  // jsdom / fallback: walk up looking for display:none or visibility:hidden.
  for (let n: Element | null = el; n; n = n.parentElement) {
    if ((n as HTMLElement).hidden) return false;
    const style = el.ownerDocument.defaultView?.getComputedStyle(n);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

/** All controls in a root, descending into open shadow roots. */
function collectControls(root: Document | ShadowRoot, out: HTMLElement[]): void {
  root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR).forEach((el) => out.push(el));
  root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) collectControls(el.shadowRoot, out);
  });
}

function commonAncestor(els: HTMLElement[]): HTMLElement {
  const preferred = els[0].closest<HTMLElement>('[role="radiogroup"], [role="group"], fieldset');
  if (preferred && els.every((e) => preferred.contains(e))) return preferred;
  let node: HTMLElement | null = els[0].parentElement;
  while (node && !els.every((e) => node!.contains(e))) node = node.parentElement;
  return node ?? els[0].ownerDocument.body;
}

function nearestVisible(el: HTMLElement): HTMLElement {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (isVisible(n) && n.tagName !== 'FORM') return n;
  }
  return el;
}

function base(el: HTMLElement, kind: FieldKind, rawLabel: string): Field {
  const label = stripMarkers(rawLabel);
  const input = el as HTMLInputElement;
  return {
    kind,
    el,
    anchor: el,
    label,
    hints: resolveHints(el),
    autocomplete: (el.getAttribute('autocomplete') ?? '').toLowerCase().trim(),
    required: isRequired(el, label, rawLabel),
    inputType: (input.type ?? '').toLowerCase(),
    maxLength: input.maxLength > 0 ? input.maxLength : 0,
  };
}

export interface Discovery {
  fields: Field[];
  /** A visible password input means this is a login / sign-up form. */
  hasPassword: boolean;
}

export interface DiscoverOptions {
  /**
   * A field already handled in an earlier pass, keyed by its control (the first
   * input for radio / checkbox groups). Returning it skips label and hint
   * resolution, the expensive part, on watcher passes.
   */
  reuse?(el: HTMLElement): Field | undefined;
}

export function discover(doc: Document, opts: DiscoverOptions = {}): Discovery {
  const controls: HTMLElement[] = [];
  collectControls(doc, controls);

  const fields: Field[] = [];
  const groups = new Map<string, HTMLInputElement[]>();
  let hasPassword = false;

  for (const el of controls) {
    if (el.closest(`#${OVERLAY_HOST_ID}`)) continue;
    const input = el as HTMLInputElement;
    const tag = el.tagName;
    const type = (input.type ?? '').toLowerCase();

    if (tag === 'INPUT' && type === 'password' && isVisible(el)) hasPassword = true;
    if (input.disabled) continue;

    if (tag === 'INPUT' && type === 'file') {
      const known = opts.reuse?.(el);
      if (known) {
        fields.push(known);
        continue;
      }
      const f = base(el, 'file', resolveLabel(el) || el.getAttribute('aria-label') || '');
      f.anchor = nearestVisible(el.closest('label') ?? el.parentElement ?? el);
      fields.push(f);
      continue;
    }
    if (!isVisible(el) && !(tag === 'INPUT' && (type === 'radio' || type === 'checkbox'))) continue;
    if (input.readOnly && el.getAttribute('role') !== 'combobox') continue;

    if (tag === 'INPUT' && (type === 'radio' || type === 'checkbox')) {
      // Custom-styled radios often hide the real input; the label must be visible.
      if (!isVisible(el) && !isVisible(el.closest('label') ?? el.parentElement ?? el)) continue;
      const key = `${type}:${input.name || el.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(input);
      continue;
    }
    if (tag === 'INPUT' && SKIP_INPUT_TYPES.has(type)) continue;

    const known = opts.reuse?.(el);
    if (known) {
      fields.push(known);
      continue;
    }

    const role = el.getAttribute('role');
    let kind: FieldKind;
    if (tag === 'SELECT') kind = 'select';
    else if (tag === 'TEXTAREA') kind = 'textarea';
    else if (tag === 'BUTTON') kind = 'listbox';
    else if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') kind = 'contenteditable';
    else if (role === 'combobox' || el.getAttribute('aria-autocomplete') === 'list') kind = 'combobox';
    else kind = 'text';

    // react-select style comboboxes label the wrapper, not the inner <input>.
    let raw = resolveLabel(el);
    if (!raw && kind === 'combobox') {
      const wrap = el.closest<HTMLElement>('[class*="select"], [class*="Select"]');
      if (wrap) raw = resolveLabel(wrap);
    }
    fields.push(base(el, kind, raw));
  }

  for (const [key, inputs] of groups) {
    const known = opts.reuse?.(inputs[0]);
    if (known && (known.choices?.length ?? 1) === inputs.length) {
      fields.push(known);
      continue;
    }
    const isRadio = key.startsWith('radio:');
    if (!isRadio && inputs.length === 1) {
      const el = inputs[0];
      const f = base(el, 'checkbox', resolveLabel(el) || optionLabel(el));
      f.anchor = nearestVisible(el.closest('label') ?? el);
      fields.push(f);
      continue;
    }
    const container = commonAncestor(inputs);
    const choices: Choice[] = inputs.map((el) => ({ label: optionLabel(el), el }));
    const raw = resolveGroupLabel(container);
    const f = base(container, isRadio ? 'radio' : 'checkboxGroup', raw);
    f.required = f.required || inputs.some((i) => i.required || i.getAttribute('aria-required') === 'true');
    f.hints = resolveHints(inputs[0]);
    f.choices = choices;
    fields.push(f);
  }

  // Document order keeps repeating sections (job 1, job 2...) aligned with ordinals.
  fields.sort((a, b) => {
    if (a.el === b.el) return 0;
    return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  return { fields, hasPassword };
}
