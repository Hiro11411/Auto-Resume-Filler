import { afterEach, describe, expect, it } from 'vitest';
import { $, loadFixture, makeSession } from './helpers';

afterEach(() => {
  document.documentElement.innerHTML = '';
});

describe('Greenhouse-style form', () => {
  it('fills profile facts and required questions', async () => {
    loadFixture('greenhouse.html');
    const { session } = makeSession();
    const { detection } = await session.fill({ auto: true });
    expect(detection.ok).toBe(true);

    expect($('#first_name').value).toBe('Ada');
    expect($('#last_name').value).toBe('Lovelace');
    expect($('#email').value).toBe('ada@example.com');
    expect($('#phone').value).toBe('(555) 123-4567');
    expect($('#q_linkedin').value).toBe('https://linkedin.com/in/ada');
    expect($('#q_web').value).toBe('https://ada.dev');
    expect($<HTMLSelectElement>('#q_auth').value).toBe('1');
    expect($<HTMLSelectElement>('#q_spon').value).toBe('0');
    expect($('#q_salary').value).toBe('120000'); // screening question, but required
    expect($('#school0').value).toBe('Lakeside University');
    expect($<HTMLSelectElement>('#degree0').value).toBe("Bachelor's Degree");
    expect($('#discipline0').value).toBe('Computer Science');
    expect($<HTMLSelectElement>('#edu_end_month').value).toBe('5');
    expect($('#edu_end_year').value).toBe('2023');
  });

  it('leaves free-text, optional and unknown questions empty', async () => {
    loadFixture('greenhouse.html');
    const { session } = makeSession();
    const { summary } = await session.fill({ auto: true });

    expect($<HTMLTextAreaElement>('#q_why').value).toBe(''); // "Why do you want to work at Acme?"
    expect($('#q_hear').value).toBe(''); // optional "How did you hear"
    expect($<HTMLSelectElement>('#gender').value).toBe(''); // optional self-ID
    expect($('#q_favcolor').value).toBe(''); // required but not a profile fact
    expect($('#consent').checked).toBe(false); // never agree to terms for the user

    expect(summary.freeText).toBe(1);
    expect(summary.optional).toBe(2);
    expect(summary.missing).toBe(3); // favorite color, consent, resume (no file stored)
  });

  it('answers optional questions when that setting is on', async () => {
    loadFixture('greenhouse.html');
    const { session } = makeSession({ fillOptional: true });
    await session.fill({ auto: true });
    expect($('#q_hear').value).toBe('LinkedIn');
    expect($<HTMLSelectElement>('#gender').value).toBe('Female');
    expect($<HTMLTextAreaElement>('#q_why').value).toBe(''); // still the user's to write
  });

  it('does not overwrite values already on the page', async () => {
    loadFixture('greenhouse.html');
    $('#email').value = 'other@example.com';
    const { session } = makeSession();
    await session.fill({ auto: true });
    expect($('#email').value).toBe('other@example.com');
  });

  it('undo restores what was there before', async () => {
    loadFixture('greenhouse.html');
    const { session } = makeSession();
    await session.fill({ auto: true });
    session.undo();
    expect($('#first_name').value).toBe('');
    expect($<HTMLSelectElement>('#q_auth').value).toBe('');
    expect(document.getElementById('aaf-overlay-root')).toBeNull();
  });

  it('shows the summary panel with Undo', async () => {
    loadFixture('greenhouse.html');
    const { session } = makeSession();
    await session.fill({ auto: true });
    const host = document.getElementById('aaf-overlay-root')!;
    expect(host.shadowRoot!.textContent).toContain('for you to write');
    expect(host.shadowRoot!.textContent).toContain('Undo');
    expect($('#first_name').style.outline).toContain('solid');
  });
});

describe('Lever-style form', () => {
  it('fills single name field, radios, and leaves additional info', async () => {
    loadFixture('lever.html');
    const { session } = makeSession();
    const { detection } = await session.fill({ auto: true });
    expect(detection.ok).toBe(true);
    expect($('input[name="name"]').value).toBe('Ada Lovelace');
    expect($('input[name="org"]').value).toBe('Analytical Engines');
    expect($('input[name="urls[GitHub]"]').value).toBe('https://github.com/ada');
    expect($('input[name="cards[abc][field0]"][value="Yes"]').checked).toBe(true);
    // optional relocation question stays empty
    expect(document.querySelectorAll<HTMLInputElement>('input[name="cards[abc][field1]"]:checked').length).toBe(0);
    expect($<HTMLTextAreaElement>('textarea[name="comments"]').value).toBe('');
  });
});

describe('auto-mode detection', () => {
  it('skips login / sign-up forms', async () => {
    loadFixture('login.html');
    const { session } = makeSession();
    const { detection } = await session.fill({ auto: true });
    expect(detection.ok).toBe(false);
    expect($('#e').value).toBe('');
  });

  it('skips newsletter forms', async () => {
    loadFixture('newsletter.html');
    const { session } = makeSession();
    const { detection } = await session.fill({ auto: true });
    expect(detection.ok).toBe(false);
    expect($('#e').value).toBe('');
  });

  it('manual fill still works where auto mode declines', async () => {
    loadFixture('newsletter.html');
    const { session } = makeSession();
    await session.fill({ auto: false });
    expect($('#e').value).toBe('ada@example.com');
  });
});
