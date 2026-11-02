import { CONTENT_SCRIPT, type Message } from './messages';
import type { Summary } from '../engine/types';

async function send(tabId: number): Promise<Summary | undefined> {
  const msg: Message = { type: 'aaf:fill' };
  return chrome.tabs.sendMessage(tabId, msg);
}

/**
 * Manual fill: message the content script if it's already in the tab (ATS hosts,
 * or any site when that permission is granted); otherwise inject it into every
 * frame through the activeTab grant first.
 */
export async function triggerFill(tabId: number): Promise<Summary | undefined> {
  try {
    return await send(tabId);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_SCRIPT] });
    return send(tabId);
  }
}
