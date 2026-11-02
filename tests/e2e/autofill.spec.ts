import type { Profile, Settings } from '../../src/profile/schema';
import { expect, test } from './harness';

const OVERLAY = '#aaf-overlay-root';

test.beforeEach(async ({ context }) => {
  // Record any form submission: the extension must never submit.
  await context.addInitScript(() => {
    (window as unknown as { __submitted: boolean }).__submitted = false;
    document.addEventListener('submit', (e) => {
      (window as unknown as { __submitted: boolean }).__submitted = true;
      e.preventDefault();
    }, true);
  });
});

test('auto mode fills a Greenhouse application with no click', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'greenhouse.html'));

  await expect(page.locator('#first_name')).toHaveValue('Ada');
  await expect(page.locator('#email')).toHaveValue('ada@example.com');
  await expect(page.locator('#q_auth')).toHaveValue('1');
  await expect(page.locator('#q_spon')).toHaveValue('0');
  await expect(page.locator('#q_salary')).toHaveValue('120000');

  // Resume attached from storage.
  const files = await page.locator('#resume').evaluate((el: HTMLInputElement) => [...(el.files ?? [])].map((f) => f.name));
  expect(files).toEqual(['Ada_Lovelace_Resume.pdf']);

  // Free-text and optional questions are left for the user.
  await expect(page.locator('#q_why')).toHaveValue('');
  await expect(page.locator('#q_hear')).toHaveValue('');
  await expect(page.locator('#gender')).toHaveValue('');
  await expect(page.locator('#consent')).not.toBeChecked();

  // Summary panel, and nothing was submitted.
  await expect(page.locator(`${OVERLAY} .panel`)).toContainText('for you to write');
  expect(await page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted)).toBe(false);
});

test('auto mode leaves a sign-in form alone', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'login.html'));
  await page.waitForTimeout(1500);
  await expect(page.locator('#e')).toHaveValue('');
  await expect(page.locator(OVERLAY)).toHaveCount(0);
});

test('turning auto mode off stops auto-fill; manual fill still works', async ({ context, seed, url, sw }) => {
  await seed({ settings: { autoMode: false } });
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'greenhouse.html'));
  await page.waitForTimeout(1500);
  await expect(page.locator('#first_name')).toHaveValue('');

  // Same message the popup button and Alt+Shift+F send.
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: '*://boards.greenhouse.io/*' });
    await chrome.tabs.sendMessage(tab.id!, { type: 'aaf:fill' });
  });
  await expect(page.locator('#first_name')).toHaveValue('Ada');
});

test('toggling auto mode off in settings stops a page mid-session', async ({ context, seed, url, sw }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'greenhouse.html'));
  await expect(page.locator('#first_name')).toHaveValue('Ada');
  await sw.evaluate(async () => {
    const { settings } = (await chrome.storage.local.get('settings')) as { settings: Settings };
    await chrome.storage.local.set({ settings: { ...settings, autoMode: false } });
  });
  await expect(page.locator(OVERLAY)).toHaveCount(0);
  expect(await sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
});

test('paused sites are skipped by auto mode', async ({ context, seed, url }) => {
  await seed({ settings: { pausedSites: ['boards.greenhouse.io'] } });
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'greenhouse.html'));
  await page.waitForTimeout(1500);
  await expect(page.locator('#first_name')).toHaveValue('');
});

test('fields the user edits are not overwritten when new fields appear', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'greenhouse.html'));
  await expect(page.locator('#first_name')).toHaveValue('Ada');

  await page.locator('#first_name').fill('Grace');
  // A new section renders (like "Add another" or the next step).
  await page.evaluate(() => {
    const div = document.createElement('div');
    div.innerHTML = '<label for="gh">GitHub</label><input id="gh">';
    document.getElementById('application_form')!.appendChild(div);
  });
  await expect(page.locator('#gh')).toHaveValue('https://github.com/ada');
  await expect(page.locator('#first_name')).toHaveValue('Grace');
});

