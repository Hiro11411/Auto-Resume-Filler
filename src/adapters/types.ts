import type { Rule } from '../engine/dictionary';
import type { WidgetOverrides } from '../engine/widgets';

/**
 * Per-site knowledge. Everything is optional: a host-only adapter just tells
 * detection "this is an application site" and the generic engine does the rest.
 */
export interface Adapter {
  id: string;
  /** Hostname test. */
  host: RegExp;
  /** Extra classification rules, checked before the generic dictionary. */
  rules?: Rule[];
  /**
   * Site-specific "this is the application form" markers; falls back to generic
   * detection. When it returns true on load, the first fill runs immediately
   * instead of waiting for the page to go quiet.
   */
  isApplication?(doc: Document): boolean;
  /** Replace parts of a widget for this site's controls (custom dropdowns etc.). */
  widgets?: WidgetOverrides;
}
