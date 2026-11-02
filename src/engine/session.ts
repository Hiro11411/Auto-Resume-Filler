import { pickAdapter } from '../adapters';
import type { Files, Profile, Settings } from '../profile/schema';
import { classifyAll } from './classify';
import { StepWatcher } from './continue';
import { isApplicationForm, type Detection } from './detect';
import { discover, OVERLAY_HOST_ID } from './discover';
import { applyFill, type Undo } from './fill';
import { Overlay } from './overlay';
import { CONFIDENT, decide, hasValue } from './policy';
import { SENSITIVE_TYPES, type Classified, type FieldResult, type FieldType, type Summary } from './types';
import { invalidReason } from './validate';
import { setText, sleep } from './widgets/native';

/** Delay before asking the page whether filled fields are valid. */
const VALIDATE_AFTER_MS = 300;

export interface SessionData {
  profile: Profile;
  settings: Settings;
  files: Files;
}

export interface SessionDeps {
  doc: Document;
  load(): Promise<SessionData>;
  report?(summary: Summary): void;
  /** AI: draft an answer for a free-text question. */
  draft?(question: string, jobDescription: string): Promise<string>;
  /** AI: map required questions we couldn't classify onto profile field types. */
  mapUnknown?(questions: { label: string; options: string[] }[]): Promise<(FieldType | null)[]>;
}

export interface FillResult {
  detection: Detection;
  summary: Summary;
}

const keyOf = (f: Classified) => (f.choices?.[0]?.el ?? f.el) as HTMLElement;

function optionsOf(f: Classified): string[] {
  if (f.kind === 'select') return [...(f.el as HTMLSelectElement).options].map((o) => o.text);
  return (f.choices ?? []).map((c) => c.label);
}

function jobDescription(doc: Document): string {
  const main = doc.querySelector('main, article, [class*="description"], #content') ?? doc.body;
  const clone = main.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('form, script, style, nav, footer, #' + OVERLAY_HOST_ID).forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 6000);
}

export class FillSession {
  private processed = new WeakSet<HTMLElement>();
  private touched = new WeakSet<HTMLElement>();
  private results: FieldResult[] = [];
  private undos: Undo[] = [];
  private overlay: Overlay;
  private watcher: StepWatcher;
  private busy: Promise<FillResult> | null = null;
  /** The page changed while a pass was running; run another when it ends. */
  private stepPending = false;
  private rerender: ReturnType<typeof setTimeout> | undefined;
  private onUserInput = (e: Event) => {
    if (!e.isTrusted || !(e.target instanceof HTMLElement)) return;
    this.touched.add(e.target);
    this.onUserAnswer(e.target);
  };

  constructor(private deps: SessionDeps) {
    const doc = deps.doc;
    this.overlay = new Overlay(doc, {
      onUndo: () => this.undo(),
      onClose: () => this.stop(),
      onDraft: deps.draft ? (f) => this.draftInto(f) : undefined,
    });
    this.watcher = new StepWatcher(
      doc,
      () => {
        if (this.busy) this.stepPending = true;
        else void this.fill({ auto: false, fromWatcher: true });
      },
      600,
      (node) => !!(node as Element).closest?.(`#${OVERLAY_HOST_ID}`) || node.nodeName === '#text',
    );
    doc.addEventListener('input', this.onUserInput, true);
    doc.addEventListener('change', this.onUserInput, true);
  }

  get watching(): boolean {
    return this.watcher.active;
  }

  /** Run one fill pass. Concurrent calls share the in-flight pass. */
  fill(opts: { auto: boolean; fromWatcher?: boolean }): Promise<FillResult> {
    if (!this.busy) {
      this.busy = this.run(opts).finally(() => {
        this.busy = null;
        // A step that rendered mid-pass (user clicked Next, a section was added) still gets filled.
        if (this.stepPending && this.watcher.active) {
          this.stepPending = false;
          void this.fill({ auto: false, fromWatcher: true });
        }
      });
    }
    return this.busy;
  }

  private async run({ auto, fromWatcher }: { auto: boolean; fromWatcher?: boolean }): Promise<FillResult> {
    const doc = this.deps.doc;
    const data = await this.deps.load();
    const adapter = pickAdapter(doc.location?.hostname ?? '');
    const { fields, hasPassword } = discover(doc);
    const classified = classifyAll(fields, adapter.rules);

    const detection = isApplicationForm(doc, classified, hasPassword, adapter);
    if (auto && !detection.ok) return { detection, summary: this.summary() };

    // Watch from the start of the pass, so a step the user opens mid-fill isn't missed.
    if (data.settings.autoContinue) this.watcher.start();

    const fresh = classified.filter((f) => !this.processed.has(keyOf(f)));
    if (fromWatcher && fresh.length === 0) return { detection, summary: this.summary() };

    const unknownRequired: Classified[] = [];

    for (const f of fresh) {
      const key = keyOf(f);
      this.processed.add(key);
      if (this.touched.has(key) || this.touched.has(f.el)) continue;
      if (f.type === 'unknown' && f.required && this.deps.mapUnknown && data.settings.ai.enabled) {
        unknownRequired.push(f);
        continue;
      }
      await this.fillField(f, data);
    }

    if (unknownRequired.length) await this.fillWithAiMapping(unknownRequired, data);

    const live = this.results.filter((r) => r.field.el.isConnected);
    this.results = live;
    // Pages validate on change, sometimes asynchronously; give them a moment, then ask.
    if (live.some((r) => r.status === 'filled' || r.status === 'check')) {
      await sleep(VALIDATE_AFTER_MS);
      this.checkValidity(live);
    }
    const visible = live.some((r) => r.status === 'filled' || r.status === 'check' || r.status === 'missing' || r.status === 'freeText');
    if (visible) this.overlay.render(live, data.settings.autoContinue);
    const summary = this.summary();
    this.deps.report?.(summary);
    return { detection, summary };
  }

