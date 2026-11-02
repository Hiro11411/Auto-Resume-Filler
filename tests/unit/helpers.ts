import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSettings, type Settings } from '../../src/profile/schema';
import { FillSession } from '../../src/engine/session';
import { testProfile } from '../fixtures/profile';

export function loadFixture(name: string): void {
  // Vitest runs from the project root; import.meta.url is server-relative under jsdom.
  const html = readFileSync(join(process.cwd(), 'tests/fixtures', name), 'utf8');
  document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, '').replace(/<\/?html[^>]*>/g, '');
}

export function makeSession(patch: Partial<Settings> = {}, profile = testProfile()) {
  const settings = { ...defaultSettings(), autoContinue: false, ...patch };
  const reports: unknown[] = [];
  const session = new FillSession({
    doc: document,
    load: async () => ({ profile, settings, files: {} }),
    report: (s) => reports.push(s),
  });
  return { session, reports };
}

export const $ = <T extends HTMLElement = HTMLInputElement>(sel: string) => document.querySelector(sel) as T;
