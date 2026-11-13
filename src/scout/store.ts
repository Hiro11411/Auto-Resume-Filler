import { LISTS, type ListId } from './lists';
import type { Listing, ScoutMeta, Snapshot } from './types';

// All in chrome.storage.local (extension pages and the background worker only).
// Only active listings are kept; the snapshot is a small id → active map.
// Each list has its own keys: `scout:*` for internships, `coop:*` for co-ops.
export function scoutKeys(list: ListId = 'internships') {
  const p = LISTS[list].storagePrefix;
  return {
    listings: `${p}:listings`,
    snapshot: `${p}:snapshot`,
    fresh: `${p}:new`,
    applied: `${p}:applied`,
    meta: `${p}:meta`,
  } as const;
}

/** The internship list's keys. */
export const SCOUT_KEYS = scoutKeys('internships');

export interface ScoutData {
  listings: Listing[];
  /** Ids of new / reopened matching listings the user hasn't looked at yet. */
  fresh: string[];
  /** id → when it was applied to. */
  applied: Record<string, number>;
  meta: ScoutMeta;
}

const emptyMeta = (): ScoutMeta => ({ etags: {}, lastCheck: 0, lastChange: 0 });

export async function loadScout(list: ListId = 'internships'): Promise<ScoutData> {
  const K = scoutKeys(list);
  const got = await chrome.storage.local.get([K.listings, K.fresh, K.applied, K.meta]);
  return {
    listings: (got[K.listings] as Listing[] | undefined) ?? [],
    fresh: (got[K.fresh] as string[] | undefined) ?? [],
    applied: (got[K.applied] as Record<string, number> | undefined) ?? {},
    meta: { ...emptyMeta(), ...(got[K.meta] as ScoutMeta | undefined) },
  };
}

export async function loadSnapshot(list: ListId = 'internships'): Promise<Snapshot | null> {
  const K = scoutKeys(list);
  const got = await chrome.storage.local.get(K.snapshot);
  return (got[K.snapshot] as Snapshot | undefined) ?? null;
}

export async function saveFeed(list: ListId, listings: Listing[], snapshot: Snapshot, fresh: string[], meta: ScoutMeta): Promise<void> {
  const K = scoutKeys(list);
  await chrome.storage.local.set({ [K.listings]: listings, [K.snapshot]: snapshot, [K.fresh]: fresh, [K.meta]: meta });
}

export async function saveMeta(list: ListId, meta: ScoutMeta): Promise<void> {
  await chrome.storage.local.set({ [scoutKeys(list).meta]: meta });
}

export async function setFresh(list: ListId, fresh: string[]): Promise<void> {
  await chrome.storage.local.set({ [scoutKeys(list).fresh]: fresh });
}

export async function markSeen(list: ListId, ids: string[] | 'all'): Promise<void> {
  if (ids === 'all') return setFresh(list, []);
  const { fresh } = await loadScout(list);
  const drop = new Set(ids);
  await setFresh(list, fresh.filter((id) => !drop.has(id)));
}

export async function setApplied(list: ListId, id: string, applied: boolean): Promise<void> {
  const K = scoutKeys(list);
  const got = await chrome.storage.local.get(K.applied);
  const map = { ...((got[K.applied] as Record<string, number> | undefined) ?? {}) };
  if (applied) map[id] = map[id] ?? Date.now();
  else delete map[id];
  await chrome.storage.local.set({ [K.applied]: map });
  if (applied) await markSeen(list, [id]);
}

/** Forget a list's feed (used when its alerts are turned off). Applied history is kept. */
export async function clearFeed(list: ListId = 'internships'): Promise<void> {
  const K = scoutKeys(list);
  await chrome.storage.local.remove([K.listings, K.snapshot, K.fresh, K.meta]);
}
