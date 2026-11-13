import { draftAnswer, mapQuestions } from '../src/ai/client';
import type { Summary } from '../src/engine/types';
import { ATS_MATCHES } from '../src/ext/hosts';
import { CONTENT_SCRIPT, fileMeta, forContent, type ContentData, type FileResponse, type Message } from '../src/ext/messages';
import { triggerFill } from '../src/ext/trigger';
import type { SavedAnswer, Settings } from '../src/profile/schema';
import { loadAnswers, loadFiles, loadProfile, loadSettings, saveAnswer, saveSettings } from '../src/profile/storage';
import { LIST_IDS, LISTS, listById, plural, type ListId } from '../src/scout/lists';
import { runScout } from '../src/scout/run';
import { scoutKeys, setApplied } from '../src/scout/store';
import type { Listing } from '../src/scout/types';

const ANY_SITE_ID = 'aaf-any-site';
/** How often each job feed is checked. Unchanged feeds answer 304, so this is cheap. */
const SCOUT_EVERY_MIN = 60;
const scoutPage = (list: ListId) => (list === 'internships' ? '/scout.html' : `/scout.html?list=${list}`);

async function newCount(list: ListId): Promise<number> {
  const k = scoutKeys(list).fresh;
  const got = await chrome.storage.local.get(k);
  return ((got[k] as string[] | undefined) ?? []).length;
}

async function updateBadge(settings: Settings): Promise<void> {
  const counts = await Promise.all(
    LIST_IDS.map(async (id) => [id, settings[LISTS[id].settingsKey].enabled ? await newCount(id) : 0] as const),
  );
  const fresh = counts.reduce((n, [, c]) => n + c, 0);
  if (fresh > 0) {
    await chrome.action.setBadgeText({ text: fresh > 99 ? '99+' : String(fresh) });
    await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  } else {
    await chrome.action.setBadgeText({ text: settings.autoMode ? 'AUTO' : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#1f9d55' });
  }
  const scout = counts
    .filter(([, c]) => c > 0)
    .map(([id, c]) => `, ${plural(c, LISTS[id].noun)}`)
    .join('');
  await chrome.action.setTitle({ title: `Apply Autofill: auto-fill ${settings.autoMode ? 'on' : 'off'}${scout}` });
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

async function syncScoutAlarms(settings: Settings): Promise<void> {
  for (const id of LIST_IDS) {
    const list = LISTS[id];
    const on = settings[list.settingsKey].enabled;
    const alarm = await chrome.alarms.get(list.alarm);
    if (on && !alarm) {
      await chrome.alarms.create(list.alarm, { periodInMinutes: SCOUT_EVERY_MIN, delayInMinutes: 0.1 });
    } else if (!on && alarm) {
      await chrome.alarms.clear(list.alarm);
    }
  }
}

async function sync(): Promise<void> {
  const settings = await loadSettings();
  await Promise.all([updateBadge(settings), syncAnySite(settings), syncScoutAlarms(settings)]);
}

function notify(list: ListId, listings: Listing[]): void {
  const n = listings.length;
  const lines = listings.slice(0, 4).map((l) => `${l.company}: ${l.title}`);
  if (n > 4) lines.push(`and ${n - 4} more`);
  void chrome.notifications.create(LISTS[list].notification, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('/icon/128.png'),
    title: `${plural(n, LISTS[list].noun)} to apply to`,
    message: lines.join('\n'),
    priority: 1,
  });
}

const scoutRunning: Partial<Record<ListId, ReturnType<typeof runScout>>> = {};

/** One check per list at a time; a "Check now" during an alarm run shares its result. */
function checkScout(list: ListId): ReturnType<typeof runScout> {
  scoutRunning[list] ??= (async () => {
    try {
      const run = await runScout(list);
      const settings = await loadSettings();
      if (run.announce.length && settings[LISTS[list].settingsKey].notify) notify(list, run.announce);
      await updateBadge(settings);
      return run;
    } finally {
      delete scoutRunning[list];
    }
  })();
  return scoutRunning[list];
}

/** Tell every open tab's content scripts something changed (they can't read storage). */
async function broadcast(msg: Message): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => (t.id === undefined ? null : chrome.tabs.sendMessage(t.id, msg).catch(() => {}))));
}

