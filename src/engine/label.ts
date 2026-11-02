const MAX_LABEL = 300;

export function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Text of an element without the text of any form controls or option lists inside it. */
function ownText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone
    .querySelectorAll('input, select, textarea, option, [role="listbox"], [role="option"], script, style')
    .forEach((n) => n.remove());
  return clean(clone.textContent);
}

function byIds(root: Document | ShadowRoot, ids: string | null): string {
  if (!ids) return '';
  return clean(
    ids
      .split(/\s+/)
      .map((id) => root.getElementById?.(id)?.textContent ?? '')
      .join(' '),
  );
}

function rootOf(el: Element): Document | ShadowRoot {
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root : el.ownerDocument;
}

function labelFor(el: HTMLElement): string {
  const root = rootOf(el);
  if (el.id) {
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id.replace(/["\\]/g, '\\$&');
    const lab = root.querySelector(`label[for="${esc}"]`);
    if (lab) return ownText(lab);
  }
  const wrap = el.closest('label');
  if (wrap) return ownText(wrap);
  return '';
}

/**
 * Text immediately before the element: previous siblings first, then the
 * parent's previous siblings, a few levels up. Catches the common
 * `<div>Question?</div><div><input></div>` layout with no <label>.
 */
export function precedingText(el: Element, levels = 4): string {
  let node: Element | null = el;
  for (let i = 0; i < levels && node; i++) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (!sib.matches('input, select, textarea, button, script, style')) {
        const text = ownText(sib);
        if (text) return text.slice(0, MAX_LABEL);
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
    if (node?.matches('form, body')) break;
  }
  return '';
}

/** Best human-readable question text for a single control. */
export function resolveLabel(el: HTMLElement): string {
  const root = rootOf(el);
  const text =
    labelFor(el) ||
    byIds(root, el.getAttribute('aria-labelledby')) ||
    clean(el.getAttribute('aria-label')) ||
    precedingText(el) ||
    clean(el.getAttribute('placeholder')) ||
    clean(el.getAttribute('title'));
  return text.slice(0, MAX_LABEL);
}

/** Question text for a radio / checkbox group container. */
export function resolveGroupLabel(container: HTMLElement): string {
  const root = rootOf(container);
  const legend = container.querySelector(':scope > legend');
  const fieldset = container.closest('fieldset');
  const text =
    (legend && ownText(legend)) ||
    byIds(root, container.getAttribute('aria-labelledby')) ||
    clean(container.getAttribute('aria-label')) ||
    (fieldset && fieldset !== container && fieldset.querySelector('legend')
      ? ownText(fieldset.querySelector('legend')!)
      : '') ||
    precedingText(container);
  return text.slice(0, MAX_LABEL);
}

/** Label of one radio/checkbox option. */
export function optionLabel(input: HTMLElement): string {
  return (
    labelFor(input) ||
    clean(input.getAttribute('aria-label')) ||
    clean(input.nextElementSibling?.textContent) ||
    clean(input.parentElement?.textContent) ||
    clean((input as HTMLInputElement).value)
  );
}

const HINT_ATTRS = ['name', 'id', 'placeholder', 'data-automation-id', 'data-qa', 'data-testid', 'data-field'];

export function resolveHints(el: HTMLElement): string {
  return HINT_ATTRS.map((a) => el.getAttribute(a) ?? '')
    .filter(Boolean)
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-[\].]+/g, ' ')
    .toLowerCase();
}
