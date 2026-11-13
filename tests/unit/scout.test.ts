import { describe, expect, it } from 'vitest';
import { pickAdapter } from '../../src/adapters';
import { defaultSettings, emptyProfile, type ScoutSettings } from '../../src/profile/schema';
import { diffFeed, snapshotOf } from '../../src/scout/diff';
import { matches } from '../../src/scout/filter';
import { dedupe, isSpring2027Coop } from '../../src/scout/lists';
import { normalize } from '../../src/scout/sources';
import type { Listing } from '../../src/scout/types';

// Made-up entries in the feed's format (SimplifyJobs-style listings.json).
const RAW = [
  { id: 'a', company_name: 'Acme', title: 'Software Engineer Intern', url: 'https://go.example/a', locations: ['New York, NY'], season: 'Summer', sponsorship: 'Offers Sponsorship', active: true, is_visible: true, date_posted: 1_790_000_000, date_updated: 1_790_000_100 },
  { id: 'b', company_name: 'Globex', title: 'Hardware Intern', url: 'https://go.example/b', locations: ['Remote'], season: 'Fall', sponsorship: 'Does Not Offer Sponsorship', active: true, is_visible: true, date_posted: 1_790_000_000 },
  { id: 'c', company_name: 'Initech', title: 'Data Science Intern', url: 'https://go.example/c', locations: ['Austin, TX'], season: 'Spring/Summer', sponsorship: 'Other', active: false, is_visible: true, date_posted: 1_780_000_000 },
  { id: 'hidden', company_name: 'X', title: 'Y', url: 'https://go.example/x', locations: [], season: 'Summer', active: true, is_visible: false, date_posted: 1 },
  { id: 'bad-url', company_name: 'X', title: 'Y', url: 'javascript:alert(1)', locations: [], season: 'Summer', active: true, is_visible: true, date_posted: 1 },
];

const scout = (patch: Partial<ScoutSettings> = {}): ScoutSettings => ({ ...defaultSettings().scout, ...patch });
const byId = (ls: Listing[], id: string) => ls.find((l) => l.id === id)!;

