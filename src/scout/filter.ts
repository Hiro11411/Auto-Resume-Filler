import type { Profile, ScoutSettings } from '../profile/schema';
import type { Listing } from './types';

export const SEASONS = ['Summer', 'Fall', 'Winter', 'Spring'];

/** Sponsorship values that rule a listing out for someone who needs a visa. */
const NO_SPONSOR = new Set(['Does Not Offer Sponsorship', 'U.S. Citizenship is Required']);

export const keywords = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

export function hidesNoSponsorship(s: ScoutSettings, profile: Pick<Profile, 'facts'>): boolean {
  return s.sponsorship === 'hide' || (s.sponsorship === 'auto' && profile.facts.needsSponsorship === 'yes');
}

/** Does this listing pass the user's scout filters? */
export function matches(l: Listing, s: ScoutSettings, profile: Pick<Profile, 'facts'>): boolean {
  if (!l.active) return false;
  const season = l.season.toLowerCase();
  if (s.seasons.length && !s.seasons.some((x) => season.includes(x.toLowerCase()))) return false;

  const title = l.title.toLowerCase();
  const include = keywords(s.include);
  if (include.length && !include.some((k) => title.includes(k))) return false;
  if (keywords(s.exclude).some((k) => title.includes(k))) return false;

  const company = l.company.toLowerCase();
  if (keywords(s.hideCompanies).some((k) => company === k)) return false;

  const places = keywords(s.locations);
  if (places.length) {
    const where = l.locations.join(' | ').toLowerCase();
    if (!places.some((k) => where.includes(k))) return false;
  }

  if (hidesNoSponsorship(s, profile) && NO_SPONSOR.has(l.sponsorship)) return false;
  return true;
}
