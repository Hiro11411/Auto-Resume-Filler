import {
  defaultSettings,
  emptyProfile,
  withDefaults,
  type Files,
  type Profile,
  type Settings,
} from './schema';

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

export function isPaused(settings: Settings, host: string): boolean {
  return settings.pausedSites.includes(host);
}