test('Undo restores the page', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'greenhouse.html'));
  await expect(page.locator('#first_name')).toHaveValue('Ada');
  await page.locator(`${OVERLAY} button`, { hasText: 'Undo' }).click();
  await expect(page.locator('#first_name')).toHaveValue('');
  await expect(page.locator('#q_auth')).toHaveValue('');
  await expect(page.locator(OVERLAY)).toHaveCount(0);
});

test('Lever: single name field, radio question, free text left empty', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(url('lever', 'lever.html'));
  await expect(page.locator('input[name="name"]')).toHaveValue('Ada Lovelace');
  await expect(page.locator('input[name="cards[abc][field0]"][value="Yes"]')).toBeChecked();
  await expect(page.locator('input[name="cards[abc][field1]"]:checked')).toHaveCount(0);
  await expect(page.locator('textarea[name="comments"]')).toHaveValue('');
});

test('Workday: listbox dropdown, then the next step fills after the user clicks Next', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(url('workday', 'workday.html'));
  await expect(page.locator('#fn')).toHaveValue('Ada');
  await expect(page.locator('#city')).toHaveValue('Boston');
  // Required "How did you hear" listbox is a screening question, answered because it's required.
  await expect(page.locator('#howheard')).toHaveText('LinkedIn');

  await page.locator('#next').click();
  await expect(page.locator('#jt1')).toHaveValue('Software Engineer');
  await expect(page.locator('#co1')).toHaveValue('Analytical Engines');
  await expect(page.locator('#cw1')).toBeChecked();
  await expect(page.locator('#sc1')).toHaveValue('Lakeside University');
});

test('popup shows the auto-fill switch and toggles the badge', async ({ context, seed, extensionId, sw }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const toggle = page.getByRole('switch', { name: 'Auto-fill', exact: true });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  await toggle.check();
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('AUTO');
});

test('options page edits and saves the profile', async ({ context, seed, extensionId, sw }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByLabel('First name')).toHaveValue('Ada');
  await page.getByLabel('Preferred name').fill('Countess');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  const saved = await sw.evaluate(async () => ((await chrome.storage.local.get('profile')).profile as Profile).preferredName);
  expect(saved).toBe('Countess');
});

test('no network requests leave the browser with AI off', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  const external: string[] = [];
  context.on('request', (r) => {
    const u = new URL(r.url());
    if (!['boards.greenhouse.io', 'jobs.lever.co', 'acme.wd1.myworkdayjobs.com'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url());
  });
  await page.goto(url('greenhouse', 'greenhouse.html'));
  await expect(page.locator('#first_name')).toHaveValue('Ada');
  expect(external).toEqual([]);
});

test('fields a person cannot see are never filled', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'hidden-fields.html'));
  await expect(page.locator('#first_name')).toHaveValue('Ada');
  await expect(page.locator('#city')).toHaveValue('Boston');
  await expect(page.locator('#street')).toHaveValue(''); // opacity: 0
  await expect(page.locator('#phone')).toHaveValue(''); // 1px
  await expect(page.locator('#li')).toHaveValue(''); // off-screen
});

test('with AI on, pages get the Draft button but never the API key', async ({ context, seed, url }) => {
  await seed({ settings: { ai: { enabled: true, apiKey: 'sk-ant-test-not-real', mapModel: 'm', draftModel: 'd' } } });
  const page = await context.newPage();
  await page.goto(url('greenhouse', 'greenhouse.html'));
  await expect(page.locator('#first_name')).toHaveValue('Ada');
  // Content scripts learned AI is on (the Draft button shows) through key-free settings.
  await expect(page.locator('#aaf-overlay-root button', { hasText: 'Draft' })).toBeVisible();
  expect(await page.content()).not.toContain('sk-ant-test-not-real');
  expect(await page.evaluate(() => typeof (window as unknown as { chrome?: { storage?: unknown } }).chrome?.storage)).toBe('undefined');
});
