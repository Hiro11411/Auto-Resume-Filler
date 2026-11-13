import type { Listing, ScoutMeta, Snapshot } from './types';

// All in chrome.storage.local (extension pages and the background worker only).
// Only active listings are kept; the snapshot is a small id → active map.
const K = {
  listings: 'scout:listings',
  snapshot: 'scout:snapshot',
  fresh: 'scout:new',
  applied: 'scout:applied',
  meta: 'scout:meta',
} as const;

export const SCOUT_KEYS = K;

export interface ScoutData {
  listings: Listing[];
  /** Ids of new / reopened matching listings the user hasn't looked at yet. */
  fresh: string[];
  /** id → when it was applied to. */
  applied: Record<string, number>;
  meta: ScoutMeta;
}

const emptyMeta = (): ScoutMeta => ({ etags: {}, lastCheck: 0, lastChange: 0 });

export async function loadScout(): Promise<ScoutData> {
  const got = await chrome.storage.local.get([K.listings, K.fresh, K.applied, K.meta]);
  return {
    listings: (got[K.listings] as Listing[] | undefined) ?? [],
    fresh: (got[K.fresh] as string[] | undefined) ?? [],
    applied: (got[K.applied] as Record<string, number> | undefined) ?? {},
    meta: { ...emptyMeta(), ...(got[K.meta] as ScoutMeta | undefined) },
  };
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const got = await chrome.storage.local.get(K.snapshot);
  return (got[K.snapshot] as Snapshot | undefined) ?? null;
}

export async function saveFeed(listings: Listing[], snapshot: Snapshot, fresh: string[], meta: ScoutMeta): Promise<void> {
  await chrome.storage.local.set({ [K.listings]: listings, [K.snapshot]: snapshot, [K.fresh]: fresh, [K.meta]: meta });
}

export async function saveMeta(meta: ScoutMeta): Promise<void> {
  await chrome.storage.local.set({ [K.meta]: meta });
}

export async function setFresh(fresh: string[]): Promise<void> {
  await chrome.storage.local.set({ [K.fresh]: fresh });
}

export async function markSeen(ids: string[] | 'all'): Promise<void> {
  if (ids === 'all') return setFresh([]);
  const { fresh } = await loadScout();
  const drop = new Set(ids);
  await setFresh(fresh.filter((id) => !drop.has(id)));
}

export async function setApplied(id: string, applied: boolean): Promise<void> {
  const got = await chrome.storage.local.get(K.applied);
  const map = { ...((got[K.applied] as Record<string, number> | undefined) ?? {}) };
  if (applied) map[id] = map[id] ?? Date.now();
  else delete map[id];
  await chrome.storage.local.set({ [K.applied]: map });
  if (applied) await markSeen([id]);
}

/** Forget everything (used when the scout is turned off). Applied history is kept. */
export async function clearFeed(): Promise<void> {
  await chrome.storage.local.remove([K.listings, K.snapshot, K.fresh, K.meta]);
}
