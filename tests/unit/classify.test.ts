import { afterEach, describe, expect, it } from 'vitest';
import { lever } from '../../src/adapters/lever';
import { classifyAll } from '../../src/engine/classify';
import { discover } from '../../src/engine/discover';
import { loadFixture } from './helpers';

afterEach(() => {
  document.documentElement.innerHTML = '';
});

function types(rules = lever.rules) {
  const { fields } = discover(document);
  return Object.fromEntries(classifyAll(fields, rules).map((f) => [f.label || f.hints, f.type]));
}

describe('classification', () => {
  it('classifies the Greenhouse fixture', () => {
    loadFixture('greenhouse.html');
    const t = types([]);
    expect(t['First Name']).toBe('firstName');
    expect(t['Resume/CV']).toBe('resume');
    expect(t['Are you legally authorized to work in the United States?']).toBe('workAuthorized');
    expect(t['Why do you want to work at Acme?']).toBe('freeText');
    expect(t['How did you hear about this job?']).toBe('referralSource');
    expect(t['What is your favorite color?']).toBe('unknown');
    expect(t['Discipline']).toBe('major');
  });

  it('uses Lever hints for unlabeled-looking fields', () => {
    loadFixture('lever.html');
    const t = types();
    expect(t['Full name']).toBe('fullName');
    expect(t['Current company']).toBe('currentCompany');
    expect(t['Additional information']).toBe('freeText');
    expect(t['Are you authorized to work in the US?']).toBe('workAuthorized');
  });
});
