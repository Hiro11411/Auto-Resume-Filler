/**
 * React, Vue and friends track input values through the prototype setter, so
 * assigning `el.value` directly is silently reverted on the next render. Going
 * through the native setter and dispatching the events a real keystroke would
 * makes controlled inputs accept the value.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export function fireInput(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function fireBlur(el: HTMLElement): void {
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur'));
}

export function setText(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  setNativeValue(el, value);
  fireInput(el);
  fireBlur(el);
}

export function setContentEditable(el: HTMLElement, value: string): void {
  el.textContent = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  fireBlur(el);
}

/** A click sequence that libraries listening on mousedown (react-select) also see. */
export function realClick(el: HTMLElement): void {
  const opts = { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView };
  const Pointer = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Pointer('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new Pointer('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor<T>(fn: () => T | null | undefined, timeout = 1500, step = 50): Promise<T | null> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}