  private async fillField(f: Classified, data: SessionData): Promise<void> {
    const d = decide(f, data.profile, data.settings, data.files);
    if (d.action === 'skip') {
      this.record(f, d.status, undefined, d.note);
      return;
    }
    try {
      const out = await applyFill(f, d.value, data.files);
      if (out.score === 0) {
        if (hasValue(f)) this.undos.push(out.undo); // e.g. typed into a typeahead with no pick
        this.record(f, f.required ? 'missing' : 'check', d.value, out.note ?? `Couldn't apply "${d.value}".`);
        return;
      }
      this.undos.push(out.undo);
      this.record(f, d.confident && out.score >= CONFIDENT ? 'filled' : 'check', d.value, out.note);
    } catch (err) {
      this.record(f, f.required ? 'missing' : 'check', d.value, `Fill failed: ${(err as Error).message}`);
    }
  }

  private async fillWithAiMapping(fields: Classified[], data: SessionData): Promise<void> {
    let mapped: (FieldType | null)[] = [];
    try {
      mapped = await this.deps.mapUnknown!(fields.map((f) => ({ label: f.label, options: optionsOf(f) })));
    } catch {
      // AI is best-effort; fall through and mark them as needing the user.
    }
    for (const [i, f] of fields.entries()) {
      const type = mapped[i];
      // Belt and braces: legal questions are never answered from an AI guess.
      if (type && type !== 'unknown' && type !== 'freeText' && !SENSITIVE_TYPES.has(type)) {
        // AI mappings are never "confident": always shown as "check this".
        await this.fillField({ ...f, type, confidence: 0.6 }, data);
      } else {
        this.record(f, 'missing');
      }
    }
  }

  private record(f: Classified, status: FieldResult['status'], value?: string, note?: string): void {
    this.results.push({ field: f, status, value, note });
    this.overlay.mark(f.anchor, status);
  }

  /**
   * Log and flag fields the page still reports as invalid: every field we
   * filled, and every required field the user has answered since.
   */
  private checkValidity(results: FieldResult[]): void {
    for (const r of results) {
      const ours = r.status === 'filled' || r.status === 'check';
      if (!(ours || (r.status === 'answered' && r.field.required))) continue;
      const reason = invalidReason(r.field);
      if (reason === (r.invalid ?? null)) continue;
      r.invalid = reason ?? undefined;
      if (reason) {
        console.warn(`[Apply Autofill] Still invalid after filling: "${r.field.label || r.field.type}" (${r.field.type}): ${reason}`, r.field.el);
        this.overlay.mark(r.field.anchor, 'missing');
      } else {
        this.overlay.mark(r.field.anchor, r.status);
      }
    }
  }

  /** The user answered something: update its outline and the panel instead of leaving a stale red border. */
  private onUserAnswer(target: HTMLElement): void {
    const r = this.results.find(
      (x) => x.field.el === target || x.field.choices?.some((c) => c.el === target) || x.field.el.contains(target),
    );
    if (!r) return;
    if (hasValue(r.field) && r.status !== 'filled') {
      r.status = 'answered';
      r.note = undefined;
      this.overlay.unmark(r.field.anchor);
    }
    clearTimeout(this.rerender);
    this.rerender = setTimeout(() => {
      this.checkValidity([r]);
      if (this.overlay.isOpen) this.overlay.render(this.results, this.watcher.active);
      this.deps.report?.(this.summary());
    }, 150);
  }

  private async draftInto(f: Classified): Promise<void> {
    const text = await this.deps.draft!(f.label, jobDescription(this.deps.doc));
    const el = f.el as HTMLTextAreaElement;
    if (f.kind === 'contenteditable') f.el.textContent = text;
    else setText(el, text);
    const r = this.results.find((x) => x.field.el === f.el);
    if (r) r.status = 'check';
    this.overlay.mark(f.anchor, 'check');
    this.overlay.render(this.results, this.watcher.active);
    this.deps.report?.(this.summary());
  }

  summary(): Summary {
    const n = (s: string) => this.results.filter((r) => r.status === s).length;
    return {
      filled: n('filled'),
      check: n('check'),
      freeText: n('freeText'),
      missing: n('missing'),
      optional: n('optional'),
      host: this.deps.doc.location?.hostname ?? '',
      at: Date.now(),
    };
  }

  undo(): void {
    this.watcher.stop();
    for (const u of this.undos.reverse()) {
      try {
        u();
      } catch {
        // element may be gone after a step change
      }
    }
    this.undos = [];
    this.results = [];
    this.overlay.destroy();
    this.deps.report?.(this.summary());
  }

  /** Close the panel and stop watching; leaves filled values in place. */
  stop(): void {
    this.watcher.stop();
    this.overlay.destroy();
  }

  dispose(): void {
    this.stop();
    this.deps.doc.removeEventListener('input', this.onUserInput, true);
    this.deps.doc.removeEventListener('change', this.onUserInput, true);
  }
}
