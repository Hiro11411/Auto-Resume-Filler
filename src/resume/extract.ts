import { emptyJob, emptySchool, type Job, type School } from '../profile/schema';

export interface ExtractedResume {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  linkedin: string;
  github: string;
  portfolio: string;
  skills: string;
  work: Job[];
  education: School[];
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s|,]*)?)/gi;
const CITY_STATE_RE = /\b([A-Z][a-zA-Z.]+(?:[ \t][A-Z][a-zA-Z.]+)*),[ \t]*([A-Z]{2})\b/;

const MONTH_NAMES: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s*\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now)`, 'i');
const GRAD_RE = new RegExp(`(?:expected|graduat\\w*|class of)?\\s*(${MONTH}\\s*\\d{4}|\\d{4})`, 'i');

const HEADINGS: Record<string, RegExp> = {
  experience: /^(work\s+|professional\s+|relevant\s+)?(experience|employment(\s+history)?|work\s+history)$/i,
  education: /^education(\s+&\s+\w+)?$/i,
  skills: /^(technical\s+)?skills(\s+&\s+\w+)?$|^technologies$/i,
  other: /^(projects|certifications?|awards|honors|publications|leadership|activities|volunteer(ing)?|interests|summary|profile|objective|languages|involvement)(\s+(&|and)\s+\w+)?$/i,
};

const TITLE_RE =
  /engineer|developer|intern|manager|analyst|designer|scientist|assistant|consultant|lead|director|associate|specialist|coordinator|researcher|teaching|officer|technician|architect|administrator|founder|president|representative|programmer/i;
const SCHOOL_RE = /university|college|institute|school|academy|polytechnic/i;
// Spelled-out degrees match any case; abbreviations must be uppercase or dotted so "MA" (Massachusetts) isn't a degree.
const DEGREE_RE = /\b(?:[Bb]achelor|[Mm]aster|Ph\.?\s?D|[Dd]octor(?:ate)?|[Aa]ssociate|MBA|B\.S\.|M\.S\.|B\.A\.|M\.A\.|BSc|MSc|BS|MS|B\.?Eng|M\.?Eng|[Dd]iploma)\b/;
const BULLET_RE = /^[•▪●◦‣\-*–·]\s*/;
const LOCATION_RE = /\b[A-Z][a-zA-Z.]+(?:[ \t][A-Z][a-zA-Z.]+)*,[ \t]*[A-Z]{2}\b|\bremote\b/;
/** A trailing "City, ST" / "New York, NY" on a school line. */
const TRAILING_LOCATION = [/\s+[A-Z][a-zA-Z.]+[ \t][A-Z][a-zA-Z.]+,[ \t]*[A-Z]{2}$/, /\s+[A-Z][a-zA-Z.]+,[ \t]*[A-Z]{2}$/];

/** Drop a trailing location, but never eat into the school's own name ("Lakeside University Boston, MA"). */
function stripSchoolLocation(s: string): string {
  for (const re of TRAILING_LOCATION) {
    const rest = s.replace(re, '').trim();
    if (rest !== s && SCHOOL_RE.test(rest)) return rest;
  }
  return s;
}

export function toYearMonth(s: string): string {
  const t = s.trim().toLowerCase();
  if (/present|current|now/.test(t)) return '';
  let m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^([a-z]{3})[a-z]*\.?\s*(\d{4})$/.exec(t);
  if (m && MONTH_NAMES[m[1]]) return `${m[2]}-${MONTH_NAMES[m[1]]}`;
  m = /^(\d{4})$/.exec(t);
  if (m) return `${m[1]}-01`;
  return '';
}

function splitSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = { header: [] };
  let current = 'header';
  for (const line of lines) {
    const bare = line.replace(/[:|]+$/, '').trim();
    // "Languages: TypeScript, Go" is content, not a heading.
    const heading = bare.length < 40 && !/:\s*\S/.test(line) && Object.entries(HEADINGS).find(([, re]) => re.test(bare));
    if (heading) {
      current = heading[0];
      sections[current] ??= [];
      continue;
    }
    (sections[current] ??= []).push(line);
  }
  return sections;
}

function splitHeader(text: string): string[] {
  return text
    .split(/\s+[|•·]\s+|\s{2,}|\s+[–—]\s+|,\s+(?=[A-Z][a-z]+\s+[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseWork(lines: string[]): Job[] {
  const jobs: Job[] = [];
  let job: Job | null = null;
  let headerBuffer: string[] = [];
  for (const line of lines) {
    const range = RANGE_RE.exec(line);
    if (range) {
      if (job) jobs.push(job);
      job = emptyJob();
      job.start = toYearMonth(range[1]);
      job.current = /present|current|now/i.test(range[2]);
      job.end = toYearMonth(range[2]);
      const rest = line.replace(range[0], '').trim();
      const parts = [...headerBuffer, ...splitHeader(rest)].filter((p) => !BULLET_RE.test(p));
      for (const part of parts) {
        const loc = LOCATION_RE.exec(part);
        if (loc && loc[0].length >= part.length - 2) {
          job.location ||= loc[0];
        } else if (!job.title && TITLE_RE.test(part)) {
          job.title = part.replace(/[,|]$/, '');
        } else if (!job.company) {
          job.company = part.replace(/[,|]$/, '');
        } else if (!job.title) {
          job.title = part;
        }
      }
      headerBuffer = [];
      continue;
    }
    if (BULLET_RE.test(line) && job) {
      job.description += (job.description ? '\n' : '') + line.replace(BULLET_RE, '').trim();
      continue;
    }
    // A non-bullet line after an entry's bullets starts the next entry's header.
    if (job && job.description && !BULLET_RE.test(line)) {
      headerBuffer.push(...splitHeader(line));
    } else if (job && !job.description) {
      // Title or company on the line after the dates.
      for (const part of splitHeader(line)) {
        if (!job.title && TITLE_RE.test(part)) job.title = part;
        else if (!job.company) job.company = part;
        else if (!job.location && LOCATION_RE.test(part)) job.location = part;
      }
    } else {
      headerBuffer.push(...splitHeader(line));
    }
  }
  if (job) jobs.push(job);
  return jobs.slice(0, 10);
}

function parseEducation(lines: string[]): School[] {
  const schools: School[] = [];
  let school: School | null = null;
  for (const line of lines) {
    const clean = line.replace(BULLET_RE, '').trim();
    if (SCHOOL_RE.test(clean) && !DEGREE_RE.test(clean.split(/[,|–—]/)[0])) {
      if (school) schools.push(school);
      school = emptySchool();
      const parts = splitHeader(clean.replace(RANGE_RE, '').replace(GRAD_RE, ' ').trim());
      school.school = stripSchoolLocation(parts.find((p) => SCHOOL_RE.test(p)) ?? clean);
    }
    if (!school) {
      school = emptySchool();
    }
    const range = RANGE_RE.exec(clean);
    if (range) {
      school.start = toYearMonth(range[1]);
      school.end = toYearMonth(range[2]);
    } else if (!school.end) {
      const grad = GRAD_RE.exec(clean);
      if (grad && /\d{4}/.test(grad[1])) school.end = toYearMonth(grad[1]);
    }
    const gpa = /\bgpa[:\s]*([\d.]+)(\s*\/\s*[\d.]+)?/i.exec(clean);
    if (gpa) school.gpa = gpa[1];
    if (!school.degree && DEGREE_RE.test(clean)) {
      const segment = clean.split(/\s+[|•·–—]\s+|,\s*(?=gpa)/i).find((s) => DEGREE_RE.test(s)) ?? clean;
      const deg = segment.replace(RANGE_RE, '').replace(/\bgpa.*$/i, '').trim();
      // "Bachelor of Science in Computer Science" → degree + major
      const [degree, major = ''] = deg.split(/\s+in\s+/i);
      school.degree = degree.replace(GRAD_RE, '').trim();
      school.major = major.replace(/[,;].*$/, '').trim();
    }
  }
  if (school && (school.school || school.degree)) schools.push(school);
  return schools.filter((s) => s.school || s.degree).slice(0, 5);
}

/** Best-effort, offline. The options page shows the result for review before saving. */
export function extractResume(text: string): ExtractedResume {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const sections = splitSections(lines);
  const top = (sections.header ?? []).slice(0, 8).join('\n');
  const all = lines.join('\n');

  const out: ExtractedResume = {
    firstName: '',
    middleName: '',
    lastName: '',
    email: EMAIL_RE.exec(all)?.[0] ?? '',
    phone: PHONE_RE.exec(top)?.[0]?.trim() ?? PHONE_RE.exec(all)?.[0]?.trim() ?? '',
    city: '',
    state: '',
    linkedin: '',
    github: '',
    portfolio: '',
    skills: '',
    work: parseWork(sections.experience ?? []),
    education: parseEducation(sections.education ?? []),
  };

  const nameLine = (sections.header ?? []).find(
    (l) => !EMAIL_RE.test(l) && !PHONE_RE.test(l) && /^[A-Za-zÀ-ÿ' .-]+$/.test(l) && l.split(' ').length <= 4 && l.length < 40,
  );
  if (nameLine) {
    const parts = nameLine.split(' ').map((p) => (p === p.toUpperCase() ? p[0] + p.slice(1).toLowerCase() : p));
    out.firstName = parts[0] ?? '';
    out.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    out.middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
  }

  const loc = CITY_STATE_RE.exec(top);
  if (loc) {
    out.city = loc[1];
    out.state = loc[2];
  }

  for (const m of all.matchAll(URL_RE)) {
    const url = m[1];
    if (EMAIL_RE.test(url) || /@/.test(all.slice(Math.max(0, m.index! - 1), m.index))) continue;
    const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
    if (/linkedin\.com/i.test(url)) out.linkedin ||= full;
    else if (/github\.com/i.test(url)) out.github ||= full;
    else if (!out.portfolio && /\.(com|io|dev|me|net|org|app|site|xyz|co)\b/i.test(url) && !/\.(edu)\b/i.test(url)) out.portfolio = full;
  }

  const skills = (sections.skills ?? []).map((l) => l.replace(BULLET_RE, '').replace(/^[A-Za-z &/]+:\s*/, ''));
  out.skills = skills.join(', ').replace(/\s*,\s*,/g, ',').slice(0, 1000);
  return out;
}
