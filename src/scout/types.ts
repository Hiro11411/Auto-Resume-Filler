/** One posting from an internship feed, normalized across sources. */
export interface Listing {
  id: string;
  source: string;
  company: string;
  title: string;
  /** Link to the posting (for vanshb03, a go.vansh.nyc short link that redirects to the ATS). */
  url: string;
  locations: string[];
  /** "Summer", "Fall", "Spring/Summer"... */
  season: string;
  /** "Offers Sponsorship", "Does Not Offer Sponsorship", "U.S. Citizenship is Required" or "Other". */
  sponsorship: string;
  active: boolean;
  /** Epoch ms. */
  postedAt: number;
  updatedAt: number;
}

export interface Source {
  id: string;
  name: string;
  /** JSON array in the SimplifyJobs `listings.json` format. */
  url: string;
  /** Human page for the source. */
  home: string;
}

export interface ScoutMeta {
  etags: Record<string, string>;
  /** Per-source content signature, so an unchanged feed is spotted even without an ETag. */
  sigs?: Record<string, string>;
  lastCheck: number;
  /** Last time the feed actually changed. */
  lastChange: number;
  error?: string;
}

export interface ScoutResult {
  /** 'first' is the run that sets the baseline: nothing is "new" except the last two days' postings. */
  status: 'first' | 'updated' | 'unchanged';
  /** New or reopened listings that match the user's filters. */
  newMatching: number;
  /** Active listings across all sources. */
  open: number;
  checkedAt: number;
}

/** id → active, for spotting new and reopened listings between checks. */
export type Snapshot = Record<string, boolean>;
