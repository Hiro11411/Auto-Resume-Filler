import { describe, expect, it } from 'vitest';
import { extractResume, toYearMonth } from '../../src/resume/extract';

const RESUME = `ADA LOVELACE
Boston, MA | ada@example.com | (555) 123-4567 | linkedin.com/in/ada | github.com/ada
EDUCATION
Lakeside University Boston, MA
Bachelor of Science in Computer Science, GPA: 3.9 Sep 2019 – May 2023
EXPERIENCE
Software Engineer | Analytical Engines Jun 2023 – Present
• Built a compiler for the difference engine
• Cut build times by 40%
Software Engineering Intern | Babbage Labs May 2022 – Aug 2022
• Wrote tests
SKILLS
Languages: TypeScript, Go, Python
`;

describe('resume extraction', () => {
  const x = extractResume(RESUME);
  it('finds contact details', () => {
    expect(x.firstName).toBe('Ada');
    expect(x.lastName).toBe('Lovelace');
    expect(x.email).toBe('ada@example.com');
    expect(x.phone).toBe('(555) 123-4567');
    expect(x.city).toBe('Boston');
    expect(x.state).toBe('MA');
    expect(x.linkedin).toBe('https://linkedin.com/in/ada');
    expect(x.github).toBe('https://github.com/ada');
  });
  it('splits work history', () => {
    expect(x.work).toHaveLength(2);
    expect(x.work[0]).toMatchObject({ title: 'Software Engineer', company: 'Analytical Engines', start: '2023-06', current: true });
    expect(x.work[0].description).toContain('compiler');
    expect(x.work[1]).toMatchObject({ company: 'Babbage Labs', start: '2022-05', end: '2022-08', current: false });
  });
  it('parses education', () => {
    expect(x.education[0]).toMatchObject({ school: 'Lakeside University', degree: 'Bachelor of Science', major: 'Computer Science', gpa: '3.9', end: '2023-05' });
  });
  it('collects skills', () => {
    expect(x.skills).toContain('TypeScript');
  });
  it('parses dates', () => {
    expect(toYearMonth('Sept 2021')).toBe('2021-09');
    expect(toYearMonth('03/2020')).toBe('2020-03');
    expect(toYearMonth('Present')).toBe('');
  });
});
