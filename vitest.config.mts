import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';

const alias = {
  '@': '/src',
  src: '/src',
  obsidian: '/tests/mocks/obsidian.ts',
  // Its `main` is a UMD bundle that Node loads with a second, CommonJS copy of pixi.js; the ESM build shares the app's.
  // A path on disk: the browser project's dependency optimizer reads it as one, and finds no `/node_modules` at the disk's root.
  'pixi-viewport': fileURLToPath(new URL('./node_modules/pixi-viewport/dist/pixi_viewport.js', import.meta.url)),
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
          // A test that needs a DOM says so on its first line: `// @vitest-environment jsdom`. jsdom costs a file about 0.4 s.
          environment: 'node',
          // Threads hand modules to the workers over a MessagePort, much cheaper than forks' IPC; most of a run is imports.
          pool: 'threads',
          globals: true,
          setupFiles: ['./tests/setup/obsidianDom.ts', './tests/setup/domHost.ts'],
          // Agents' worktrees in `.claude/` hold whole copies of the repository.
          exclude: ['**/node_modules/**', '**/.claude/**', '**/*.gpu.test.ts'],
        },
      },
      {
        extends: true,
        // Found only while a test runs, a dependency reloads that test: the Obsidian mock imports
        // `yaml`, the app manager's test `pixi-viewport`, the dice morph test React's DOM.
        optimizeDeps: { include: ['yaml', 'pixi-viewport', 'eventemitter3', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime'] },
        test: {
          name: 'gpu',
          // Obsidian's helpers on the DOM (`createEl`, `el.win`, `onWindowMigrated`), which map views use as in Obsidian.
          setupFiles: ['./tests/setup/obsidianDom.ts', './tests/setup/domHost.ts'],
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
