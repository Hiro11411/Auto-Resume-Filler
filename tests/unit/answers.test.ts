import { afterEach, describe, expect, it } from 'vitest';
import { FillSession } from '../../src/engine/session';
import { defaultSettings, type Answers, type Settings } from '../../src/profile/schema';
import { testProfile } from '../fixtures/profile';
import { $ } from './helpers';

afterEach(() => {
  document.documentElement.innerHTML = '';
});

const FORM = `<h1>Job application</h1><form>
  <label for="fn">First name *</label><input id="fn" required>
  <label for="em">Email *</label><input id="em" type="email" required>
  <fieldset><legend>Are you open to hybrid work? *</legend>
    <label><input type="radio" name="hy" value="y" required> Yes, 3 days a week</label>
    <label><input type="radio" name="hy" value="n"> Fully remote only</label></fieldset>
  <label for="team">Preferred team *</label>
  <select id="team" required><option value="">Select…</option><option>Platform</option><option>Payments</option></select>
  <label><input type="checkbox" id="terms" required> I agree to the terms and privacy policy *</label>
  <fieldset><legend>Are you a U.S. citizen? *</legend>
    <label><input type="radio" name="cz" value="y" required> Yes</label><label><input type="radio" name="cz" value="n"> No</label></fieldset>
</form>`;

function session(answers: Answers, patch: Partial<Settings> = {}) {
  const saved: Answers = {};
  const settings = { ...defaultSettings(), autoContinue: false, ...patch };
  const profile = testProfile();
  profile.facts.usPerson = '';
  const s = new FillSession({
    doc: document,
    load: async () => ({ profile, settings, files: {}, answers }),
    saveAnswer: (key, a) => (saved[key] = a),
  });
  return { s, saved };
}

describe('remembered answers', () => {
  it('saves what the user answers on custom questions and reuses it next time', async () => {
    document.body.innerHTML = FORM;
    const first = session({});
    await first.s.fill({ auto: false });
    expect($('input[name="hy"]:checked')).toBeNull();

    // The user answers the two custom questions, plus the consent box and the citizenship question.
    $('input[name="hy"][value="n"]').click();
    $<HTMLSelectElement>('#team').value = 'Payments';
    $('#terms').click();
    $('input[name="cz"][value="y"]').click();
    first.s.saveAnswers();

    const values = Object.values(first.saved).map((a) => a.value).sort();
    expect(values).toEqual(['Fully remote only', 'Payments']); // never consent, never citizenship

    // A later application with the same questions.
    document.body.innerHTML = FORM;
    const second = session(first.saved);
    const { summary } = await second.s.fill({ auto: false });
    expect($<HTMLInputElement>('input[name="hy"]:checked').value).toBe('n');
    expect($<HTMLSelectElement>('#team').value).toBe('Payments');
    expect($('#terms').checked).toBe(false);
    expect($('input[name="cz"]:checked')).toBeNull();
    expect(summary.check).toBeGreaterThanOrEqual(2); // reused answers are shown as "check"
  });

  it('does not reuse answers when the setting is off', async () => {
    document.body.innerHTML = FORM;
    const first = session({});
    await first.s.fill({ auto: false });
    $('input[name="hy"][value="n"]').click();
    first.s.saveAnswers();

    document.body.innerHTML = FORM;
    await session(first.saved, { rememberAnswers: false }).s.fill({ auto: false });
    expect($('input[name="hy"]:checked')).toBeNull();
  });

  it('only matches the same question with the same options', async () => {
    document.body.innerHTML = FORM;
    const first = session({});
    await first.s.fill({ auto: false });
    $('input[name="hy"][value="n"]').click();
    first.s.saveAnswers();

    document.body.innerHTML = FORM.replace('Fully remote only', 'Remote, with quarterly visits');
    await session(first.saved).s.fill({ auto: false });
    expect($('input[name="hy"]:checked')).toBeNull();
  });
});

describe('two-phase fill', () => {
  it('fills instant fields before waiting on dropdowns, even when the dropdown comes first', async () => {
    document.body.innerHTML = `<h1>Job application</h1><form>
      <label for="co">Country *</label><input id="co" role="combobox" aria-autocomplete="list" required>
      <div id="menu"></div>
      <label for="fn">First name *</label><input id="fn" required>
      <label for="em">Email *</label><input id="em" required></form>`;
    let firstNameWhenMenuOpened: string | null = null;
    const combo = $('#co');
    combo.addEventListener('focus', () => (firstNameWhenMenuOpened = $('#fn').value));
    // A tiny react-select stand-in: typing shows matching options.
    combo.addEventListener('input', () => {
      $('#menu').innerHTML = '<div role="option">Canada</div><div role="option">United States</div>';
    });
    $('#menu').addEventListener('click', (e) => {
      combo.value = (e.target as HTMLElement).textContent ?? '';
      $('#menu').innerHTML = '';
    });

    const s = new FillSession({
      doc: document,
      load: async () => ({ profile: testProfile(), settings: { ...defaultSettings(), autoContinue: false }, files: {} }),
    });
    const t0 = Date.now();
    await s.fill({ auto: false });
    expect(firstNameWhenMenuOpened).toBe('Ada');
    expect(combo.value).toBe('United States');
    // Exact match picks immediately instead of waiting out the list's quiet period / timeout.
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
