import { emptyProfile, type Files, type Profile } from '../../src/profile/schema';
import { expect, test } from './harness';
import { textPdf } from './pdf';

test('uploading a PDF resume fills the profile draft and stores the file', async ({ context, seed, extensionId, sw }) => {
  await seed({ profile: emptyProfile(), files: {} });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  const pdf = textPdf([
    'ADA LOVELACE',
    'Boston, MA | ada@example.com | (555) 123-4567 | linkedin.com/in/ada',
    'EDUCATION',
    'Lakeside University Boston, MA',
    'Bachelor of Science in Computer Science, GPA: 3.9 Sep 2019 - May 2023',
    'EXPERIENCE',
    'Software Engineer | Analytical Engines Jun 2023 - Present',
    '- Built a compiler',
    'SKILLS',
    'TypeScript, Go',
  ]);
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: pdf });

  await expect(page.getByText(/Found \d+ details in resume.pdf/)).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveValue('Ada');
  await expect(page.getByLabel('Email')).toHaveValue('ada@example.com');
  await expect(page.getByLabel('Company')).toHaveValue('Analytical Engines');
  await expect(page.getByLabel('School')).toHaveValue('Lakeside University');

  // Nothing is saved until the user reviews and clicks Save (the file itself is stored right away).
  const before = await sw.evaluate(async () => ((await chrome.storage.local.get('profile')).profile as Profile).firstName);
  expect(before).toBe('');
  await page.getByRole('button', { name: 'Save profile' }).click();
  const after = await sw.evaluate(async () => {
    const { profile, files } = (await chrome.storage.local.get(['profile', 'files'])) as { profile: Profile; files: Files };
    return { name: profile.firstName, file: files.resume?.name };
  });
  expect(after).toEqual({ name: 'Ada', file: 'resume.pdf' });
});
