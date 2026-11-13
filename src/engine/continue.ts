/**
 * Fires `onStep` whenever the page has changed and then gone quiet, which is how
 * multi-page applications (Workday, Ashby sections, "Add another" blocks) show
 * their next set of fields. Never clicks anything itself.
 */
export class StepWatcher {
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private doc: Document,
    private onStep: () => void,
    private quietMs = 600,
    private ignore: (node: Node) => boolean = () => false,
  ) {}

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => {
      if (records.every((r) => this.ignore(r.target))) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(this.onStep, this.quietMs);
    });
    this.observer.observe(this.doc.documentElement, { childList: true, subtree: true });
  }

  stop(): void {
    clearTimeout(this.timer);
    this.observer?.disconnect();
    this.observer = null;
  }

  get active(): boolean {
    return this.observer !== null;
  }
}

/**
 * Resolve once the DOM has stopped adding / removing nodes for `quietMs` (or after
 * `maxMs`). Attribute churn (spinners, focus classes) is ignored: it kept busy
 * SPAs from ever settling, so every first fill waited out the cap.
 */
export function settled(doc: Document, quietMs = 400, maxMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    let timer = setTimeout(done, quietMs);
    const cap = setTimeout(done, maxMs);
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    obs.observe(doc.documentElement, { childList: true, subtree: true });
    function done() {
      clearTimeout(timer);
      clearTimeout(cap);
      obs.disconnect();
      resolve();
    }
  });
}
