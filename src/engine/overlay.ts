import { OVERLAY_HOST_ID } from './discover';
import type { Classified, FieldResult, Status } from './types';

const COLORS: Partial<Record<Status, string>> = {
  filled: '#1f9d55',
  check: '#d97706',
  freeText: '#2563eb',
  missing: '#dc2626',
};

const TITLES: Partial<Record<Status, string>> = {
  check: 'Check these',
  freeText: 'Your answer (left empty)',
  missing: 'Required, needs you',
};

export interface OverlayHandlers {
  onUndo(): void;
  onClose(): void;
  /** Present only when AI drafting is enabled. */
  onDraft?(field: Classified): Promise<void>;
}

const CSS = `
:host { all: initial; }
.panel {
  --bg: #ffffff; --fg: #1a1a1a; --muted: #5f6368; --line: #e3e3e3; --btn: #f3f3f3;
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 300px; max-height: 60vh; overflow: auto;
  font: 13px/1.4 system-ui, -apple-system, sans-serif; color: var(--fg); background: var(--bg);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18);
}
@media (prefers-color-scheme: dark) {
  .panel { --bg: #202124; --fg: #e8eaed; --muted: #9aa0a6; --line: #3c4043; --btn: #303134; }
}
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
header strong { flex: 1; font-size: 13px; }
.counts { display: flex; flex-wrap: wrap; gap: 6px 12px; padding: 10px 12px; }
.count { display: flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
section { padding: 4px 12px 10px; }
h4 { margin: 6px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
.item { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.note { color: var(--muted); font-size: 11.5px; white-space: normal; }
li a { color: inherit; text-decoration: underline; text-decoration-color: var(--line); cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button { font: inherit; border: 1px solid var(--line); background: var(--btn); color: var(--fg);
  border-radius: 6px; padding: 3px 9px; cursor: pointer; }
button:hover { filter: brightness(.95); }
button.icon { border: none; background: none; font-size: 16px; padding: 0 4px; color: var(--muted); }
.foot { display: flex; gap: 8px; padding: 8px 12px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; align-items: center; }
.foot span { flex: 1; }
`;

export class Overlay {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private marked = new Map<HTMLElement, { outline: string; offset: string }>();
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.host) this.handlers.onClose();
  };

  constructor(
    private doc: Document,
    private handlers: OverlayHandlers,
  ) {}

  get isOpen(): boolean {
    return this.host !== null;
  }

  mark(el: HTMLElement, status: Status): void {
    const color = COLORS[status];
    if (!color) return;
    if (!this.marked.has(el)) {
      this.marked.set(el, { outline: el.style.outline, offset: el.style.outlineOffset });
    }
    el.style.outline = `2px solid ${color}`;
    el.style.outlineOffset = '2px';
  }

  unmark(el: HTMLElement): void {
    const prev = this.marked.get(el);
    if (!prev) return;
    el.style.outline = prev.outline;
    el.style.outlineOffset = prev.offset;
    this.marked.delete(el);
  }

  clearMarks(): void {
    [...this.marked.keys()].forEach((el) => this.unmark(el));
  }

  render(results: FieldResult[], watching: boolean): void {
    if (!this.host) {
      this.host = this.doc.createElement('div');
      this.host.id = OVERLAY_HOST_ID;
      this.root = this.host.attachShadow({ mode: 'open' });
      this.doc.documentElement.appendChild(this.host);
      this.doc.addEventListener('keydown', this.onKey, true);
    }
    const root = this.root!;
    root.innerHTML = '';
    const style = this.doc.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const by = (s: Status) => results.filter((r) => r.status === s);
    const panel = el(this.doc, 'div', { class: 'panel', role: 'status', 'aria-live': 'polite' });

    const header = el(this.doc, 'header');
    header.append(el(this.doc, 'strong', {}, 'Apply Autofill'));
    const close = el(this.doc, 'button', { class: 'icon', title: 'Close and stop (Esc)', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => this.handlers.onClose());
    header.append(close);
    panel.append(header);

    const counts = el(this.doc, 'div', { class: 'counts' });
    const items: [Status, string][] = [
      ['filled', 'filled'],
      ['check', 'to check'],
      ['freeText', 'for you to write'],
      ['missing', 'required missing'],
    ];
    for (const [status, text] of items) {
      const n = by(status).length;
      if (!n && status !== 'filled') continue;
      const c = el(this.doc, 'span', { class: 'count' });
      const dot = el(this.doc, 'span', { class: 'dot' });
      dot.style.background = COLORS[status]!;
      c.append(dot, `${n} ${text}`);
      counts.append(c);
    }
    panel.append(counts);

    const invalid = results.filter((r) => r.invalid);
    const sections: [string, FieldResult[], Status][] = [
      ['Filled, but the page still flags these', invalid, 'missing'],
      ...(['missing', 'freeText', 'check'] as Status[]).map(
        (s): [string, FieldResult[], Status] => [TITLES[s]!, by(s).filter((r) => !r.invalid), s],
      ),
    ];
    for (const [title, list, status] of sections) {
      if (!list.length) continue;
      const sec = el(this.doc, 'section');
      sec.append(el(this.doc, 'h4', {}, title));
      const ul = el(this.doc, 'ul');
      for (const r of list) {
        const li = el(this.doc, 'li');
        const item = el(this.doc, 'div', { class: 'item' });
        const a = el(this.doc, 'a', { tabindex: '0' }, r.field.label || r.field.type);
        a.title = r.field.label;
        const jump = () => {
          r.field.anchor.scrollIntoView({ block: 'center', behavior: 'smooth' });
          (r.field.el as HTMLElement).focus?.({ preventScroll: true });
        };
        a.addEventListener('click', jump);
        a.addEventListener('keydown', (e) => e.key === 'Enter' && jump());
        item.append(a);
        const note = r.invalid ?? r.note;
        if (note) item.append(el(this.doc, 'span', { class: 'note' }, note));
        li.append(item);
        if (status === 'freeText' && this.handlers.onDraft) {
          const draft = el(this.doc, 'button', { title: 'Draft an answer with AI. You can edit it before submitting.' }, 'Draft');
          draft.addEventListener('click', async () => {
            draft.textContent = '…';
            (draft as HTMLButtonElement).disabled = true;
            try {
              await this.handlers.onDraft!(r.field);
              draft.textContent = 'Done';
            } catch (err) {
              draft.textContent = 'Failed';
              draft.title = String((err as Error).message ?? err);
              (draft as HTMLButtonElement).disabled = false;
            }
          });
          li.append(draft);
        }
        ul.append(li);
      }
      sec.append(ul);
      panel.append(sec);
    }

    const foot = el(this.doc, 'div', { class: 'foot' });
    foot.append(el(this.doc, 'span', {}, watching ? 'Watching for the next step. Never submits.' : 'Review, then submit yourself.'));
    const undo = el(this.doc, 'button', { title: 'Restore what was there before the fill' }, 'Undo');
    undo.addEventListener('click', () => this.handlers.onUndo());
    foot.append(undo);
    panel.append(foot);

    root.append(panel);
  }

  destroy(): void {
    this.clearMarks();
    this.doc.removeEventListener('keydown', this.onKey, true);
    this.host?.remove();
    this.host = null;
    this.root = null;
  }
}

function el(doc: Document, tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}
