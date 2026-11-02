import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSettings, type Files, type Profile, type Settings } from '../../src/profile/schema';
import { testProfile } from '../fixtures/profile';

const root = fileURLToPath(new URL('../..', import.meta.url));
const EXT = join(root, '.output/chrome-mv3');
const FIXTURES = join(root, 'tests/fixtures');

/** Real ATS hostnames, resolved to the local fixture server so the shipped manifest matches apply. */
export const HOSTS = {
  greenhouse: 'boards.greenhouse.io',
  lever: 'jobs.lever.co',
  workday: 'acme.wd1.myworkdayjobs.com',
};

function selfSignedCert(): { key: Buffer; cert: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), 'aaf-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
}

function startServer(): Promise<Server> {
  const server = createServer(selfSignedCert(), (req, res) => {
    const name = (req.url ?? '/').split('?')[0].split('/').pop() || 'greenhouse.html';
    try {
      const body = readFileSync(join(FIXTURES, name.endsWith('.html') ? name : `${name}.html`));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Tiny but well-formed PDF so the file input gets a real File.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
export const testFiles: Files = { resume: { name: 'Ada_Lovelace_Resume.pdf', type: 'application/pdf', dataUrl: `data:application/pdf;base64,${PDF}` } };

interface Fixtures {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  url: (host: keyof typeof HOSTS, fixture: string) => string;
  seed: (opts?: { profile?: Profile; settings?: Partial<Settings>; files?: Files }) => Promise<void>;
}

export const test = base.extend<Fixtures, { server: Server }>({
  server: [
    async ({}, use) => {
      const server = await startServer();
      await use(server);
      server.close();
    },
    { scope: 'worker' },
  ],
  context: async ({ server }, use) => {
    const port = (server.address() as AddressInfo).port;
    const rules = Object.values(HOSTS).map((h) => `MAP ${h} 127.0.0.1:${port}`).join(', ');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      ignoreHTTPSErrors: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--host-resolver-rules=${rules}`, '--ignore-certificate-errors'],
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  url: async ({}, use) => {
    await use((host, fixture) => `https://${HOSTS[host]}/${fixture}`);
  },
  seed: async ({ sw }, use) => {
    await use(async ({ profile = testProfile(), settings = {}, files = testFiles } = {}) => {
      const merged = { ...defaultSettings(), ...settings };
      await sw.evaluate(async (data) => chrome.storage.local.set(data), { profile, settings: merged, files });
    });
  },
});

export { expect } from '@playwright/test';
