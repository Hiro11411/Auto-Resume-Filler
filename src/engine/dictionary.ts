import type { FieldKind, FieldType } from './types';

export type Section = 'work' | 'education' | null;

export interface Rule {
  type: FieldType;
  /** Matched against the visible question text. */
  label?: RegExp;
  /** Matched against name/id/placeholder/data-* (camelCase split, lower-cased). */
  hint?: RegExp;
  /** Reject when the label matches this. */
  not?: RegExp;
  /** Only match inside this section of the form. */
  section?: Section | 'none';
  /** Only match these control kinds. */
  kinds?: FieldKind[];
}

const CHOICE: FieldKind[] = ['select', 'radio', 'checkbox', 'checkboxGroup', 'combobox', 'listbox'];
const FILE: FieldKind[] = ['file'];
const OPEN_QUESTION = /\bwhy\b|describe|tell us|explain|\bshare\b|elaborate|\?/i;

/**
 * Ordered most-specific first. On equal scores the earlier rule wins, so e.g.
 * `country` must come before `state` (Workday's "countryRegion").
 */
export const RULES: Rule[] = [
  // files
  { type: 'coverLetter', label: /cover\s*letter/i, hint: /cover\s*letter/, kinds: FILE },
  { type: 'resume', label: /r[eé]sum[eé]|\bcv\b|curriculum/i, hint: /resume|\bcv\b/, kinds: FILE },

  // links
  { type: 'linkedin', label: /linked\s*in/i, hint: /linked\s*in/ },
  { type: 'github', label: /git\s*hub/i, hint: /git\s*hub/ },
  { type: 'portfolio', label: /portfolio|personal\s*(web)?site/i, hint: /portfolio/ },
  { type: 'website', label: /\bwebsite\b|\burl\b|other\s*(link|url)|\bblog\b|twitter/i, hint: /website|\burl\b|urls other/, not: /company|employer/i },

  // contact
  { type: 'email', label: /e-?mail/i, hint: /e-?mail/, not: /referr|recruiter|manager|reference/i },
  { type: 'phoneCountryCode', label: /country\s*(phone\s*)?code|dial(ing)?\s*code/i, hint: /country\s*(phone\s*)?code|phone\s*code/ },
  { type: 'phone', label: /phone|mobile|\bcell\b|telephone|contact\s*number/i, hint: /phone|\btel\b|mobile/, not: /type|device|extension|code/i },

  // names
  { type: 'preferredName', label: /preferred\s*(first\s*)?name|nick\s*name|go(es)?\s*by/i, hint: /preferred\s*name/ },
  { type: 'firstName', label: /first\s*name|given\s*name|forename/i, hint: /first\s*name|\bfname\b|given\s*name/ },
  { type: 'middleName', label: /middle\s*(name|initial)/i, hint: /middle\s*name/ },
  { type: 'lastName', label: /last\s*name|surname|family\s*name/i, hint: /last\s*name|\blname\b|surname|family\s*name/ },
  {
    type: 'fullName',
    label: /^(your\s*|full\s*|legal\s*)?name$|full\s*name|legal\s*name/i,
    hint: /(^|\s)name(\s|$)|full\s*name/,
    not: /company|school|employer|reference|manager|recruiter|university|emergency|referr|user/i,
  },
  { type: 'pronouns', label: /pronoun/i, hint: /pronoun/ },

  // address
  { type: 'street2', label: /address\s*(line)?\s*2|apartment|\bapt\b|suite|\bunit\b/i, hint: /address\s*(line)?\s*2/ },
  {
    type: 'street',
    label: /street|address\s*(line)?\s*1|^address$|mailing\s*address|home\s*address/i,
    hint: /address\s*(line)?\s*1|street/,
    not: /e-?mail|web|url|\bip\b/i,
  },
  { type: 'postalCode', label: /\bzip\b|postal|post\s*code/i, hint: /\bzip\b|postal/ },
  { type: 'city', label: /^city$|\bcity\b(?!.*state)|\btown\b/i, hint: /\bcity\b/, not: /current\s*city.*state/i },
  { type: 'country', label: /\bcountry\b/i, hint: /country/, not: /code|citizenship|other\s*countr|\?/i },
  { type: 'state', label: /\bstate\b|province|region/i, hint: /\bstate\b|province|region/, not: /united\s*states|statement/i },
  {
    type: 'location',
    label: /\blocation\b|where\s*(are\s*)?you\s*(currently\s*)?(located|based|live)|city.*state|current\s*city/i,
    hint: /\blocation\b/,
    not: /preferred|willing|office|relocat|\bwork\s*location/i,
    section: 'none',
  },

  // application questions (mostly choices)
  { type: 'needsSponsorship', label: /sponsor/i, hint: /sponsor/ },
  {
    type: 'workAuthorized',
    label: /(authori[sz]ed|eligible|permitted|legally\s*able|right)\s*to\s*work|work\s*authori[sz]ation|eligib(le|ility)\s*(to|for)\s*(work|employment)/i,
    hint: /work\s*auth|authori[sz]ed/,
  },
  { type: 'over18', label: /(18|eighteen)\s*years|at\s*least\s*18|over\s*(the\s*age\s*of\s*)?18|age\s*of\s*18/i },
  { type: 'relocate', label: /relocat/i, hint: /relocat/ },
  { type: 'noticePeriod', label: /notice\s*period|notice\s*required/i },
  { type: 'salary', label: /salary|compensation|pay\s*expectation|(desired|expected)\s*pay/i, hint: /salary|compensation/ },
  { type: 'referralSource', label: /(how|where)\s*did\s*you\s*(first\s*)?(hear|find|learn)|hear\s*about/i, hint: /source|hear\s*about/ },
  { type: 'hispanic', label: /hispanic|latin[oax]/i, hint: /hispanic/ },
  { type: 'race', label: /\brace\b|ethnic/i, hint: /\brace\b|ethnic/ },
  { type: 'gender', label: /gender|\bsex\b/i, hint: /gender/, not: /transgender|orientation/i },
  { type: 'veteran', label: /veteran|military|armed\s*forces/i, hint: /veteran/ },
  { type: 'disability', label: /disabilit/i, hint: /disabilit/ },

  // current job (single, outside repeating sections)
  { type: 'currentCompany', label: /(current|most\s*recent|present)\s*(company|employer|organi[sz]ation)/i, hint: /(^|\s)org(\s|$)|current\s*company/ },
  { type: 'currentTitle', label: /(current|most\s*recent|present)\s*(job\s*)?(title|position|role)/i, hint: /current\s*title/ },

  // repeating: work
  { type: 'workCurrent', label: /currently\s*work|i\s*(currently\s*)?work\s*here|current\s*(role|position|job|employer)/i, hint: /currently\s*work/, kinds: ['checkbox'] },
  { type: 'company', label: /company|employer|organi[sz]ation/i, hint: /company|employer/, not: /why|interest|hear|previous|before|ever|this\s*company|our\s*company|size|website|\?/i },
  { type: 'jobTitle', label: /job\s*title|\btitle\b|position|\brole\b/i, hint: /job\s*title|(^|\s)title(\s|$)/, not: /why|interest|desired|applying|\?/i },
  { type: 'workStart', label: /start|from/i, hint: /start\s*date|from/, section: 'work' },
  { type: 'workEnd', label: /\bend\b|\bto\b|until/i, hint: /end\s*date|(^|\s)to(\s|$)/, section: 'work' },
  { type: 'workLocation', label: /location|city/i, hint: /location/, section: 'work' },
  { type: 'workDescription', label: /description|responsibilit|summary/i, hint: /description/, section: 'work' },

  // repeating: education
  { type: 'school', label: /school|university|college|institution/i, hint: /school|university|institution/, not: /high\s*school\s*(diploma|graduat)|did\s*you|\?/i },
  // "What degree are you currently enrolled in?" is a degree question; "Do you have a degree?" is not.
  {
    type: 'degree',
    label: /(what|which)\s*(type\s*of\s*|level\s*of\s*)?degree|highest\s*(level\s*of\s*)?(degree|education)|degree\s*.*\b(pursuing|enrolled|seeking|working\s*toward|earning)|level\s*of\s*education|education\s*level/i,
    not: /^(do|have|did|are|will)\b/i,
  },
  { type: 'degree', label: /degree|qualification/i, hint: /degree/, not: /\?/ },
  { type: 'minor', label: /\bminor\b/i, hint: /\bminor\b/ },
  { type: 'major', label: /major|field\s*of\s*study|discipline|area\s*of\s*study|concentration/i, hint: /major|field\s*of\s*study|discipline/ },
  { type: 'gpa', label: /\bgpa\b|grade\s*point|cgpa/i, hint: /\bgpa\b/ },
  { type: 'eduEnd', label: /graduat(ion|e)\s*(date|year)|expected\s*graduation|grad\s*date|class\s*of/i, hint: /graduat/ },
  { type: 'eduStart', label: /start|from/i, hint: /start\s*date|from/, section: 'education' },
  { type: 'eduEnd', label: /\bend\b|\bto\b|until/i, hint: /end\s*date|(^|\s)to(\s|$)/, section: 'education' },

  // availability (outside repeating sections, so "Start date" there isn't a job's start)
  {
    type: 'startDate',
    label: /start\s*date|when\s*can\s*you\s*start|available\s*to\s*start|earliest\s*(start|availab)|date\s*available|availability/i,
    section: 'none',
  },

  // misc profile text
  { type: 'skills', label: /skills|technologies|tech\s*stack/i, hint: /skills/, not: OPEN_QUESTION },
  { type: 'languages', label: /^languages?(\s*spoken)?$|languages?\s*(do\s*)?you\s*speak/i },
  { type: 'certifications', label: /certification|licen[cs]es?\b/i, not: /driver|\?/i },
];

