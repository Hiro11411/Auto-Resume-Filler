import type { StoredFile } from '../../profile/schema';

export function toFile(stored: StoredFile): File {
  const [, b64 = ''] = stored.dataUrl.split(',');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], stored.name, { type: stored.type });
}

export function fillFile(el: HTMLInputElement, stored: StoredFile): boolean {
  const dt = new DataTransfer();
  dt.items.add(toFile(stored));
  el.files = dt.files;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return (el.files?.length ?? 0) > 0;
}

export function clearFile(el: HTMLInputElement): void {
  el.value = '';
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
