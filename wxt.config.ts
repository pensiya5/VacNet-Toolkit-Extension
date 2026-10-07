import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  imports: false,
  manifest: ({ browser }) => ({
    name: 'VACNET Toolkit',
    description: 'Player controls, verdict presets and local clip history for the VACNet portal.',
    default_locale: 'en',
    permissions: ['storage'],
    host_permissions: ['https://replay-video.valve.net/*'],
    icons: { 128: 'icon.png' },
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'vacnet-toolkit-local@extensions.invalid',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    } : {}),
  }),
  vite: () => ({
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
  }),
});
