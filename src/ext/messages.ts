import type { FieldType, Summary } from '../engine/types';
import type { Files, Profile, Settings } from '../profile/schema';

export type Message =
  // background/popup → content
  | { type: 'aaf:fill' }
  | { type: 'aaf:stop' }
  | { type: 'aaf:settings'; settings: Settings }
  // content → background
  | { type: 'aaf:getData' }
  | { type: 'aaf:report'; summary: Summary }
  | { type: 'aaf:draft'; question: string; jobDescription: string }
  | { type: 'aaf:map'; questions: { label: string; options: string[] }[] }
  // popup → background
  | { type: 'aaf:getSummary'; tabId: number };

/** What a content script gets: never the API key (see `forContent`). */
export interface ContentData {
  profile: Profile;
  settings: Settings;
  files: Files;
}

export type DraftResponse = { text: string } | { error: string };
export type MapResponse = { types: (FieldType | null)[] } | { error: string };

export const CONTENT_SCRIPT = 'content-scripts/filler.js';

/**
 * Settings as content scripts see them. Content scripts run inside job sites'
 * renderer processes, so the API key stays in the background worker; `ai.enabled`
 * is only true when a key is actually set.
 */
export function forContent(settings: Settings): Settings {
  return { ...settings, ai: { ...settings.ai, enabled: settings.ai.enabled && !!settings.ai.apiKey, apiKey: '' } };
}
