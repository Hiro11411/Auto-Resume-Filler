const MARK_RE = /[*✱]|\(required\)/i;

export function isRequired(el: HTMLElement, label: string, rawLabel: string): boolean {
  if ((el as HTMLInputElement).required) return true;
  if (el.getAttribute('aria-required') === 'true') return true;
  if (el.querySelector?.('[required], [aria-required="true"]')) return true;
  return MARK_RE.test(rawLabel) || MARK_RE.test(label);
}

/** Strip required markers so they don't pollute classification. */
export function stripMarkers(label: string): string {
  return label
    .replace(/[*✱]/g, '')
    .replace(/\(required\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
