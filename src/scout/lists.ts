import { FEED_ORIGIN, SOURCES } from './sources';
import type { Listing, Source } from './types';

/** The job lists the scout tracks. Each has its own feeds, filters, storage, alarm and notifications. */
export type ListId = 'internships' | 'coops';

export interface ScoutList {
  id: ListId;
  /** Page heading, e.g. "Internship list". */
  name: string;
  /** Short label for the section switcher. */
  label: string;
  /** Singular noun for counts: "3 new internships". */
  noun: string;
  sources: Source[];
  /** Which block of `Settings` holds this list's filters. */
  settingsKey: 'scout' | 'coops';
  /** Prefix for this list's chrome.storage.local keys. */
  storagePrefix: string;
  alarm: string;
  notification: string;
  /**
   * Which feed entries belong to this list, applied as feeds are fetched so
   * only the relevant ones are stored.
   */
  keep(l: Listing): boolean;
}

const SIMPLIFY_2027: Source = {
  id: 'simplify-2027',
  name: 'Summer 2027 Tech Internships (SimplifyJobs)',
  url: `${FEED_ORIGIN}/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json`,
  home: 'https://github.com/SimplifyJobs/Summer2027-Internships',
};

const COOP_TITLE = /\bco-?ops?\b/i;

/**
 * A Spring 2027 co-op. SimplifyJobs lists terms with years ("Winter 2027, Spring 2027");
 * vanshb03's feed only covers the 2027 cycle and uses a bare "Spring".
 */
export function isSpring2027Coop(l: Listing): boolean {
  if (!COOP_TITLE.test(l.title)) return false;
  if (l.source === SIMPLIFY_2027.id) return /\bspring 2027\b/i.test(l.season);
  return /^spring$/i.test(l.season.trim());
}

export const LISTS: Record<ListId, ScoutList> = {
  internships: {
    id: 'internships',
    name: 'Internship list',
    label: 'Internships',
    noun: 'internship',
    sources: SOURCES,
    settingsKey: 'scout',
    storagePrefix: 'scout',
    alarm: 'aaf-scout',
    notification: 'aaf-scout',
    keep: () => true,
  },
  coops: {
    id: 'coops',
    name: 'Spring 2027 co-ops',
    label: 'Co-ops (Spring 2027)',
    noun: 'co-op',
    // First source wins when both list the same role.
    sources: [SIMPLIFY_2027, ...SOURCES],
    settingsKey: 'coops',
    storagePrefix: 'coop',
    alarm: 'aaf-coops',
    notification: 'aaf-coops',
    keep: isSpring2027Coop,
  },
};

export const LIST_IDS = Object.keys(LISTS) as ListId[];

export const listById = (id: unknown): ScoutList => LISTS[id === 'coops' ? 'coops' : 'internships'];

/**
 * Drop a listing when an earlier source already has the same company + title (the
 * same role in two feeds). Repeats within one feed, e.g. one role per city, are kept.
 * Only open listings claim a role, so a closed copy never hides an open one.
 */
export function dedupe(listings: Listing[]): Listing[] {
  const key = (l: Listing) => `${l.company.toLowerCase()}|${l.title.toLowerCase()}`;
  const owner = new Map<string, string>();
  for (const l of listings) if (l.active && !owner.has(key(l))) owner.set(key(l), l.source);
  return listings.filter((l) => {
    const src = owner.get(key(l));
    return src === undefined || src === l.source;
  });
}

export const plural = (n: number, noun: string) => `${n} new ${noun}${n === 1 ? '' : 's'}`;
