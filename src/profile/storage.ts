import {
  defaultSettings,
  emptyProfile,
  withDefaults,
  type Answers,
  type Files,
  type Profile,
  type SavedAnswer,
  type Settings,
} from './schema';

/** Oldest saved answers are dropped past this many. */
const MAX_ANSWERS = 500;

// Everything lives in chrome.storage.local: it is readable from content scripts
// (IndexedDB would be scoped to the page's origin there) and never syncs off the
// machine. Resume files are stored as data URLs; a typical PDF is well under the
// 10 MB quota.

export async function loadProfile(): Promise<Profile> {
  const { profile } = await chrome.storage.local.get('profile');
  return withDefaults(emptyProfile(), profile);
}

export async function saveProfile(profile: Profile): Promise<void> {
  await chrome.storage.local.set({ profile });
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return withDefaults(defaultSettings(), settings);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function loadFiles(): Promise<Files> {
  const { files } = await chrome.storage.local.get('files');
  return (files as Files | undefined) ?? {};
}

export async function saveFiles(files: Files): Promise<void> {
  await chrome.storage.local.set({ files });
}

export async function loadAnswers(): Promise<Answers> {
  const { answers } = await chrome.storage.local.get('answers');
  return (answers as Answers | undefined) ?? {};
}

export async function saveAnswer(key: string, answer: SavedAnswer): Promise<void> {
  const answers = await loadAnswers();
  answers[key] = answer;
  const keys = Object.keys(answers);
  if (keys.length > MAX_ANSWERS) {
    keys.sort((a, b) => answers[a].at - answers[b].at);
    for (const k of keys.slice(0, keys.length - MAX_ANSWERS)) delete answers[k];
  }
  await chrome.storage.local.set({ answers });
}

export async function removeAnswer(key: string | null): Promise<void> {
  if (key === null) return chrome.storage.local.remove('answers');
  const answers = await loadAnswers();
  delete answers[key];
  await chrome.storage.local.set({ answers });
}

export function isPaused(settings: Settings, host: string): boolean {
  return settings.pausedSites.includes(host);
}
