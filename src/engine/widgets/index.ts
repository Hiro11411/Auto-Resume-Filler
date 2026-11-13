import type { FileKind, StoredFile } from '../../profile/schema';
import type { Classified, FieldKind } from '../types';
import { fillCheckbox, fillCheckboxes, fillRadioGroup, fillSelect, selectIsEmpty } from './choice';
import { comboboxHasValue, comboboxText, fillCombobox, fillListbox, listboxHasValue } from './combobox';
import { clearFile, fillFile } from './file';
import { fireInput, setContentEditable, setNativeValue, setText } from './native';
import { fillTypeahead, isTypeahead } from './typeahead';

export type Undo = () => void;

export interface FillOutcome {
  /** 0 when the value couldn't be applied; otherwise how well it matched. */
  score: number;
  undo: Undo;
  /** Shown in the panel, e.g. why a typeahead pick didn't happen. */
  note?: string;
}

export interface FillContext {
  /** Resume / cover letter bytes, fetched only when a file field is actually filled. */
  loadFile(kind: FileKind): Promise<StoredFile | undefined>;
}

/**
 * Everything the engine needs to know about one kind of control. Sites with
 * unusual widgets override single methods through `Adapter.widgets`.
 */
export interface Widget {
  fill(f: Classified, value: string, ctx: FillContext): Promise<FillOutcome>;
  hasValue(f: Classified): boolean;
  /** The current answer as text (option label for choices), or null when empty / not readable. */
  read(f: Classified): string | null;
  /**
   * True when filling has to wait on the page (an option list opening, a
   * suggestion request). Those run after every instant field is filled.
   */
  slow(f: Classified): boolean;
}

const noop: Undo = () => {};
const input = (f: Classified) => f.el as HTMLInputElement;

/** Location-like text boxes are the ones that usually need a suggestion picked. */
const isLocationish = (f: Classified) => f.type === 'location' || f.type === 'workLocation' || f.type === 'city';

function restoreValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): Undo {
  const before = el.value;
  return () => {
    setNativeValue(el, before);
    fireInput(el);
  };
}

export function snapshotChecks(f: Classified): Undo {
  const inputs = (f.choices ?? [{ el: f.el }]).map((c) => c.el as HTMLInputElement);
  const before = inputs.map((i) => i.checked);
  return () =>
    inputs.forEach((i, n) => {
      if (i.checked !== before[n]) i.click();
    });
}

const text: Widget = {
  async fill(f, value) {
    const el = input(f);
    const undo = restoreValue(el);
    if (f.kind === 'text' && isTypeahead(el, isLocationish(f))) {
      const r = await fillTypeahead(el, value);
      return { score: r.score, note: r.note, undo };
    }
    const typed = value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value;
    setText(el, typed);
    return { score: el.value === typed ? 1 : 0, undo };
  },
  hasValue: (f) => input(f).value.trim() !== '',
  read: (f) => input(f).value.trim() || null,
  slow: (f) => f.kind === 'text' && isTypeahead(input(f), isLocationish(f)),
};

const contenteditable: Widget = {
  async fill(f, value) {
    const before = f.el.textContent ?? '';
    setContentEditable(f.el, value);
    return { score: 1, undo: () => setContentEditable(f.el, before) };
  },
  hasValue: (f) => (f.el.textContent ?? '').trim() !== '',
  read: () => null, // long-form by nature: never remembered
  slow: () => false,
};

const select: Widget = {
  async fill(f, value) {
    const sel = f.el as HTMLSelectElement;
    const undo = restoreValue(sel);
    return { score: fillSelect(sel, value), undo };
  },
  hasValue: (f) => !selectIsEmpty(f.el as HTMLSelectElement),
  read(f) {
    const sel = f.el as HTMLSelectElement;
    if (selectIsEmpty(sel)) return null;
    return [...sel.selectedOptions].map((o) => o.text.trim()).join('\n') || null;
  },
  slow: () => false,
};

const checkedLabels = (f: Classified) =>
  (f.choices ?? []).filter((c) => (c.el as HTMLInputElement).checked).map((c) => c.label);

const radio: Widget = {
  async fill(f, value) {
    const undo = snapshotChecks(f);
    return { score: fillRadioGroup(f, value), undo };
  },
  hasValue: (f) => checkedLabels(f).length > 0,
  read: (f) => checkedLabels(f)[0] ?? null,
  slow: () => false,
};

const checkboxGroup: Widget = {
  async fill(f, value) {
    const undo = snapshotChecks(f);
    // Several remembered options are stored newline-separated.
    const score = value.includes('\n') ? fillCheckboxes(f, value.split('\n')) : fillRadioGroup(f, value);
    return { score, undo };
  },
  hasValue: (f) => checkedLabels(f).length > 0,
  read: (f) => checkedLabels(f).join('\n') || null,
  slow: () => false,
};

const checkbox: Widget = {
  async fill(f, value) {
    const undo = snapshotChecks(f);
    return { score: fillCheckbox(input(f), value), undo };
  },
  hasValue: (f) => input(f).checked,
  read: () => null, // single checkboxes are mostly consent: never remembered
  slow: () => false,
};

/** What to type into a typeahead to get the right options listed. */
function comboQuery(value: string): string {
  if (value === 'yes' || value === 'no') return value === 'yes' ? 'Yes' : 'No';
  return value.length > 40 ? value.slice(0, 40) : value;
}

const combobox: Widget = {
  // Typeahead libraries own their selected state, so there's no reliable undo beyond clearing the text.
  fill: async (f, value) => ({ score: await fillCombobox(input(f), value, comboQuery(value)), undo: noop }),
  hasValue: (f) => comboboxHasValue(input(f)),
  read: (f) => comboboxText(input(f)),
  slow: () => true,
};

const listbox: Widget = {
  fill: async (f, value) => ({ score: await fillListbox(f.el, value), undo: noop }),
  hasValue: (f) => listboxHasValue(f.el),
  read: (f) => (listboxHasValue(f.el) ? (f.el.textContent ?? '').trim() : null),
  slow: () => true,
};

const file: Widget = {
  async fill(f, _value, ctx) {
    const el = input(f);
    const stored = await ctx.loadFile(f.type === 'coverLetter' ? 'coverLetter' : 'resume');
    if (!stored) return { score: 0, undo: noop };
    return { score: fillFile(el, stored) ? 1 : 0, undo: () => clearFile(el) };
  },
  hasValue: (f) => (input(f).files?.length ?? 0) > 0,
  read: () => null,
  slow: () => false,
};

export const WIDGETS: Record<FieldKind, Widget> = {
  text,
  textarea: text,
  contenteditable,
  select,
  radio,
  checkboxGroup,
  checkbox,
  combobox,
  listbox,
  file,
};

export type WidgetOverrides = Partial<Record<FieldKind, Partial<Widget>>>;

/** The widget for a field, with any site-specific overrides applied. */
export function widgetFor(f: Classified, overrides?: WidgetOverrides): Widget {
  const base = WIDGETS[f.kind];
  const o = overrides?.[f.kind];
  return o ? { ...base, ...o } : base;
}
