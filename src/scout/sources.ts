import type { Listing, Source } from './types';

export const FEED_ORIGIN = 'https://raw.githubusercontent.com';

/**
 * Feeds in the SimplifyJobs `listings.json` format. More can be added here
 * (e.g. SimplifyJobs/Summer2027-Internships, SimplifyJobs/New-Grad-Positions);
 * listings are tracked per source.
 */
export const SOURCES: Source[] = [
  {
    id: 'vanshb03-2027',
    name: 'Summer 2027 Tech Internships (vanshb03)',
    url: `${FEED_ORIGIN}/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json`,
    home: 'https://github.com/vanshb03/Summer2027-Internships',
  },
];

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const secs = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v * 1000 : 0);

/** Normalize raw feed items. Hidden or malformed entries are dropped. */
export function normalize(raw: unknown, source: string): Listing[] {
  if (!Array.isArray(raw)) throw new Error('Feed is not a list');
  const out: Listing[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') continue;
    const id = str(item.id);
    const url = str(item.url);
    if (!id || !/^https:\/\//.test(url) || item.is_visible === false) continue;
    const season = str(item.season) || (Array.isArray(item.terms) ? item.terms.map(str).join(', ') : '');
    out.push({
      id,
      source,
      company: str(item.company_name),
      title: str(item.title),
      url,
      locations: Array.isArray(item.locations) ? item.locations.map(str).filter(Boolean) : [],
      season: season === 'null' ? '' : season,
      sponsorship: str(item.sponsorship) || 'Other',
      active: item.active === true,
      postedAt: secs(item.date_posted),
      updatedAt: secs(item.date_updated) || secs(item.date_posted),
    });
  }
  return out;
}

export type FeedResponse = { status: 'unchanged' } | { status: 'ok'; etag: string; listings: Listing[] };

/** Conditional GET: a 304 costs nothing, so the feed can be checked often. */
export async function fetchFeed(src: Source, etag: string | undefined): Promise<FeedResponse> {
  const res = await fetch(src.url, {
    headers: etag ? { 'If-None-Match': etag } : {},
    cache: 'no-store',
  });
  if (res.status === 304) return { status: 'unchanged' };
  if (!res.ok) throw new Error(`${src.name}: HTTP ${res.status}`);
  const listings = normalize(await res.json(), src.id);
  return { status: 'ok', etag: res.headers.get('etag') ?? '', listings };
}
