import type { Rule } from '../engine/dictionary';

export interface Adapter {
  id: string;
  /** Hostname test. */
  host: RegExp;
  /** Extra classification rules, checked before the generic dictionary. */
  rules?: Rule[];
  /** Site-specific "this is the application form" markers; falls back to generic detection. */
  isApplication?(doc: Document): boolean;
}
