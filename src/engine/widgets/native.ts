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
  const base = { bubbles: true, cancelable: true };
  let opts: MouseEventInit = { ...base, view: el.ownerDocument.defaultView };
  try {
    new MouseEvent('mousedown', opts);
  } catch {
    opts = base; // jsdom rejects its own window as `view`
  }
  const Pointer = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Pointer('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new Pointer('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ListWait<T> {
  /** Give up if nothing has appeared after this long. */
  timeout: number;
  /** Once items exist, resolve when the page has been quiet for this long. */
  quietMs: number;
  /** Resolve immediately when this says the current items are good enough (e.g. an exact match). */
  done?(items: T[]): boolean;
  /** Hard cap after the first items appear, for pages that never stop animating. */
  settleCapMs?: number;
}

/**
 * Wait for an option / suggestion list driven by DOM mutations instead of
 * polling and fixed sleeps: resolves as soon as `done` is satisfied, or once the
 * list exists and has stopped changing. Null when nothing ever appeared.
 */
export function waitForList<T>(doc: Document, read: () => T[], opts: ListWait<T>): Promise<T[] | null> {
  return new Promise((resolve) => {
    let finished = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    let appeared = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      obs.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      const items = read();
      resolve(items.length ? items : null);
    };
    const check = () => {
      if (finished) return;
      const items = read();
      if (!items.length) return;
      if (opts.done?.(items)) return finish();
      if (!appeared) {
        appeared = true;
        clearTimeout(cap);
        cap = setTimeout(finish, opts.settleCapMs ?? 1000);
      }
      clearTimeout(quiet);
      quiet = setTimeout(finish, opts.quietMs);
    };
    const obs = new MutationObserver(check);
    obs.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-expanded'],
    });
    let cap = setTimeout(finish, opts.timeout);
    check();
  });
}

export async function waitFor<T>(fn: () => T | null | undefined, timeout = 1500, step = 50): Promise<T | null> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}
