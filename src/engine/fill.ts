import type { Files } from '../profile/schema';
import { ACK_WORDS_RE } from './dictionary';
import { fillCheckbox, fillRadioGroup, fillSelect } from './widgets/choice';
import { fillCombobox, fillListbox } from './widgets/combobox';
import { clearFile, fillFile } from './widgets/file';
import { fireInput, setContentEditable, setNativeValue, setText } from './widgets/native';
import { fillTypeahead, isTypeahead } from './widgets/typeahead';
import type { Classified } from './types';
import { formatForField } from './values';

export type Undo = () => void;

export interface FillOutcome {
  /** 0 when the value couldn't be applied; otherwise how well it matched. */
  score: number;
  undo: Undo;
  /** Shown in the panel, e.g. why a typeahead pick didn't happen. */
  note?: string;
}

const noop: Undo = () => {};

function snapshotChecks(f: Classified): Undo {
  const inputs = (f.choices ?? [{ el: f.el }]).map((c) => c.el as HTMLInputElement);
  const before = inputs.map((i) => i.checked);
  return () =>
    inputs.forEach((i, n) => {
      if (i.checked !== before[n]) i.click();
    });
}

/** What to type into a typeahead to get the right options listed. */
function comboQuery(value: string): string {
  if (value === 'yes' || value === 'no') return value === 'yes' ? 'Yes' : 'No';
  return value.length > 40 ? value.slice(0, 40) : value;
}

export async function applyFill(f: Classified, rawValue: string, files: Files): Promise<FillOutcome> {
  const value = formatForField(f, rawValue);
  const el = f.el as HTMLInputElement;

  // "I have read and understand…" acknowledgments: the profile said yes, so tick
  // the box or pick the group's acknowledgment option (often its only one).
  if (f.type === 'exportControlAck' && value === 'yes' && (f.kind === 'radio' || f.kind === 'checkboxGroup')) {
    const undo = snapshotChecks(f);
    const choices = f.choices ?? [];
    const ack = choices.find((c) => ACK_WORDS_RE.test(c.label)) ?? (choices.length === 1 ? choices[0] : undefined);
    if (!ack) return { score: 0, undo, note: 'No acknowledgment option found.' };
    if (!(ack.el as HTMLInputElement).checked) ack.el.click();
    return { score: 1, undo };
  }

  switch (f.kind) {
    case 'text':
    case 'textarea': {
      const before = el.value;
      if (f.kind === 'text' && isTypeahead(el, f.type === 'location' || f.type === 'workLocation' || f.type === 'city')) {
        const r = await fillTypeahead(el, value);
        return {
          score: r.score,
          note: r.note,
          undo: () => {
            setNativeValue(el, before);
            fireInput(el);
          },
        };
      }
      const text = value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value;
      setText(el, text);
      return {
        score: el.value === text ? 1 : 0,
        undo: () => {
          setNativeValue(el, before);
          fireInput(el);
        },
      };
    }
    case 'contenteditable': {
      const before = f.el.textContent ?? '';
      setContentEditable(f.el, value);
      return { score: 1, undo: () => setContentEditable(f.el, before) };
    }
    case 'select': {
      const sel = f.el as HTMLSelectElement;
      const before = sel.value;
      const score = fillSelect(sel, value);
      return {
        score,
        undo: () => {
          setNativeValue(sel, before);
          fireInput(sel);
        },
      };
    }
    case 'radio':
    case 'checkboxGroup': {
      const undo = snapshotChecks(f);
      return { score: fillRadioGroup(f, value), undo };
    }
    case 'checkbox': {
      const undo = snapshotChecks(f);
      return { score: fillCheckbox(el, value), undo };
    }
    case 'combobox':
      // Typeahead libraries own their selected state, so there's no reliable undo beyond clearing the text.
      return { score: await fillCombobox(el, value, comboQuery(value)), undo: noop };
    case 'listbox':
      return { score: await fillListbox(f.el, value), undo: noop };
    case 'file': {
      const stored = f.type === 'coverLetter' ? files.coverLetter : files.resume;
      if (!stored) return { score: 0, undo: noop };
      const ok = fillFile(el, stored);
      return { score: ok ? 1 : 0, undo: () => clearFile(el) };
    }
  }
}
