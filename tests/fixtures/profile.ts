import { emptyProfile, type Profile } from '../../src/profile/schema';

export function testProfile(): Profile {
  const p = emptyProfile();
  p.firstName = 'Ada';
  p.lastName = 'Lovelace';
  p.email = 'ada@example.com';
  p.phone = '(555) 123-4567';
  p.address = { street: '1 Main St', street2: '', city: 'Boston', state: 'MA', postalCode: '02115', country: 'United States' };
  p.links = { linkedin: 'https://linkedin.com/in/ada', github: 'https://github.com/ada', portfolio: 'https://ada.dev', other: '' };
  p.work = [
    { company: 'Analytical Engines', title: 'Software Engineer', location: 'Boston, MA', start: '2023-06', end: '', current: true, description: 'Built compilers.' },
  ];
  p.education = [{ school: 'Lakeside University', degree: 'Bachelor of Science', major: 'Computer Science', minor: '', gpa: '3.9', start: '2019-09', end: '2023-05' }];
  p.skills = 'TypeScript, Go';
  p.facts.workAuthorized = 'yes';
  p.facts.needsSponsorship = 'no';
  p.facts.willingToRelocate = 'yes';
  p.facts.desiredSalary = '120000';
  p.facts.referralSource = 'LinkedIn';
  p.facts.gender = 'Female';
  p.facts.usPerson = 'no';
  p.facts.sanctionedCountry = 'no';
  p.facts.exportControlAck = 'yes';
  return p;
}
