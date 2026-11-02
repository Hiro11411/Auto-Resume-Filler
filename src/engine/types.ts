export type FieldType =
  // identity & contact
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'fullName'
  | 'preferredName'
  | 'pronouns'
  | 'email'
  | 'phone'
  | 'phoneCountryCode'
  | 'street'
  | 'street2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'location'
  // links
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'website'
  // work history (repeating: nth occurrence on the page → nth job)
  | 'company'
  | 'jobTitle'
  | 'workLocation'
  | 'workStart'
  | 'workEnd'
  | 'workCurrent'
  | 'workDescription'
  | 'currentCompany'
  | 'currentTitle'
  // education (repeating)
  | 'school'
  | 'degree'
  | 'major'
  | 'minor'
  | 'gpa'
  | 'eduStart'
  | 'eduEnd'
  // misc profile
  | 'skills'
  | 'languages'
  | 'certifications'
  // application questions
  | 'workAuthorized'
  | 'needsSponsorship'
  | 'over18'
  | 'relocate'
  | 'startDate'
  | 'salary'
  | 'noticePeriod'
  | 'referralSource'
  | 'gender'
  | 'race'
  | 'hispanic'
  | 'veteran'
  | 'disability'
  // citizenship & export control: profile answers only, never guessed (see SENSITIVE_TYPES)
  | 'usPerson'
  | 'sanctionedCountry'
  | 'exportControlAck'
  | 'sensitive'
  // files
  | 'resume'
  | 'coverLetter'
  // not a profile fact
  | 'freeText'
  | 'unknown';

/**
 * Types that are screening questions rather than identity facts. Per the user's
 * fill policy these are only answered when the question is required, or when
 * "fill optional questions" is turned on.
 */
export const QUESTION_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'relocate',
  'startDate',
  'salary',
  'noticePeriod',
  'referralSource',
  'gender',
  'race',
  'hispanic',
  'veteran',
  'disability',
  'pronouns',
]);

/**
 * Legal questions about citizenship, export control and work authorization.
 * They are answered only from values the user saved in their profile: never
 * guessed by AI, never inferred. With no saved value they're left empty and flagged.
 */
export const SENSITIVE_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'workAuthorized',
  'needsSponsorship',
  'usPerson',
  'sanctionedCountry',
  'exportControlAck',
  'sensitive',
]);

/** Repeating section types, filled by ordinal (1st school field → education[0]...). */
export const WORK_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'company',
  'jobTitle',
  'workLocation',
  'workStart',
  'workEnd',
  'workCurrent',
  'workDescription',
]);

export const EDU_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'school',
  'degree',
  'major',
  'minor',
  'gpa',
  'eduStart',
  'eduEnd',
]);

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'contenteditable'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'checkboxGroup'
  | 'combobox'
  | 'listbox'
  | 'file';

export interface Choice {
  label: string;
  el: HTMLElement;
}

export interface Field {
  kind: FieldKind;
  /** Primary element: the input itself, or the group container for radio/checkbox groups. */
  el: HTMLElement;
  /** Element to outline in the overlay (a visible stand-in for hidden file inputs). */
  anchor: HTMLElement;
  /** For radio / checkbox groups. */
  choices?: Choice[];
  label: string;
  /** name, id, placeholder and data-* attributes, lower-cased, used as weaker matching signals. */
  hints: string;
  autocomplete: string;
  required: boolean;
  inputType: string;
  maxLength: number;
}

export interface Classified extends Field {
  type: FieldType;
  confidence: number;
  /** For split date fields: which part this control holds. */
  datePart?: 'month' | 'year';
  /** 0-based index of this field among fields of the same type (repeating sections). */
  ordinal: number;
}

export type Status =
  | 'filled' // confident fill
  | 'check' // filled but worth a look
  | 'answered' // the user answered it after the fill
  | 'freeText' // left for the user to write
  | 'missing' // required and we had nothing / failed
  | 'optional' // optional question left empty on purpose
  | 'prefilled' // already had a value
  | 'ignored'; // unknown optional field

export interface FieldResult {
  field: Classified;
  status: Status;
  value?: string;
  /** Why it was left or what to do, shown in the panel. */
  note?: string;
  /** The page still reports this field as invalid after filling. */
  invalid?: string;
}

export interface Summary {
  filled: number;
  check: number;
  freeText: number;
  missing: number;
  optional: number;
  host: string;
  at: number;
}
