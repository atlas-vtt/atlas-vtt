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

/**
 * Test files that take a CI runner ten seconds or more each (the dungeon generator's invariants over
 * hundreds of seeded dungeons, the Spectral Engine on drawn maps, visibility sweeps, wall sealing on
 * hostile inputs, property and fuzz tests): the `slow` project, run only by hand (`npm run test:slow`)
 * when the code they cover changes. Never in CI: they held the unit shards at their 15 minute limit.
 */
const SLOW_TEST_FILES = [
  'tests/unit/dungeons/**',
  'tests/unit/dungeonWizard.test.tsx',
  'tests/unit/spectralEngine/{drawnGrids,irregularGrids,askewMaps,detectGridInImage,printedMaps}.test.ts',
  'tests/unit/visibility{Culling,CullingLarge,CullingControls,Timing,Rules}.test.ts',
  'tests/unit/sceneModelControls.test.ts',
  'tests/unit/mapTokenReadsLint.test.ts',
  'tests/unit/dependencyBoundaryEnforcement.test.ts',
  'tests/unit/historyParityFixtures.test.ts',
  'tests/unit/levels/artRaster.test.ts',
  'tests/unit/online/movement/wallCollision.test.ts',
  'tests/unit/measuredDistanceAcrossMap.test.ts',
  'tests/unit/statblocks/notes/frontmatterPatch.{property,corpus}.test.ts',
  'src/app/lighting/__tests__/sealWalls{Rays,Hostile,Crowded}.test.ts',
];

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
          // A CI runner is several times slower than a developer's machine; the dungeon suites take seconds a test there.
          testTimeout: process.env.CI ? 30_000 : 5_000,
          globals: true,
          setupFiles: ['./tests/setup/obsidianDom.ts', './tests/setup/domHost.ts'],
          // Agents' worktrees in `.claude/` hold whole copies of the repository.
          exclude: ['**/node_modules/**', '**/.claude/**', '**/*.gpu.test.ts', ...SLOW_TEST_FILES],
        },
      },
      {
        extends: true,
        test: {
          name: 'slow',
          environment: 'node',
          pool: 'threads',
          testTimeout: 120_000,
          globals: true,
          setupFiles: ['./tests/setup/obsidianDom.ts', './tests/setup/domHost.ts'],
          include: SLOW_TEST_FILES,
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
          // Obsidian's helpers on the DOM (`createEl`, `el.win`), which map views use as in Obsidian.
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
