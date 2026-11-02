import type { Job, Profile, School } from '../profile/schema';
import type { Classified } from './types';

function currentJob(p: Profile): Job | undefined {
  return p.work.find((j) => j.current) ?? p.work[0];
}

const join = (...parts: string[]) => parts.filter(Boolean).join(', ');

/** The profile value for a classified field, as a plain string ('' when we don't have one). */
export function valueFor(f: Classified, p: Profile): string {
  const job: Job | undefined = p.work[f.ordinal];
  const school: School | undefined = p.education[f.ordinal];
  const a = p.address;
  switch (f.type) {
    case 'firstName':
      return p.firstName;
    case 'middleName':
      return p.middleName;
    case 'lastName':
      return p.lastName;
    case 'fullName':
      return [p.firstName, p.lastName].filter(Boolean).join(' ');
    case 'preferredName':
      return p.preferredName || p.firstName;
    case 'pronouns':
      return p.pronouns;
    case 'email':
      return p.email;
    case 'phone':
      return p.phone;
    case 'phoneCountryCode':
      return p.phoneCountryCode;
    case 'street':
      return a.street;
    case 'street2':
      return a.street2;
    case 'city':
      return a.city;
    case 'state':
      return a.state;
    case 'postalCode':
      return a.postalCode;
    case 'country':
      return a.country;
    case 'location':
      return join(a.city, a.state || a.country);
    case 'linkedin':
      return p.links.linkedin;
    case 'github':
      return p.links.github;
    case 'portfolio':
      return p.links.portfolio || p.links.other;
    case 'website':
      return p.links.portfolio || p.links.other || p.links.github;
    case 'currentCompany':
      return currentJob(p)?.company ?? '';
    case 'currentTitle':
      return currentJob(p)?.title ?? '';
    case 'company':
      return job?.company ?? '';
    case 'jobTitle':
      return job?.title ?? '';
    case 'workLocation':
      return job?.location ?? '';
    case 'workStart':
      return job?.start ?? '';
    case 'workEnd':
      return job && !job.current ? job.end : '';
    case 'workCurrent':
      return job ? (job.current ? 'yes' : 'no') : '';
    case 'workDescription':
      return job?.description ?? '';
    case 'school':
      return school?.school ?? '';
    case 'degree':
      return school?.degree ?? '';
    case 'major':
      return school?.major ?? '';
    case 'minor':
      return school?.minor ?? '';
    case 'gpa':
      return school?.gpa ?? '';
    case 'eduStart':
      return school?.start ?? '';
    case 'eduEnd':
      return school?.end ?? '';
    case 'skills':
      return p.skills;
    case 'languages':
      return p.languages;
    case 'certifications':
      return p.certifications;
    case 'workAuthorized':
      return p.facts.workAuthorized;
    case 'needsSponsorship':
      return p.facts.needsSponsorship;
    case 'over18':
      return p.facts.over18;
    case 'relocate':
      return p.facts.willingToRelocate;
    case 'startDate':
      return p.facts.startDate;
    case 'salary':
      return p.facts.desiredSalary;
    case 'noticePeriod':
      return p.facts.noticePeriod;
    case 'referralSource':
      return p.facts.referralSource;
    case 'gender':
      return p.facts.gender;
    case 'race':
      return p.facts.race;
    case 'hispanic':
      return p.facts.hispanic;
    case 'veteran':
      return p.facts.veteran;
    case 'disability':
      return p.facts.disability;
    case 'usPerson':
      return p.facts.usPerson;
    case 'sanctionedCountry':
      return p.facts.sanctionedCountry;
    case 'exportControlAck':
      return p.facts.exportControlAck === 'yes' ? 'yes' : '';
    case 'resume':
    case 'coverLetter':
    case 'sensitive':
    case 'freeText':
    case 'unknown':
      return '';
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DATE_TYPES = new Set(['workStart', 'workEnd', 'eduStart', 'eduEnd']);

/** Format a stored `YYYY-MM` (or `YYYY-MM-DD`) for this particular control. */
export function formatForField(f: Classified, value: string): string {
  if (!DATE_TYPES.has(f.type) && f.type !== 'startDate') return value;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!m) return value;
  const [, year, month, day = '01'] = m;
  if (f.datePart === 'year') return year;
  if (f.datePart === 'month') {
    return f.kind === 'text' ? month : MONTHS[Number(month) - 1];
  }
  if (f.inputType === 'month') return `${year}-${month}`;
  if (f.inputType === 'date') return `${year}-${month}-${day}`;
  if (f.kind !== 'text') return `${MONTHS[Number(month) - 1]} ${year}`;
  const ph = ((f.el.getAttribute('placeholder') ?? '') + ' ' + f.hints).toLowerCase();
  if (/mm\s*\/\s*dd\s*\/\s*yyyy/.test(ph)) return `${month}/${day}/${year}`;
  if (/dd\s*\/\s*mm\s*\/\s*yyyy/.test(ph)) return `${day}/${month}/${year}`;
  if (/yyyy\s*-\s*mm/.test(ph)) return `${year}-${month}`;
  return f.type === 'startDate' ? `${month}/${day}/${year}` : `${month}/${year}`;
}
