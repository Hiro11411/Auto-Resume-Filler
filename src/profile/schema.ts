export type YesNo = '' | 'yes' | 'no';

/** Dates are stored as `YYYY-MM` (month precision is all applications ask for). */
export interface Job {
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
  current: boolean;
  description: string;
}

export interface School {
  school: string;
  degree: string;
  major: string;
  minor: string;
  gpa: string;
  start: string;
  end: string;
}

export interface Profile {
  version: 1;
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  email: string;
  phoneCountryCode: string;
  phone: string;
  address: {
    street: string;
    street2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  links: {
    linkedin: string;
    github: string;
    portfolio: string;
    other: string;
  };
  work: Job[];
  education: School[];
  skills: string;
  languages: string;
  certifications: string;
  facts: {
    workAuthorized: YesNo;
    needsSponsorship: YesNo;
    over18: YesNo;
    willingToRelocate: YesNo;
    startDate: string;
    desiredSalary: string;
    noticePeriod: string;
    referralSource: string;
    gender: string;
    race: string;
    hispanic: YesNo;
    veteran: string;
    disability: string;
    /** Export control "U.S. person": citizen, green card holder, asylee, refugee, or 1986-program temporary resident. */
    usPerson: YesNo;
    /** National, citizen or permanent resident of a U.S.-sanctioned country (Cuba, Iran, North Korea, Syria, Crimea...). */
    sanctionedCountry: YesNo;
    /** Tick export-control acknowledgments such as "I have read and understand the selection criteria". */
    exportControlAck: YesNo;
  };
}

export interface Settings {
  autoMode: boolean;
  pausedSites: string[];
  /** User granted the optional <all_urls> permission and wants auto mode everywhere. */
  anySite: boolean;
  /** Also answer optional screening questions (salary, referral source, EEO...). */
  fillOptional: boolean;
  autoContinue: boolean;
  ai: {
    enabled: boolean;
    apiKey: string;
    mapModel: string;
    draftModel: string;
  };
}

export interface StoredFile {
  name: string;
  type: string;
  dataUrl: string;
}

export interface Files {
  resume?: StoredFile;
  coverLetter?: StoredFile;
}

export const emptyJob = (): Job => ({
  company: '',
  title: '',
  location: '',
  start: '',
  end: '',
  current: false,
  description: '',
});

export const emptySchool = (): School => ({
  school: '',
  degree: '',
  major: '',
  minor: '',
  gpa: '',
  start: '',
  end: '',
});

export const emptyProfile = (): Profile => ({
  version: 1,
  firstName: '',
  middleName: '',
  lastName: '',
  preferredName: '',
  pronouns: '',
  email: '',
  phoneCountryCode: '',
  phone: '',
  address: { street: '', street2: '', city: '', state: '', postalCode: '', country: '' },
  links: { linkedin: '', github: '', portfolio: '', other: '' },
  work: [],
  education: [],
  skills: '',
  languages: '',
  certifications: '',
  facts: {
    workAuthorized: '',
    needsSponsorship: '',
    over18: '',
    willingToRelocate: '',
    startDate: '',
    desiredSalary: '',
    noticePeriod: '',
    referralSource: '',
    gender: '',
    race: '',
    hispanic: '',
    veteran: '',
    disability: '',
    usPerson: '',
    sanctionedCountry: '',
    exportControlAck: '',
  },
});

export const defaultSettings = (): Settings => ({
  autoMode: true,
  pausedSites: [],
  anySite: false,
  fillOptional: false,
  autoContinue: true,
  ai: {
    enabled: false,
    apiKey: '',
    mapModel: 'claude-haiku-5-5',
    draftModel: 'claude-sonnet-5-5',
  },
});

/** Deep-merge stored data over defaults so fields added in later versions get filled in. */
export function withDefaults<T>(defaults: T, stored: unknown): T {
  if (stored === undefined || stored === null) return defaults;
  if (Array.isArray(defaults)) return (Array.isArray(stored) ? stored : defaults) as T;
  if (typeof defaults === 'object' && defaults !== null) {
    if (typeof stored !== 'object') return defaults;
    const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
    for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
      out[k] = k in out ? withDefaults(out[k], v) : v;
    }
    return out as T;
  }
  return (typeof stored === typeof defaults ? stored : defaults) as T;
}

export function isProfileEmpty(p: Profile): boolean {
  return !p.firstName && !p.lastName && !p.email;
}
