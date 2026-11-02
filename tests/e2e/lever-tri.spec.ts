import { testProfile } from '../fixtures/profile';
import { expect, test } from './harness';

const OVERLAY = '#aaf-overlay-root';
const radio = (name: string, value: string) => `input[name="${name}"][value="${value}"]`;

test('TRI-style Lever form: location typeahead, radios, export control from profile', async ({ context, seed, url }) => {
  await seed();
  const page = await context.newPage();
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await page.goto(url('lever', 'lever-tri.html'));

  // Location: typed, suggestion list waited for, matching row picked (hidden selection set).
  await expect(page.locator('#location-input')).toHaveValue('Boston, Massachusetts, United States');
  await expect(page.locator('#selected-location')).not.toHaveValue('');
  // Every copy of the field is filled, not just the first.
  await expect(page.locator('#location-input-2')).toHaveValue('Boston, Massachusetts, United States');
  // Real blur afterwards must not wipe it (the page clears on blur only while its list is open).
  await page.locator('input[name="email"]').click();
  await expect(page.locator('#location-input')).toHaveValue('Boston, Massachusetts, United States');

  await expect(page.locator(radio('cards[a][field0]', 'LinkedIn'))).toBeChecked();
  await expect(page.locator(radio('cards[c][field0]', "Bachelor's"))).toBeChecked();
  await expect(page.locator(radio('cards[d][field0]', 'Yes'))).toBeChecked();
  await expect(page.locator(radio('cards[d][field1]', 'No'))).toBeChecked();
  await expect(page.locator(radio('cards[d][field2]', 'No'))).toBeChecked();
  await expect(page.locator(radio('cards[d][field3]', 'I have read and understand the selection criteria.'))).toBeChecked();
  await expect(page.locator('textarea[name="cards[b][field0]"]')).toHaveValue('');

  // The browser agrees every required radio group is answered.
  const invalidRadios = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('input[type=radio][required]')].filter((i) => !i.validity.valid).map((i) => i.name),
  );
  expect(invalidRadios).toEqual([]);

  // The page's own validator rejects "(555) 123-4567": logged and listed, not silently "filled".
  await expect(page.locator(`${OVERLAY} .panel`)).toContainText('Filled, but the page still flags these');
  await expect(page.locator(`${OVERLAY} .panel`)).toContainText('aria-invalid');
  expect(warnings.some((w) => w.includes('Still invalid after filling') && w.includes('Phone'))).toBe(true);
});

test('export-control questions stay empty and flagged when the profile has no answer', async ({ context, seed, url }) => {
  const profile = testProfile();
  profile.facts.usPerson = '';
  profile.facts.sanctionedCountry = '';
  profile.facts.exportControlAck = '';
  await seed({ profile });
  const page = await context.newPage();
  await page.goto(url('lever', 'lever-tri.html'));
  await expect(page.locator(radio('cards[a][field0]', 'LinkedIn'))).toBeChecked();

  for (const name of ['cards[d][field1]', 'cards[d][field2]', 'cards[d][field3]']) {
    await expect(page.locator(`input[name="${name}"]:checked`)).toHaveCount(0);
  }
  const panel = page.locator(`${OVERLAY} .panel`);
  await expect(panel).toContainText('never guessed');

  // Answering it yourself clears the red outline and the panel entry.
  const group = page.locator('input[name="cards[d][field1]"]').first().locator('xpath=ancestor::ul[1]');
  await expect(group).toHaveCSS('outline-style', 'solid');
  await page.locator(radio('cards[d][field1]', 'No')).check();
  await expect(group).not.toHaveCSS('outline-style', 'solid');
  await expect(panel).not.toContainText('Are you a U.S. citizen');
});