async function contentData(): Promise<ContentData> {
  const [profile, settings, files, answers] = await Promise.all([loadProfile(), loadSettings(), loadFiles(), loadAnswers()]);
  return { profile, settings: forContent(settings), files: fileMeta(files), answers: settings.rememberAnswers ? answers : {} };
}

async function storeAnswer(key: string, answer: SavedAnswer): Promise<void> {
  if (typeof key !== 'string' || key.length > 2000) return;
  if (typeof answer?.value !== 'string' || !answer.value || answer.value.length > 1000) return;
  if (!(await loadSettings()).rememberAnswers) return;
  await saveAnswer(key, { label: String(answer.label ?? '').slice(0, 300), value: answer.value, at: Date.now() });
}

// Per-tab fill summaries, one entry per frame, summed for the popup. Session
// storage survives the service worker being suspended but not a browser restart.
type FrameSummaries = Record<string, Summary>;
type ScoutTab = { list: ListId; id: string };
const key = (tabId: number) => `summary:${tabId}`;
/** Tab opened from a job list → `{list, id}`, so a fill there marks it applied. */
const scoutTabKey = (tabId: number) => `scoutTab:${tabId}`;

async function recordSummary(tabId: number, frameId: number, summary: Summary): Promise<void> {
  const k = key(tabId);
  const { [k]: frames = {} } = (await chrome.storage.session.get(k)) as Record<string, FrameSummaries>;
  frames[String(frameId)] = summary;
  await chrome.storage.session.set({ [k]: frames });

  if (summary.filled > 0) {
    const sk = scoutTabKey(tabId);
    const { [sk]: opened } = (await chrome.storage.session.get(sk)) as Record<string, ScoutTab | string | undefined>;
    // A bare string is an internship id stored by an older version.
    const ref = typeof opened === 'string' ? { list: 'internships' as const, id: opened } : opened;
    if (ref) {
      await setApplied(listById(ref.list).id, ref.id, true);
      await chrome.storage.session.remove(sk);
    }
  }
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
    if (area !== 'local') return;
    if (changes.settings) {
      void sync();
      if (changes.settings.newValue) void broadcast({ type: 'aaf:settings', settings: forContent(changes.settings.newValue as Settings) });
    }
    if (changes.profile || changes.files || changes.answers) void broadcast({ type: 'aaf:dataChanged' });
    if (LIST_IDS.some((id) => changes[scoutKeys(id).fresh])) void loadSettings().then(updateBadge);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    const list = LIST_IDS.find((id) => LISTS[id].alarm === alarm.name);
    if (list) void checkScout(list).catch(() => {});
  });
  chrome.notifications.onClicked.addListener((id) => {
    const list = LIST_IDS.find((l) => LISTS[l].notification === id);
    if (!list) return;
    void chrome.notifications.clear(id);
    void chrome.tabs.create({ url: chrome.runtime.getURL(scoutPage(list)) });
  });

  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command === 'toggle-auto') {
      const s = await loadSettings();
      await saveSettings({ autoMode: !s.autoMode });
    } else if (command === 'fill-page' && tab?.id !== undefined) {
      await triggerFill(tab.id).catch(() => {});
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove([key(tabId), scoutTabKey(tabId)]));
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
      case 'aaf:getFile':
        loadFiles().then((f) => sendResponse((f[msg.kind] ?? null) satisfies FileResponse));
        return true;
      case 'aaf:saveAnswer':
        void storeAnswer(msg.key, msg.answer);
        return false;
      case 'aaf:report':
        if (sender.tab?.id !== undefined) void recordSummary(sender.tab.id, sender.frameId ?? 0, msg.summary);
        return false;
      case 'aaf:getSummary':
        tabSummary(msg.tabId).then(sendResponse);
        return true;
      case 'aaf:scoutCheck':
        checkScout(listById(msg.list).id).then((r) => sendResponse(r.result), (e: Error) => sendResponse({ error: e.message }));
        return true;
      case 'aaf:scoutOpened':
        void chrome.storage.session.set({ [scoutTabKey(msg.tabId)]: { list: listById(msg.list).id, id: msg.listingId } satisfies ScoutTab });
        return false;
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
