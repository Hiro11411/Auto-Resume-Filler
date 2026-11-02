import { describe, expect, it } from 'vitest';
import { bestOption } from '../../src/engine/match';

const pick = (opts: string[], v: string) => {
  const m = bestOption(opts, v);
  return m.index >= 0 ? opts[m.index] : null;
};

describe('bestOption', () => {
  it('matches yes/no phrasing', () => {
    expect(pick(['Select...', 'Yes', 'No'], 'yes')).toBe('Yes');
    expect(pick(['Yes, I will require sponsorship', 'No, I will not require sponsorship'], 'no')).toBe('No, I will not require sponsorship');
    expect(pick(['I am authorized to work', 'I am not authorized to work', 'Decline to answer'], 'yes')).toBe('I am authorized to work');
  });
  it('handles countries, states and degrees', () => {
    expect(pick(['Canada', 'United States of America', 'Mexico'], 'United States')).toBe('United States of America');
    expect(pick(['MA', 'NY'], 'Massachusetts')).toBe('MA');
    expect(pick(['California', 'Massachusetts'], 'MA')).toBe('Massachusetts');
    expect(pick(["Associate's Degree", "Bachelor's Degree", "Master's Degree"], 'Bachelor of Science')).toBe("Bachelor's Degree");
  });
  it('maps decline answers to the decline option', () => {
    expect(pick(['Male', 'Female', 'Decline To Self Identify'], 'I don’t wish to answer')).toBe('Decline To Self Identify');
  });
  it('returns nothing for a poor match', () => {
    expect(pick(['Red', 'Green'], 'Computer Science')).toBeNull();
  });
});
