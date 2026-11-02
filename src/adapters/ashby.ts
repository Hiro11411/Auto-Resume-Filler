import type { Adapter } from './types';

// jobs.ashbyhq.com: system fields are id="_systemfield_<name>".
export const ashby: Adapter = {
  id: 'ashby',
  host: /^jobs\.ashbyhq\.com$/,
  rules: [
    { type: 'fullName', hint: /systemfield\s*name/ },
    { type: 'email', hint: /systemfield\s*email/ },
    { type: 'phone', hint: /systemfield\s*phone/ },
    { type: 'location', hint: /systemfield\s*location/ },
    { type: 'resume', hint: /systemfield\s*resume/, kinds: ['file'] },
  ],
  isApplication: (doc) => !!doc.querySelector('[id^="_systemfield_"], form[class*="application"]'),
};
