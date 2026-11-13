import { ACK_WORDS_RE } from './dictionary';
import type { Classified } from './types';
import { formatForField } from './values';
import { snapshotChecks, widgetFor, type FillContext, type FillOutcome, type WidgetOverrides } from './widgets';

export type { FillContext, FillOutcome, Undo } from './widgets';

/** Does filling this field wait on the page (dropdowns, suggestion lists)? */
export function isSlow(f: Classified, overrides?: WidgetOverrides): boolean {
  return widgetFor(f, overrides).slow(f);
}

export async function applyFill(f: Classified, rawValue: string, ctx: FillContext, overrides?: WidgetOverrides): Promise<FillOutcome> {
  const value = formatForField(f, rawValue);

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

  return widgetFor(f, overrides).fill(f, value, ctx);
}
