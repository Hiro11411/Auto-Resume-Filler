import type { Adapter } from '../adapters/types';
import type { Classified } from './types';

const IDENTITY = new Set(['firstName', 'lastName', 'fullName']);
const APPLY_RE = /\b(apply|application|careers?|jobs?|position|candidate)\b/i;

export interface Detection {
  ok: boolean;
  reason: string;
}

/**
 * Should auto mode fill this page? Deliberately conservative: a wrong guess
 * means typing someone's details into a newsletter or checkout form.
 */
export function isApplicationForm(doc: Document, fields: Classified[], hasPassword: boolean, adapter: Adapter): Detection {
  if (hasPassword) return { ok: false, reason: 'login or sign-up form' };

  const facts = fields.filter((f) => f.type !== 'unknown' && f.type !== 'freeText' && f.confidence >= 0.6);
  const types = new Set(facts.map((f) => f.type));
  const hasIdentity = [...types].some((t) => IDENTITY.has(t));
  const hasEmail = types.has('email');
  const hasResume = types.has('resume');

  if (adapter.isApplication?.(doc) && (hasIdentity || hasEmail || hasResume)) {
    return { ok: true, reason: `${adapter.id} form` };
  }

  if (!hasIdentity || !hasEmail) return { ok: false, reason: 'no name + email fields' };
  if (types.size < 4) return { ok: false, reason: 'too few profile fields' };

  const heading = doc.querySelector('h1, h2')?.textContent ?? '';
  const looksLikeJob = hasResume || APPLY_RE.test(doc.location?.href ?? '') || APPLY_RE.test(doc.title) || APPLY_RE.test(heading);
  if (!looksLikeJob) return { ok: false, reason: 'no resume upload or application wording' };
  return { ok: true, reason: 'generic application form' };
}
