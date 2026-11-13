// `*://` rather than `https://` so the E2E suite can serve fixtures over plain
// http behind --host-resolver-rules; the real sites are all https.
export const ATS_MATCHES = [
  '*://*.greenhouse.io/*',
  '*://jobs.lever.co/*',
  '*://jobs.eu.lever.co/*',
  '*://jobs.ashbyhq.com/*',
  '*://*.myworkdayjobs.com/*',
  '*://*.icims.com/*',
  '*://*.smartrecruiters.com/*',
  '*://apply.workable.com/*',
  '*://jobs.jobvite.com/*',
  '*://*.bamboohr.com/careers/*',
  '*://ats.rippling.com/*',
  '*://*.oraclecloud.com/hcmUI/CandidateExperience/*',
  '*://*.successfactors.com/*',
  '*://*.successfactors.eu/*',
  '*://*.taleo.net/*',
];

export const AI_ORIGIN = 'https://api.anthropic.com';
