import type { FieldType, Summary } from '../engine/types';
import type { Answers, FileKind, FilesMeta, Profile, SavedAnswer, Settings, StoredFile } from '../profile/schema';
import type { ScoutResult } from '../scout/types';

export type Message =
  // background/popup → content
  | { type: 'aaf:fill' }
  | { type: 'aaf:stop' }
  | { type: 'aaf:settings'; settings: Settings }
  /** Profile, files or saved answers changed: drop the cached copy. */
  | { type: 'aaf:dataChanged' }
  // content → background
  | { type: 'aaf:getData' }
  | { type: 'aaf:getFile'; kind: FileKind }
  | { type: 'aaf:saveAnswer'; key: string; answer: SavedAnswer }
  | { type: 'aaf:report'; summary: Summary }
  | { type: 'aaf:draft'; question: string; jobDescription: string }
  | { type: 'aaf:map'; questions: { label: string; options: string[] }[] }
  // popup / scout page → background
  | { type: 'aaf:getSummary'; tabId: number }
  | { type: 'aaf:scoutCheck' }
  | { type: 'aaf:scoutOpened'; tabId: number; listingId: string };

/** What a content script gets: never the API key (see `forContent`), and file names only. */
export interface ContentData {
  profile: Profile;
  settings: Settings;
  files: FilesMeta;
  answers: Answers;
}

export type DraftResponse = { text: string } | { error: string };
export type MapResponse = { types: (FieldType | null)[] } | { error: string };
export type FileResponse = StoredFile | null;
export type ScoutCheckResponse = ScoutResult | { error: string };

export const CONTENT_SCRIPT = 'content-scripts/filler.js';

/**
 * Settings as content scripts see them. Content scripts run inside job sites'
 * renderer processes, so the API key stays in the background worker; `ai.enabled`
 * is only true when a key is actually set.
 */
export function forContent(settings: Settings): Settings {
  return { ...settings, ai: { ...settings.ai, enabled: settings.ai.enabled && !!settings.ai.apiKey, apiKey: '' } };
}

/** File names and types only; the bytes are sent when a file field is actually filled. */
export function fileMeta(files: Partial<Record<FileKind, StoredFile>>): FilesMeta {
  const out: FilesMeta = {};
  for (const [k, f] of Object.entries(files) as [FileKind, StoredFile | undefined][]) {
    if (f) out[k] = { name: f.name, type: f.type };
  }
  return out;
}
