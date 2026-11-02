import { draftAnswer, mapQuestions } from '../src/ai/client';
import type { Summary } from '../src/engine/types';
import { ATS_MATCHES } from '../src/ext/hosts';
import { CONTENT_SCRIPT, forContent, type ContentData, type Message } from '../src/ext/messages';
import { triggerFill } from '../src/ext/trigger';
import type { Settings } from '../src/profile/schema';
import { loadFiles, loadProfile, loadSettings, saveSettings } from '../src/profile/storage';

const ANY_SITE_ID = 'aaf-any-site';

async function updateBadge(settings: Settings): Promise<void> {
  await chrome.action.setBadgeText({ text: settings.autoMode ? 'AUTO' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#1f9d55' });
  await chrome.action.setTitle({ title: `Apply Autofill: auto-fill ${settings.autoMode ? 'on' : 'off'}` });
}

/** Register (or remove) the <all_urls> content script for "auto-fill on any site". */
async function syncAnySite(settings: Settings): Promise<void> {
  const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [ANY_SITE_ID] });
  const want = settings.anySite && granted;
  if (want && !existing.length) {
    await chrome.scripting.registerContentScripts([
      {
        id: ANY_SITE_ID,
        matches: ['<all_urls>'],
        excludeMatches: ATS_MATCHES,
        js: [CONTENT_SCRIPT],
        allFrames: true,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  } else if (!want && existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [ANY_SITE_ID] });
  }
}

async function sync(): Promise<void> {
  const settings = await loadSettings();
  await Promise.all([updateBadge(settings), syncAnySite(settings)]);
}

/** Tell every open tab's content scripts about new settings (they can't read storage). */
async function broadcastSettings(settings: Settings): Promise<void> {
  const msg: Message = { type: 'aaf:settings', settings: forContent(settings) };
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => (t.id === undefined ? null : chrome.tabs.sendMessage(t.id, msg).catch(() => {}))));
}

async function contentData(): Promise<ContentData> {
  const [profile, settings, files] = await Promise.all([loadProfile(), loadSettings(), loadFiles()]);
  return { profile, settings: forContent(settings), files };
}

// Per-tab fill summaries, one entry per frame, summed for the popup. Session
// storage survives the service worker being suspended but not a browser restart.
type FrameSummaries = Record<string, Summary>;
const key = (tabId: number) => `summary:${tabId}`;

async function recordSummary(tabId: number, frameId: number, summary: Summary): Promise<void> {
  const k = key(tabId);
  const { [k]: frames = {} } = (await chrome.storage.session.get(k)) as Record<string, FrameSummaries>;
  frames[String(frameId)] = summary;
  await chrome.storage.session.set({ [k]: frames });
}

async function tabSummary(tabId: number): Promise<Summary | null> {
  const k = key(tabId);
  const { [k]: frames } = (await chrome.storage.session.get(k)) as Record<string, FrameSummaries | undefined>;
  const list = Object.values(frames ?? {});
  if (!list.length) return null;
  return list.reduce((a, b) => ({
    filled: a.filled + b.filled,
    check: a.check + b.check,
    freeText: a.freeText + b.freeText,
    missing: a.missing + b.missing,
    optional: a.optional + b.optional,
    host: a.host || b.host,
    at: Math.max(a.at, b.at),
  }));
}

export default defineBackground(() => {
  // Content scripts run inside job sites' processes; keep the profile and API key
  // out of their reach. They ask for what they need over messages instead.
  void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

  chrome.runtime.onInstalled.addListener(() => void sync());
  chrome.runtime.onStartup.addListener(() => void sync());
  chrome.permissions.onAdded.addListener(() => void sync());
  chrome.permissions.onRemoved.addListener(() => void sync());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    void sync();
    if (changes.settings.newValue) void broadcastSettings(changes.settings.newValue as Settings);
  });

  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command === 'toggle-auto') {
      const s = await loadSettings();
      await saveSettings({ autoMode: !s.autoMode });
    } else if (command === 'fill-page' && tab?.id !== undefined) {
      await triggerFill(tab.id).catch(() => {});
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(key(tabId)));
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading' && info.url) void chrome.storage.session.remove(key(tabId));
  });

  chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    // Only our own pages and content scripts; web pages can't message us (no externally_connectable).
    if (sender.id !== chrome.runtime.id) return false;
    switch (msg.type) {
      case 'aaf:getData':
        contentData().then(sendResponse);
        return true;
      case 'aaf:report':
        if (sender.tab?.id !== undefined) void recordSummary(sender.tab.id, sender.frameId ?? 0, msg.summary);
        return false;
      case 'aaf:getSummary':
        tabSummary(msg.tabId).then(sendResponse);
        return true;
      case 'aaf:draft':
        Promise.all([loadSettings(), loadProfile()])
          .then(([s, p]) => draftAnswer(s, p, msg.question, msg.jobDescription))
          .then((text) => sendResponse({ text }), (e: Error) => sendResponse({ error: e.message }));
        return true;
      case 'aaf:map':
        loadSettings()
          .then((s) => mapQuestions(s, msg.questions))
          .then((types) => sendResponse({ types }), (e: Error) => sendResponse({ error: e.message }));
        return true;
      default:
        return false;
    }
  });
});
