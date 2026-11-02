import { afterEach, describe, expect, it } from 'vitest';
import { MAPPABLE } from '../../src/ai/client';
import { lever } from '../../src/adapters/lever';
import { classifyAll } from '../../src/engine/classify';
import { discover } from '../../src/engine/discover';
import { bestOption } from '../../src/engine/match';
import { decide, SENSITIVE_NOTE } from '../../src/engine/policy';
import { SENSITIVE_TYPES } from '../../src/engine/types';
import { defaultSettings } from '../../src/profile/schema';
import { testProfile } from '../fixtures/profile';
import { loadFixture, makeSession } from './helpers';

afterEach(() => {
  document.documentElement.innerHTML = '';
});

const byLabel = () => {
  const { fields } = discover(document);
  return classifyAll(fields, lever.rules);
};
const typeOf = (start: string) => byLabel().find((f) => f.label.startsWith(start))?.type;

describe('citizenship / export-control classification (TRI-style Lever form)', () => {
  it('gives legal questions their own types instead of unrelated profile fields', () => {
    loadFixture('lever-tri.html');
    expect(typeOf('Are you a national, citizen, or permanent resident of Cuba')).toBe('sanctionedCountry'); // was "state" (Crimea region)
    expect(typeOf('Are you a U.S. citizen')).toBe('usPerson');
    expect(typeOf('Selection criteria should be provided')).toBe('exportControlAck'); // was "company"
    expect(typeOf('Are you eligible to work in the United States?')).toBe('workAuthorized');
  });

  it('recognises "What degree are you currently enrolled in?"', () => {
    loadFixture('lever-tri.html');
    expect(typeOf('What degree are you currently enrolled in?')).toBe('degree');
  });

  it('treats other citizenship wording as sensitive, never as a guessable fact', () => {
    document.body.innerHTML = `<form><fieldset><legend>What is your citizenship? *</legend>
      <label><input type="radio" name="c" required> United States</label><label><input type="radio" name="c"> Other</label></fieldset></form>`;
    expect(byLabel()[0].type).toBe('sensitive');
  });
});

describe('policy for sensitive questions', () => {
  it('leaves them empty and flagged when the profile has no answer, even if optional', () => {
    loadFixture('lever-tri.html');
    const profile = testProfile();
    profile.facts.usPerson = '';
    const f = { ...byLabel().find((x) => x.type === 'usPerson')!, required: false };
    const d = decide(f, profile, defaultSettings(), {});
    expect(d).toEqual({ action: 'skip', status: 'missing', note: SENSITIVE_NOTE });
  });

  it('never lets the AI map a question onto a legal answer', () => {
    for (const t of SENSITIVE_TYPES) expect(MAPPABLE).not.toContain(t);
  });

  it('fills the Lever fixture radios from the profile', async () => {
    loadFixture('lever-tri.html');
    // jsdom doesn't run the fixture's typeahead script; the browser suite covers location.
    document.querySelectorAll('[data-qa="structured-contact-location-question"], #second-location').forEach((n) => n.remove());
    const { session } = makeSession();
    await session.fill({ auto: false });
    const checked = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
    expect(checked('cards[c][field0]')).toBe("Bachelor's");
    expect(checked('cards[d][field1]')).toBe('No');
    expect(checked('cards[d][field2]')).toBe('No');
    expect(checked('cards[d][field3]')).toBe('I have read and understand the selection criteria.');
  });
});

describe('matching suggestions and labels', () => {
  const pick = (opts: string[], v: string) => {
    const m = bestOption(opts, v);
    return m.index >= 0 ? opts[m.index] : null;
  };
  it('matches "Boston, MA" to the Massachusetts suggestion', () => {
    expect(pick(['Boston, Lincolnshire, United Kingdom', 'Boston, Massachusetts, United States', 'Bostonia, California, United States'], 'Boston, MA'))
      .toBe('Boston, Massachusetts, United States');
  });
  it('ignores case and apostrophe style', () => {
    expect(pick(['PhD', 'Master’s', 'Bachelor’s', 'Other'], "bachelor's")).toBe('Bachelor’s');
    expect(pick(['PhD', "Master's", "Bachelor's", 'Other'], 'Bachelor of Science')).toBe("Bachelor's");
  });
});

describe('post-fill validity check', () => {
  it('logs fields the page still rejects', async () => {
    document.body.innerHTML = `<h1>Job application</h1><form>
      <label for="fn">First name *</label><input id="fn" required>
      <label for="em">Email *</label><input id="em" required>
      <label for="ph">Phone *</label><input id="ph" required pattern="[0-9]+">
      <label for="ln">Last name</label><input id="ln"></form>`;
    const warn: string[] = [];
    const orig = console.warn;
    console.warn = (msg: string) => warn.push(msg);
    try {
      const { session } = makeSession();
      await session.fill({ auto: false });
    } finally {
      console.warn = orig;
    }
    expect(warn).toHaveLength(1);
    expect(warn[0]).toContain('Phone');
    expect(warn[0]).toContain('format not accepted');
  });
});
