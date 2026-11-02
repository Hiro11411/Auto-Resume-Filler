import { describe, expect, it } from 'vitest';
import { emptyProfile } from '../../src/profile/schema';
import { extractResume } from '../../src/resume/extract';
import { mergeExtracted } from '../../src/resume/merge';

describe('mergeExtracted', () => {
  it('fills only empty fields and keeps what the user typed', () => {
    const p = emptyProfile();
    p.email = 'mine@example.com';
    const x = extractResume('JANE DOE\njane@example.com | (555) 222-3333\n');
    const { profile, count } = mergeExtracted(p, x);
    expect(profile.firstName).toBe('Jane');
    expect(profile.email).toBe('mine@example.com');
    expect(count).toBeGreaterThan(0);
    expect(p.firstName).toBe(''); // input not mutated
  });
});
