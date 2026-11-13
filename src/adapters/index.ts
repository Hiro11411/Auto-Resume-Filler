import { ashby } from './ashby';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import type { Adapter } from './types';
import { workday } from './workday';

// These use plain labelled inputs (iCIMS and Taleo inside iframes, which all-frames
// injection reaches), so the generic engine handles them. Their adapters exist so
// detection knows they're application sites; add rules here when a field is missed.
const icims: Adapter = { id: 'icims', host: /(^|\.)icims\.com$/ };
const smartrecruiters: Adapter = { id: 'smartrecruiters', host: /(^|\.)smartrecruiters\.com$/ };
const workable: Adapter = { id: 'workable', host: /^apply\.workable\.com$/ };
const jobvite: Adapter = { id: 'jobvite', host: /^jobs\.jobvite\.com$/ };
const bamboohr: Adapter = { id: 'bamboohr', host: /(^|\.)bamboohr\.com$/ };
const rippling: Adapter = { id: 'rippling', host: /^ats\.rippling\.com$/ };
const oracle: Adapter = { id: 'oracle', host: /(^|\.)oraclecloud\.com$/ };
const successfactors: Adapter = { id: 'successfactors', host: /(^|\.)successfactors\.(com|eu)$/ };
const taleo: Adapter = { id: 'taleo', host: /(^|\.)taleo\.net$/ };
/** Fallback for every other site: generic rules only. Its host pattern never matches. */
export const generic: Adapter = { id: 'generic', host: /(?!)/ };

export const ADAPTERS: Adapter[] = [
  greenhouse,
  lever,
  ashby,
  workday,
  icims,
  smartrecruiters,
  workable,
  jobvite,
  bamboohr,
  rippling,
  oracle,
  successfactors,
  taleo,
];

export function pickAdapter(hostname: string): Adapter {
  return ADAPTERS.find((a) => a.host.test(hostname)) ?? generic;
}

export type { Adapter };
