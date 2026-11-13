import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Summary } from '../../src/engine/types';
import type { Message } from '../../src/ext/messages';
import { triggerFill } from '../../src/ext/trigger';
import { isProfileEmpty, type Settings } from '../../src/profile/schema';
import { loadProfile, loadSettings, saveSettings } from '../../src/profile/storage';
import { LIST_IDS, LISTS, plural, type ListId } from '../../src/scout/lists';
import { scoutKeys } from '../../src/scout/store';
import { Switch } from '../../src/ui/Switch';
import '../../src/ui/base.css';
import './popup.css';

function hostOf(url?: string): string {
  try {
    return url && /^https?:/.test(url) ? new URL(url).hostname : '';
  } catch {
    return '';
  }
}

function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<Record<ListId, number>>({ internships: 0, coops: 0 });

  const host = hostOf(tab?.url);
  const paused = !!settings && settings.pausedSites.includes(host);

  const refreshSummary = async (tabId: number) => {
    const s: Summary | null = await chrome.runtime.sendMessage({ type: 'aaf:getSummary', tabId } satisfies Message);
    setSummary(s);
  };

  useEffect(() => {
    void (async () => {
      const [s, p, [t], scout] = await Promise.all([
        loadSettings(),
        loadProfile(),
        chrome.tabs.query({ active: true, currentWindow: true }),
        chrome.storage.local.get(LIST_IDS.map((id) => scoutKeys(id).fresh)),
      ]);
      setSettings(s);
      const count = (id: ListId) => ((scout[scoutKeys(id).fresh] as string[] | undefined) ?? []).length;
      setFresh({ internships: count('internships'), coops: count('coops') });
      setNoProfile(isProfileEmpty(p));
      setTab(t ?? null);
      if (t?.id !== undefined) await refreshSummary(t.id);
    })();
  }, []);

  const update = async (patch: Partial<Settings>) => setSettings(await saveSettings(patch));

  const togglePause = (pause: boolean) => {
    if (!settings || !host) return;
    const rest = settings.pausedSites.filter((h) => h !== host);
    void update({ pausedSites: pause ? [...rest, host] : rest });
  };

  const fill = async () => {
    if (tab?.id === undefined) return;
    setBusy(true);
    setError('');
    try {
      await triggerFill(tab.id);
      // Frames report asynchronously; give them a moment.
      setTimeout(() => void refreshSummary(tab.id!), 400);
    } catch {
      setError("This page can't be filled (browser pages and the Web Store are off limits).");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return null;

  return (
    <main>
      <header>
        <h1>Apply Autofill</h1>
      </header>

      {noProfile && (
        <div class="notice">
          <strong>Set up your profile first.</strong>
          <div class="muted">Upload your resume and review the details. It takes a minute.</div>
          <div style={{ marginTop: 8 }}>
            <button class="primary" onClick={() => chrome.runtime.openOptionsPage()}>
              Set up profile
            </button>
          </div>
        </div>
      )}

      <div class="card">
        <div class="row">
          <div class="text">
            <strong>Auto-fill</strong>
            <small>{settings.autoMode ? 'Fills application forms as soon as they open.' : 'Off. Fill pages with the button below.'}</small>
          </div>
          <Switch label="Auto-fill" checked={settings.autoMode} onChange={(v) => void update({ autoMode: v })} />
        </div>
        {host && (
          <div class="row">
            <div class="text">
              <strong>Pause on this site</strong>
              <small>{host}</small>
            </div>
            <Switch label={`Pause auto-fill on ${host}`} checked={paused} disabled={!settings.autoMode} onChange={togglePause} />
          </div>
        )}
      </div>

      <button class="primary fill" onClick={fill} disabled={busy || noProfile || !tab?.id}>
        {busy ? 'Filling…' : 'Fill this page'}
      </button>
      {error && <div class="muted">{error}</div>}

      {LIST_IDS.filter((id) => settings[LISTS[id].settingsKey].enabled).map((id) => (
        <button
          class="scout"
          onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL(id === 'internships' ? '/scout.html' : `/scout.html?list=${id}`) })}
        >
          {fresh[id] ? `${plural(fresh[id], LISTS[id].noun)} to apply to` : LISTS[id].name}
        </button>
      ))}

      {summary && (
        <div class="card">
          <div class="summary" aria-label="Last fill on this tab">
            <span><i class="dot" style={{ background: 'var(--ok)' }} />{summary.filled} filled</span>
            <span><i class="dot" style={{ background: 'var(--warn)' }} />{summary.check} to check</span>
            <span><i class="dot" style={{ background: 'var(--info)' }} />{summary.freeText} for you to write</span>
            <span><i class="dot" style={{ background: 'var(--bad)' }} />{summary.missing} required missing</span>
          </div>
          {summary.optional > 0 && <small class="muted">{summary.optional} optional questions left empty on purpose.</small>}
        </div>
      )}

      <footer>
        <button class="link" onClick={() => chrome.runtime.openOptionsPage()}>
          Edit profile and settings
        </button>
        <span class="muted">
          <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> fill
        </span>
      </footer>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);
