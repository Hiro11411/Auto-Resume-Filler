import type { Adapter } from './types';

// jobs.lever.co/<company>/<id>/apply: one "name" field, current company is name="org",
// links are urls[LinkedIn] etc., custom questions are cards[...].
export const lever: Adapter = {
  id: 'lever',
  host: /^jobs\.(eu\.)?lever\.co$/,
  rules: [
    { type: 'fullName', hint: /^name$/ },
    { type: 'currentCompany', hint: /^org$/ },
    { type: 'linkedin', hint: /urls\s*linked\s*in/ },
    { type: 'github', hint: /urls\s*git\s*hub/ },
    { type: 'portfolio', hint: /urls\s*portfolio/ },
    { type: 'website', hint: /urls\s*other/ },
    { type: 'gender', hint: /eeo\s*gender/ },
    { type: 'race', hint: /eeo\s*race/ },
    { type: 'veteran', hint: /eeo\s*veteran/ },
    { type: 'disability', hint: /eeo\s*disability/ },
  ],
  isApplication: (doc) => !!doc.querySelector('.application-form, form[action*="/apply"], #application-form'),
};
