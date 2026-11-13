import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Message, ScoutCheckResponse } from '../../src/ext/messages';
import { emptyProfile, type Profile, type Settings } from '../../src/profile/schema';
import { loadProfile, loadSettings, saveSettings } from '../../src/profile/storage';
import { hidesNoSponsorship, matches } from '../../src/scout/filter';
import { SCOUT_PERMISSION } from '../../src/scout/run';
import { LIST_IDS, LISTS, listById, type ListId, type ScoutList } from '../../src/scout/lists';
import { loadScout, markSeen, scoutKeys, setApplied, type ScoutData } from '../../src/scout/store';
import type { Listing } from '../../src/scout/types';
import '../../src/ui/base.css';
import './scout.css';

type Tab = 'new' | 'matching' | 'all' | 'applied';
const PAGE = 150;

function ago(ms: number): string {
  if (!ms) return 'never';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const SPONSOR_TAG: Record<string, [string, string]> = {
  'Offers Sponsorship': ['Sponsors visas', 'ok'],
  'Does Not Offer Sponsorship': ['No sponsorship', 'bad'],
  'U.S. Citizenship is Required': ['U.S. citizens only', 'bad'],
};

function Sources({ list }: { list: ScoutList }) {
  return (
    <>
      {list.sources.map((src, i) => (
        <>
          {i > 0 && ' and '}
          <a href={src.home} target="_blank" rel="noreferrer">{src.name}</a>
        </>
      ))}
    </>
  );
}

function Row({ list, l, isNew, applied }: { list: ListId; l: Listing; isNew: boolean; applied: boolean }) {
  const open = async () => {
    const tab = await chrome.tabs.create({ url: l.url });
    if (tab.id !== undefined) {
      await chrome.runtime.sendMessage({ type: 'aaf:scoutOpened', tabId: tab.id, listingId: l.id, list } satisfies Message);
    }
    if (isNew) await markSeen(list, [l.id]);
  };
  const tag = SPONSOR_TAG[l.sponsorship];
  return (
    <li class={applied ? 'row applied' : 'row'}>
      <div class="main">
        <div class="head">
          {isNew && <span class="pill new">New</span>}
          <strong>{l.company || 'Unknown company'}</strong>
          <span class="title">{l.title}</span>
        </div>
        <div class="meta muted">
          {l.locations.join(' · ') || 'Location not listed'}
          {l.season && <> · {l.season}</>} · posted {ago(l.postedAt)}
          {tag && <span class={`pill ${tag[1]}`}>{tag[0]}</span>}
        </div>
      </div>
      <div class="actions">
        <button class="primary" onClick={() => void open()} title="Opens the posting. Auto-fill runs there as usual; a fill marks it applied.">
          Apply
        </button>
        <button onClick={() => void setApplied(list, l.id, !applied)} aria-pressed={applied}>
          {applied ? 'Applied ✓' : 'Mark applied'}
        </button>
        {isNew && (
          <button class="link" onClick={() => void markSeen(list, [l.id])}>
            Dismiss
          </button>
        )}
      </div>
    </li>
  );
}

function ListView({ list }: { list: ScoutList }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [data, setData] = useState<ScoutData | null>(null);
  const [granted, setGranted] = useState(true);
  const [tab, setTab] = useState<Tab>('new');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const [s, p, d, g] = await Promise.all([loadSettings(), loadProfile(), loadScout(list.id), chrome.permissions.contains(SCOUT_PERMISSION)]);
    setSettings(s);
    setProfile(p);
    setData(d);
    setGranted(g);
  };

  useEffect(() => {
    void refresh().then(() => undefined);
    const onChange = (_: unknown, area: string) => area === 'local' && void refresh();
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [list.id]);

  // Open on "All open" when there's nothing new.
  useEffect(() => {
    if (data && tab === 'new' && !data.fresh.length && data.listings.length) setTab('matching');
  }, [data?.fresh.length, data?.listings.length]);

  const lists = useMemo(() => {
    if (!data || !settings) return null;
    const fresh = new Set(data.fresh);
    const all = [...data.listings].sort((a, b) => b.postedAt - a.postedAt);
    const matching = all.filter((l) => matches(l, settings[list.settingsKey], profile));
    return {
      new: matching.filter((l) => fresh.has(l.id)),
      matching,
      all,
      applied: all.filter((l) => data.applied[l.id]).sort((a, b) => data.applied[b.id] - data.applied[a.id]),
    };
  }, [data, settings, profile, list.id]);

  const check = async () => {
    setChecking(true);
    setMessage('');
    try {
      const r: ScoutCheckResponse = await chrome.runtime.sendMessage({ type: 'aaf:scoutCheck', list: list.id } satisfies Message);
      if ('error' in r) setMessage(r.error);
      else if (r.status === 'unchanged') setMessage('No changes since the last check.');
      else setMessage(`${r.newMatching} new matching listing${r.newMatching === 1 ? '' : 's'}, ${r.open} open in total.`);
    } finally {
      setChecking(false);
    }
  };

  const enable = async () => {
    const ok = await chrome.permissions.request(SCOUT_PERMISSION);
    if (!ok) return;
    const next = { ...settings![list.settingsKey], enabled: true };
    setSettings(await saveSettings(list.settingsKey === 'scout' ? { scout: next } : { coops: next }));
    setGranted(true);
    await check();
  };

  if (!settings || !data || !lists) return null;

  const filters = settings[list.settingsKey];
  const coop = list.id === 'coops';

  if (!filters.enabled || !granted) {
    return (
      <>
        <h1>{list.name}</h1>
        <section class="card">
          <h2>Get notified when new {list.noun}s open</h2>
          <p class="muted">
            Checks <Sources list={list} /> every hour
            {coop && ', keeping only Spring 2027 roles with “co-op” in the title,'} and tells you when new postings match your
            filters. The lists are public; nothing about you is sent.
          </p>
          <button class="primary" onClick={() => void enable()}>
            Turn on
          </button>
        </section>
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = lists[tab].filter(
    (l) => !q || `${l.company} ${l.title} ${l.locations.join(' ')}`.toLowerCase().includes(q),
  );
  const tabs: [Tab, string][] = [
    ['new', 'New'],
    ['matching', 'Matching'],
    ['all', 'All open'],
    ['applied', 'Applied'],
  ];
  const filtersOn =
    filters.seasons.length ||
    filters.locations ||
    filters.include ||
    filters.exclude ||
    filters.hideCompanies ||
    hidesNoSponsorship(filters, profile);

  return (
    <>
      <header class="top">
        <div>
          <h1>{list.name}</h1>
          <p class="muted">
            From <Sources list={list} />
            {coop && ' (Spring 2027, co-op titles only)'}. Checked {ago(data.meta.lastCheck)}
            {data.meta.lastChange > 0 && <>, last updated {ago(data.meta.lastChange)}</>}.
          </p>
          {data.meta.error && <p class="error">Last check failed: {data.meta.error}</p>}
          {message && <p class="muted" aria-live="polite">{message}</p>}
        </div>
        <div class="buttons">
          <button onClick={() => void check()} disabled={checking}>
            {checking ? 'Checking…' : 'Check now'}
          </button>
          <button class="link" onClick={() => chrome.runtime.openOptionsPage()}>
            {filtersOn ? 'Edit filters' : 'Add filters'}
          </button>
        </div>
      </header>

      <div class="bar">
        <div class="tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              class={tab === id ? 'tab on' : 'tab'}
              onClick={() => {
                setTab(id);
                setLimit(PAGE);
              }}
            >
              {label} <span class="count">{lists[id].length}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search company, title, location"
          aria-label="Search listings"
          value={query}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      {tab === 'new' && lists.new.length > 0 && (
        <div class="subbar">
          <button class="link" onClick={() => void markSeen(list.id, 'all')}>
            Mark all as seen
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p class="empty muted">
          {tab === 'new'
            ? 'Nothing new since you last looked. You’ll get a notification when something opens.'
            : tab === 'applied'
              ? 'Postings you open from here and fill are marked applied automatically.'
              : 'No listings match.'}
        </p>
      ) : (
        <ul class="list">
          {shown.slice(0, limit).map((l) => (
            <Row key={l.id} list={list.id} l={l} isNew={data.fresh.includes(l.id)} applied={!!data.applied[l.id]} />
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <button class="more" onClick={() => setLimit(limit + PAGE)}>
          Show more ({shown.length - limit} left)
        </button>
      )}
    </>
  );
}

/** Internships and co-ops are separate lists; `?list=coops` picks the co-op one. */
function Scout() {
  const [list, setList] = useState<ListId>(() => listById(new URLSearchParams(location.search).get('list')).id);
  const [counts, setCounts] = useState<Record<ListId, number>>({ internships: 0, coops: 0 });

  useEffect(() => {
    document.title = LISTS[list].name;
  }, [list]);

  useEffect(() => {
    const load = async () => {
      const got = await chrome.storage.local.get(LIST_IDS.map((id) => scoutKeys(id).fresh));
      const n = (id: ListId) => ((got[scoutKeys(id).fresh] as string[] | undefined) ?? []).length;
      setCounts({ internships: n('internships'), coops: n('coops') });
    };
    void load();
    const onChange = (_: unknown, area: string) => area === 'local' && void load();
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const pick = (id: ListId) => {
    setList(id);
    const url = new URL(location.href);
    if (id === 'internships') url.searchParams.delete('list');
    else url.searchParams.set('list', id);
    history.replaceState(null, '', url);
  };

  return (
    <main>
      <nav class="sections" aria-label="Job lists">
        {LIST_IDS.map((id) => (
          <button class={list === id ? 'section on' : 'section'} aria-current={list === id ? 'page' : undefined} onClick={() => pick(id)}>
            {LISTS[id].label}
            {counts[id] > 0 && <span class="pill new">{counts[id]} new</span>}
          </button>
        ))}
      </nav>
      <ListView key={list} list={LISTS[list]} />
    </main>
  );
}

render(<Scout />, document.getElementById('app')!);
