import { loadProfile, loadSettings } from '../profile/storage';
import { diffFeed } from './diff';
import { matches } from './filter';
import { dedupe, LISTS, type ListId } from './lists';
import { FEED_ORIGIN, fetchFeed } from './sources';
import { loadScout, loadSnapshot, saveFeed, saveMeta } from './store';
import type { Listing, ScoutResult } from './types';

/** Changes whenever a listing is added, removed, opened, closed or edited. */
export function signature(listings: Listing[]): string {
  let h = 0;
  for (const l of listings) {
    const s = `${l.id}:${l.active ? 1 : 0}:${l.updatedAt}`;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return `${listings.length}:${h >>> 0}`;
}

/** On the very first check, postings this recent still count as new. */
const FIRST_RUN_NEW_MS = 48 * 3600_000;

export const SCOUT_PERMISSION = { origins: [`${FEED_ORIGIN}/*`] };

export interface ScoutRun {
  result: ScoutResult;
  /** New matching listings to tell the user about. */
  announce: Listing[];
}

/**
 * Check every source of one list once. Runs in the background worker (alarm,
 * startup, or "Check now"). Unchanged feeds answer 304 and cost almost nothing.
 */
export async function runScout(listId: ListId = 'internships', now = Date.now()): Promise<ScoutRun> {
  const list = LISTS[listId];
  const [settings, profile, data, prevSnap] = await Promise.all([loadSettings(), loadProfile(), loadScout(listId), loadSnapshot(listId)]);
  const meta = { ...data.meta, etags: { ...data.meta.etags }, sigs: { ...data.meta.sigs } };

  if (!(await chrome.permissions.contains(SCOUT_PERMISSION))) {
    throw new Error(`Allow access to raw.githubusercontent.com in settings to check the ${list.noun} list.`);
  }

  // Per source: fresh listings, or the previous ones when the feed is unchanged.
  let changed = false;
  let all: Listing[] = [];
  try {
    for (const src of list.sources) {
      const res = await fetchFeed(src, prevSnap ? meta.etags[src.id] : undefined);
      if (res.status === 'unchanged') {
        all.push(...data.listings.filter((l) => l.source === src.id));
      } else {
        const kept = res.listings.filter(list.keep);
        const sig = signature(kept);
        if (sig !== meta.sigs[src.id]) changed = true;
        meta.sigs[src.id] = sig;
        meta.etags[src.id] = res.etag;
        all.push(...kept);
      }
    }
  } catch (e) {
    meta.lastCheck = now;
    meta.error = (e as Error).message;
    await saveMeta(listId, meta);
    throw e;
  }
  meta.lastCheck = now;
  delete meta.error;
  if (list.sources.length > 1) all = dedupe(all);

  const open = all.filter((l) => l.active);
  if (!changed && prevSnap) {
    await saveMeta(listId, meta);
    return { result: { status: 'unchanged', newMatching: 0, open: open.length, checkedAt: now }, announce: [] };
  }

  const first = !prevSnap;
  // Unchanged sources contribute only their open listings; keep their closed ids in the snapshot.
  const d = diffFeed(prevSnap ?? {}, all);
  const snapshot = { ...(prevSnap ?? {}), ...d.snapshot };
  for (const id of d.closed) if (id in snapshot) snapshot[id] = false;
  const candidates = first ? open.filter((l) => now - l.postedAt < FIRST_RUN_NEW_MS) : [...d.added, ...d.reopened];
  const announce = candidates.filter((l) => matches(l, settings[list.settingsKey], profile) && !data.applied[l.id]);

  const openIds = new Set(open.map((l) => l.id));
  const fresh = [...new Set([...data.fresh.filter((id) => openIds.has(id)), ...announce.map((l) => l.id)])];
  meta.lastChange = now;
  await saveFeed(listId, open, snapshot, fresh, meta);

  return {
    result: { status: first ? 'first' : 'updated', newMatching: announce.length, open: open.length, checkedAt: now },
    announce,
  };
}