/**
 * Citizenship / export-control questions, checked before every other rule so
 * their wording ("Crimea region", "used by the company") can't match an
 * unrelated profile field. Order matters: the acknowledgment paragraph and the
 * sanctioned-country question both mention citizens and permanent residents.
 */
export const EXPORT_ACK_RE = /export\s*control|deemed\s*export|selection\s*criteria/i;
export const ACK_WORDS_RE = /read\s*and\s*understand|acknowledg|i\s*understand|i\s*agree|i\s*certify|i\s*confirm/i;
export const SANCTIONED_RE = /\b(cuba|iran|north\s*korea|syria|crimea|sudan)\b|sanction(ed)?\s*countr|embargoed/i;
export const US_PERSON_RE = /citizen/i;
export const US_PERSON_DETAIL_RE = /permanent\s*resident|green\s*card|asylee|asylum|refugee|1986/i;
export const SENSITIVE_RE = /citizen(ship)?|nationality|permanent\s*resident|green\s*card|export\s*control|deemed\s*export|security\s*clearance|\bitar\b|\bear99\b/i;

/** Open-ended prompts that need a sentence or more: always left for the user. */
export const FREE_TEXT_RE =
  /\bwhy\b|describe|tell\s*us|explain|what\s*(interests|excites|motivates|makes|drew|draws)|elaborate|anything\s*else|about\s*yourself|cover\s*letter|additional\s*(info|comments|details)|\bsummary\b|in\s*your\s*own\s*words/i;

export const CHOICE_KINDS: ReadonlySet<FieldKind> = new Set(CHOICE);

export const AUTOCOMPLETE: Record<string, FieldType> = {
  'given-name': 'firstName',
  'additional-name': 'middleName',
  'family-name': 'lastName',
  name: 'fullName',
  nickname: 'preferredName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'tel-country-code': 'phoneCountryCode',
  'street-address': 'street',
  'address-line1': 'street',
  'address-line2': 'street2',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'postalCode',
  country: 'country',
  'country-name': 'country',
  organization: 'currentCompany',
  'organization-title': 'currentTitle',
  url: 'website',
};
