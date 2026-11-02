import { ashby } from './ashby';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import type { Adapter } from './types';
import { workday } from './workday';

// iCIMS and SmartRecruiters use plain labelled inputs (iCIMS inside an iframe,
// which all-frames injection reaches), so the generic engine handles them; they
// get named adapters only so detection knows they're application sites.
const icims: Adapter = { id: 'icims', host: /(^|\.)icims\.com$/ };
const smartrecruiters: Adapter = { id: 'smartrecruiters', host: /(^|\.)smartrecruiters\.com$/ };
/** Fallback for every other site: generic rules only. Its host pattern never matches. */
export const generic: Adapter = { id: 'generic', host: /(?!)/ };

export const ADAPTERS: Adapter[] = [greenhouse, lever, ashby, workday, icims, smartrecruiters];

export function pickAdapter(hostname: string): Adapter {
  return ADAPTERS.find((a) => a.host.test(hostname)) ?? generic;
}

export type { Adapter };