describe('feed normalize', () => {
  it('keeps visible https listings and converts timestamps to ms', () => {
    const ls = normalize(RAW, 'test');
    expect(ls.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(byId(ls, 'a')).toMatchObject({ company: 'Acme', postedAt: 1_790_000_000_000, updatedAt: 1_790_000_100_000, source: 'test' });
    expect(byId(ls, 'b').updatedAt).toBe(1_790_000_000_000); // falls back to date_posted
  });
  it('rejects a feed that is not a list', () => {
    expect(() => normalize({ nope: true }, 'test')).toThrow();
  });
});

describe('feed diff', () => {
  it('reports new, reopened and closed listings', () => {
    const before = normalize(RAW, 't');
    const prev = snapshotOf(before); // a, b open; c closed
    const next = normalize(
      [
        { ...RAW[0], active: false }, // a closed
        RAW[1], // b unchanged
        { ...RAW[2], active: true }, // c reopened
        { ...RAW[0], id: 'd' }, // d new
      ],
      't',
    );
    const d = diffFeed(prev, next);
    expect(d.added.map((l) => l.id)).toEqual(['d']);
    expect(d.reopened.map((l) => l.id)).toEqual(['c']);
    expect(d.closed).toEqual(['a']);
  });
  it('treats the same feed as no change', () => {
    const ls = normalize(RAW, 't');
    const d = diffFeed(snapshotOf(ls), ls);
    expect(d.added).toEqual([]);
    expect(d.reopened).toEqual([]);
    expect(d.closed).toEqual([]);
  });
});

describe('scout filters', () => {
  const ls = normalize(RAW, 't');
  const profile = emptyProfile();
  const ids = (s: ScoutSettings, p = profile) => ls.filter((l) => matches(l, s, p)).map((l) => l.id);

  it('shows every open listing by default and never closed ones', () => {
    expect(ids(scout())).toEqual(['a', 'b']);
  });
  it('filters by season, location, title and company', () => {
    expect(ids(scout({ seasons: ['Fall'] }))).toEqual(['b']);
    expect(ids(scout({ locations: 'remote, boston' }))).toEqual(['b']);
    expect(ids(scout({ include: 'software, data' }))).toEqual(['a']);
    expect(ids(scout({ exclude: 'hardware' }))).toEqual(['a']);
    expect(ids(scout({ hideCompanies: 'acme' }))).toEqual(['b']);
  });
  it('hides no-sponsorship listings when the profile needs sponsorship', () => {
    const needs = emptyProfile();
    needs.facts.needsSponsorship = 'yes';
    expect(ids(scout(), needs)).toEqual(['a']);
    expect(ids(scout({ sponsorship: 'show' }), needs)).toEqual(['a', 'b']);
    expect(ids(scout({ sponsorship: 'hide' }))).toEqual(['a']);
  });
});

describe('Spring 2027 co-op list', () => {
  const simplify = (title: string, terms: string[], extra = {}) =>
    normalize([{ id: title, company_name: 'Acme', title, url: 'https://go.example/s', locations: [], terms, active: true, date_posted: 1, ...extra }], 'simplify-2027')[0];
  const vansh = (title: string, season: string) =>
    normalize([{ id: title, company_name: 'Acme', title, url: 'https://go.example/v', locations: [], season, active: true, date_posted: 1 }], 'vanshb03-2027')[0];

  it('keeps Spring 2027 roles with co-op in the title', () => {
    expect(isSpring2027Coop(simplify('Software Co-op', ['Winter 2027', 'Spring 2027']))).toBe(true);
    expect(isSpring2027Coop(simplify('Data Engineer Co-Op', ['Spring 2027']))).toBe(true);
    expect(isSpring2027Coop(simplify('Platform Coop', ['Spring 2027']))).toBe(true);
    expect(isSpring2027Coop(vansh('Software Co-op', 'Spring'))).toBe(true);
  });
  it('drops interns, other terms and look-alike words', () => {
    expect(isSpring2027Coop(simplify('SWE Intern', ['Spring 2027']))).toBe(false);
    expect(isSpring2027Coop(simplify('Software Co-op', ['Fall 2026']))).toBe(false);
    expect(isSpring2027Coop(simplify('Software Co-op', ['Spring 2026']))).toBe(false);
    expect(isSpring2027Coop(simplify('Cooperative Systems Intern', ['Spring 2027']))).toBe(false);
    expect(isSpring2027Coop(vansh('Software Co-op', 'Summer'))).toBe(false);
  });
  it('keeps one copy of a role listed in both feeds, the first source winning', () => {
    const a = simplify('Software Co-op', ['Spring 2027']);
    const b = vansh('Software Co-op', 'Spring');
    const sameFeed = { ...a, id: 'a-boston' };
    expect(dedupe([a, sameFeed, b]).map((l) => `${l.source}:${l.id}`)).toEqual(['simplify-2027:Software Co-op', 'simplify-2027:a-boston']);
  });
  it('does not let a closed copy hide an open one', () => {
    const closed = { ...simplify('Software Co-op', ['Spring 2027']), active: false };
    const open = vansh('Software Co-op', 'Spring');
    expect(dedupe([closed, open]).filter((l) => l.active).map((l) => l.source)).toEqual(['vanshb03-2027']);
  });
});

describe('ATS adapters', () => {
  it('recognizes the added application hosts', () => {
    expect(pickAdapter('apply.workable.com').id).toBe('workable');
    expect(pickAdapter('jobs.jobvite.com').id).toBe('jobvite');
    expect(pickAdapter('acme.bamboohr.com').id).toBe('bamboohr');
    expect(pickAdapter('ats.rippling.com').id).toBe('rippling');
    expect(pickAdapter('eeho.fa.us2.oraclecloud.com').id).toBe('oracle');
    expect(pickAdapter('career4.successfactors.com').id).toBe('successfactors');
    expect(pickAdapter('acme.taleo.net').id).toBe('taleo');
    expect(pickAdapter('jobs.eu.lever.co').id).toBe('lever');
    expect(pickAdapter('example.com').id).toBe('generic');
  });
});
