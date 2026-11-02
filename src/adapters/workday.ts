import type { Adapter } from './types';

// *.myworkdayjobs.com: everything carries data-automation-id; dropdowns are
// button[aria-haspopup=listbox]; the flow is multi-page (handled by continue.ts).
export const workday: Adapter = {
  id: 'workday',
  host: /(^|\.)myworkdayjobs\.com$|(^|\.)myworkday\.com$/,
  rules: [
    { type: 'firstName', hint: /legal\s*name\s*section\s*first\s*name/ },
    { type: 'lastName', hint: /legal\s*name\s*section\s*last\s*name/ },
    { type: 'middleName', hint: /legal\s*name\s*section\s*middle\s*name/ },
    { type: 'street', hint: /address\s*section\s*address\s*line\s*1/ },
    { type: 'street2', hint: /address\s*section\s*address\s*line\s*2/ },
    { type: 'city', hint: /address\s*section\s*city/ },
    { type: 'postalCode', hint: /address\s*section\s*postal\s*code/ },
    { type: 'state', hint: /address\s*section\s*country\s*region/ },
    { type: 'country', hint: /(^|\s)country(\s|$)|country\s*dropdown/ },
    { type: 'phone', hint: /phone\s*number/, not: /type|code|extension/i },
    { type: 'jobTitle', hint: /job\s*title/, section: 'work' },
    { type: 'company', hint: /company/, section: 'work' },
    { type: 'workLocation', hint: /location/, section: 'work' },
    { type: 'workCurrent', hint: /currently\s*work\s*here/, kinds: ['checkbox'] },
    { type: 'workDescription', hint: /role\s*description/, section: 'work' },
    { type: 'school', hint: /school\s*name|school/, section: 'education' },
    { type: 'degree', hint: /degree/, section: 'education' },
    { type: 'major', hint: /field\s*of\s*study/, section: 'education' },
    { type: 'gpa', hint: /grade\s*average|gpa/, section: 'education' },
  ],
  isApplication: (doc) =>
    !!doc.querySelector(
      '[data-automation-id="applyFlowPage"], [data-automation-id*="legalNameSection"], [data-automation-id="workExperienceSection"], [data-automation-id*="addressSection"]',
    ),
};
