import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const alias = {
  '@': '/src',
  src: '/src',
  obsidian: '/tests/mocks/obsidian.ts',
};

export default defineConfig({
  // Dev tooling (e.g. disk-backed template loading) is enabled under test so
  // the maintainer-facing code paths are exercised. Mirrors the Vite `define`.
  define: {
  },
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup/obsidianDom.ts', './tests/setup/domHost.ts'],
          exclude: ['**/node_modules/**', '**/*.gpu.test.ts'],
        },
      },
      {
        extends: true,
        // Found only while a test runs, a dependency reloads that test: the Obsidian mock imports
        // `yaml`, the app manager's test `pixi-viewport`, the dice morph test React's DOM.
        optimizeDeps: { include: ['yaml', 'pixi-viewport', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime'] },
        test: {
          name: 'gpu',
          setupFiles: ['./tests/setup/domHost.ts'],
          include: ['src/**/*.gpu.test.ts', 'tests/**/*.gpu.test.ts'],
          testTimeout: 600_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: 'chromium', ignoreDefaultArgs: ['--hide-scrollbars'] } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
