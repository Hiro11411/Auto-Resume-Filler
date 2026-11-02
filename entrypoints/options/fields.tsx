import type { ComponentChildren } from 'preact';
import type { Profile } from '../../src/profile/schema';

export type Path = (string | number)[];

export function setIn<T>(obj: T, path: Path, value: unknown): T {
  const copy = structuredClone(obj) as Record<string | number, unknown>;
  let node = copy;
  for (const k of path.slice(0, -1)) node = node[k] as Record<string | number, unknown>;
  node[path[path.length - 1]] = value;
  return copy as T;
}

export function getIn(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((n, k) => (n as Record<string | number, unknown>)?.[k], obj);
}

export interface FieldProps {
  label: string;
  path: Path;
  profile: Profile;
  onChange(path: Path, v: unknown): void;
  type?: 'text' | 'email' | 'tel' | 'url' | 'month' | 'date';
  placeholder?: string;
  wide?: boolean;
  hint?: string;
}

export function Text({ label, path, profile, onChange, type = 'text', placeholder, wide, hint }: FieldProps) {
  const id = path.join('-');
  return (
    <div class={wide ? 'field wide' : 'field'}>
      <label for={id}>{label}</label>
      <input
        id={id}
        // Preact narrows <input> props by type; the union here is always a valid text-like type.
        type={type as 'text'}
        placeholder={placeholder}
        value={String(getIn(profile, path) ?? '')}
        onInput={(e) => onChange(path, (e.currentTarget as HTMLInputElement).value)}
      />
      {hint && <small class="muted">{hint}</small>}
    </div>
  );
}

export function Area({ label, path, profile, onChange, hint }: FieldProps) {
  const id = path.join('-');
  return (
    <div class="field wide">
      <label for={id}>{label}</label>
      <textarea id={id} rows={3} value={String(getIn(profile, path) ?? '')} onInput={(e) => onChange(path, (e.currentTarget as HTMLTextAreaElement).value)} />
      {hint && <small class="muted">{hint}</small>}
    </div>
  );
}

export function Choice({ label, path, profile, onChange, options }: FieldProps & { options: [string, string][] }) {
  const id = path.join('-');
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <select id={id} value={String(getIn(profile, path) ?? '')} onChange={(e) => onChange(path, (e.currentTarget as HTMLSelectElement).value)}>
        {options.map(([v, t]) => (
          <option value={v}>{t}</option>
        ))}
      </select>
    </div>
  );
}

export const YES_NO: [string, string][] = [
  ['', 'Not set'],
  ['yes', 'Yes'],
  ['no', 'No'],
];
export const DECLINE = 'I don’t wish to answer';

export function Section({ title, desc, children }: { title: string; desc?: string; children: ComponentChildren }) {
  return (
    <section>
      <h2>{title}</h2>
      {desc && <p class="muted desc">{desc}</p>}
      <div class="grid">{children}</div>
    </section>
  );
}

export function SettingRow({ title, desc, children }: { title: string; desc: string; children: ComponentChildren }) {
  return (
    <div class="setting">
      <div>
        <strong>{title}</strong>
        <p class="muted">{desc}</p>
      </div>
      {children}
    </div>
  );
}
