import type { Listing, Snapshot } from './types';

export interface FeedDiff {
  /** Active listings not seen before. */
  added: Listing[];
  /** Listings that were closed last time and are open again. */
  reopened: Listing[];
  /** Ids that were open and are now closed or gone. */
  closed: string[];
  snapshot: Snapshot;
}

export function snapshotOf(listings: Listing[]): Snapshot {
  const snap: Snapshot = {};
  for (const l of listings) snap[l.id] = l.active;
  return snap;
}

/** Compare a fresh feed with the previous check's snapshot. */
export function diffFeed(prev: Snapshot, next: Listing[]): FeedDiff {
  const snapshot = snapshotOf(next);
  const added: Listing[] = [];
  const reopened: Listing[] = [];
  for (const l of next) {
    if (!l.active) continue;
    if (!(l.id in prev)) added.push(l);
    else if (prev[l.id] === false) reopened.push(l);
  }
  const closed = Object.keys(prev).filter((id) => prev[id] && !snapshot[id]);
  return { added, reopened, closed, snapshot };
}
