import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { ATS_MATCHES, AI_ORIGIN } from './src/ext/hosts';
import { FEED_ORIGIN } from './src/scout/sources';

export default defineConfig({
  srcDir: '.',
  vite: () => ({ plugins: [preact()] }),
  manifest: {
    name: 'Apply Autofill',
    description: 'Fills job applications from your profile. Leaves optional and free-text questions for you.',
    permissions: ['storage', 'activeTab', 'scripting', 'alarms', 'notifications'],
    host_permissions: ATS_MATCHES,
    optional_host_permissions: ['<all_urls>', `${AI_ORIGIN}/*`, `${FEED_ORIGIN}/*`],
    commands: {
      'fill-page': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Fill this page',
      },
      'toggle-auto': {
        suggested_key: { default: 'Alt+Shift+A' },
        description: 'Turn auto-fill on or off',
      },
    },
  },
});
