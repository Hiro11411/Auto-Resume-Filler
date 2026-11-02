import { StepWatcher, settled } from '../engine/continue';
import { FillSession } from '../engine/session';
import { isProfileEmpty, type Settings } from '../profile/schema';
import { isPaused } from '../profile/storage';
import type { ContentData, DraftResponse, MapResponse, Message } from './messages';

/** Give up waiting for a SPA to render its application form after this long. */
const DETECT_FOR_MS = 120_000;

declare global {
  // eslint-disable-next-line no-var
  var __aafLoaded: boolean | undefined;
}

// Storage is locked to extension pages, so everything comes from the background worker.
const send = <T>(msg: Message): Promise<T> => chrome.runtime.sendMessage(msg);
const getData = () => send<ContentData>({ type: 'aaf:getData' });

export async function startContent(): Promise<void> {
  // The script can arrive twice (manifest match + manual injection); run once per frame.
  if (globalThis.__aafLoaded) return;
  globalThis.__aafLoaded = true;

  let { settings } = await getData();
  const ai = settings.ai.enabled;

  const session = new FillSession({
    doc: document,
    load: getData,
    report: (summary) => void send({ type: 'aaf:report', summary }).catch(() => {}),
    draft: ai
      ? async (question, jobDescription) => {
          const res = await send<DraftResponse>({ type: 'aaf:draft', question, jobDescription });
          if ('error' in res) throw new Error(res.error);
          return res.text;
        }
      : undefined,
    mapUnknown: ai
      ? async (questions) => {
          const res = await send<MapResponse>({ type: 'aaf:map', questions });
          if ('error' in res) throw new Error(res.error);
          return res.types;
        }
      : undefined,
  });

  // ---- auto mode ----
  let detector: StepWatcher | null = null;
  const stopAuto = () => {
    detector?.stop();
    detector = null;
  };
  const autoHere = (s: Settings) => s.autoMode && !isPaused(s, location.hostname);

  const tryAuto = async () => {
    if (!autoHere(settings)) return;
    if (isProfileEmpty((await getData()).profile)) return;
    await settled(document);
    const first = await session.fill({ auto: true });
    if (first.detection.ok) return;
    // Not an application (yet). SPAs often render the form later, e.g. after an "Apply" click.
    const deadline = Date.now() + DETECT_FOR_MS;
    detector = new StepWatcher(document, async () => {
      if (Date.now() > deadline) return stopAuto();
      const r = await session.fill({ auto: true });
      if (r.detection.ok) stopAuto();
    }, 800);
    detector.start();
  };

  const onSettings = (next: Settings) => {
    const wasOn = autoHere(settings);
    settings = next;
    if (!autoHere(next)) {
      stopAuto();
      session.stop();
    } else if (!wasOn) {
      void tryAuto();
    }
  };

  chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (msg.type === 'aaf:fill') {
      session.fill({ auto: false }).then((r) => sendResponse(r.summary), () => sendResponse(undefined));
      return true;
    }
    if (msg.type === 'aaf:stop') session.stop();
    if (msg.type === 'aaf:settings') onSettings(msg.settings);
    return false;
  });

  await tryAuto();
}
