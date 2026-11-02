import type { Adapter } from './types';

// boards.greenhouse.io (classic) and job-boards.greenhouse.io (React, react-select dropdowns).
export const greenhouse: Adapter = {
  id: 'greenhouse',
  host: /(^|\.)greenhouse\.io$/,
  rules: [
    { type: 'firstName', hint: /^first name|\bfirst name\b/ },
    { type: 'lastName', hint: /^last name|\blast name\b/ },
    { type: 'school', hint: /education\s*school|school\s*name/ },
    { type: 'degree', hint: /education\s*degree/ },
    { type: 'major', hint: /discipline/ },
  ],
  isApplication: (doc) =>
    !!doc.querySelector('#application_form, #application-form, form[action*="applications"], #first_name, input[name="first_name"]'),
};
