import { afterAll, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonRequest } from '../../src/app/dungeons/model';
import { IMAGE_PRESETS, disposeImageProcessing, optimizeBitmap } from '../../src/app/imageProcessing/imageProcessing';
import { SCENE_MAP_QUALITY } from '../../src/app/dungeons/render/layoutSize';
import { createDungeonSceneWith, type DungeonSceneDeps } from '../../src/app/dungeons/scene/createDungeonScene';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import type { DungeonTag } from '../../src/app/dungeons/tags';
import { DungeonWorkerClient } from '../../src/app/dungeons/worker/DungeonWorkerClient';
import DungeonWorker from '../../src/app/dungeons/worker/dungeonWorker?worker&inline';
import { AssetService } from '../../src/app/services/AssetService';
import { AssetThumbnailService, THUMBNAIL_SPEC } from '../../src/app/services/AssetThumbnailService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/**
 * What creating a dungeon scene costs, from the click to the files written, with the real dungeon
 * worker and image workers: printed to `out/perf-gen/`, asked for with `VITE_PERF_GEN=1`. The tesserae
 * are built after the scene is written and are left out.
 */

vi.mock('../../src/app/pixi/mosaicCanvas/prebuildMosaicCanvas', () => ({ prebuildMosaicCanvasAt: vi.fn() }));

const run = import.meta.env.VITE_PERF_GEN === '1';
/** Draws every case in one look instead of its own, to compare looks: `VITE_PERF_STYLE=crayon`. */
const lookOverride = import.meta.env.VITE_PERF_STYLE as DungeonStyleId | undefined;
const req = (seed: number, tags: string[], floors = 1): DungeonRequest => ({ seed, tags: tags as DungeonTag[], floors });
/** The most a cave's or a house's scene may take, from the click to the files written, in ms. */
const LIMITS: Readonly<Record<string, number>> = { 'medium mansion': 3000, 'large 3 floors mansion with cellar overgrown': 7000, 'cavern medium': 3000, 'cavern large 3 floors lava overgrown': 7000, 'cavern underdark 3 floors flooded': 7000 };
/**
 * The same in the crayon look. Its coats encode slowly: a medium forest 3 s, a large two-floor one 14 s (2026-10-28);
 * since every floor is coloured in, a large three-floor mansion 13 s and a large cavern 11 s (M4 Pro, 2026-10-30).
 */
const CRAYON_LIMITS: Readonly<Record<string, number>> = { ...LIMITS, 'forest medium': 4500, 'forest large 2 floors wet': 18000, 'large 3 floors mansion with cellar overgrown': 18000, 'cavern large 3 floors lava overgrown': 15000 };

const CASES: [string, DungeonRequest, DungeonStyleId][] = [
  ['small', req(11, ['small']), 'parchment'],
  ['medium', req(7, ['medium']), 'parchment'],
  ['medium fortress', { ...req(7, ['medium']), theme: 'fortress' }, 'parchment'],
  ['medium mansion', { ...req(7, ['medium']), theme: 'mansion' }, 'parchment'],
  ['medium overgrown wet', req(7, ['medium', 'overgrown', 'wet']), 'parchment'],
  ['medium 3 floors flooded', req(5, ['medium', 'flooded'], 3), 'masonry'],
  ['large 3 floors lava overgrown', req(3, ['large', 'lava', 'overgrown'], 3), 'volcanic'],
  ['large 3 floors rising fortress', { ...req(3, ['large', 'ruined', 'overgrown'], 3), theme: 'fortress' }, 'masonry'],
  ['large 3 floors mansion with cellar overgrown', { ...req(2, ['large', 'overgrown'], 3), theme: 'mansion' }, 'parchment'],
  ['cavern medium', { ...req(7, ['medium']), theme: 'cavern' }, 'parchment'],
  ['forest medium', { ...req(7, ['medium']), theme: 'forest' }, 'crayon'],
  ['forest large 2 floors wet', { ...req(3, ['large', 'wet'], 2), theme: 'forest' }, 'crayon'],
  ['cavern large 3 floors lava overgrown', { ...req(3, ['large', 'lava', 'overgrown'], 3), theme: 'cavern' }, 'volcanic'],
  ['cavern underdark 3 floors flooded', { ...req(5, ['deep', 'spacious', 'flooded'], 3), theme: 'cavern' }, 'masonry'],
];

const client = new DungeonWorkerClient({ createWorker: () => new DungeonWorker({ name: 'Atlas dungeons (cost)' }) });
afterAll(() => { client.dispose(); disposeImageProcessing(); });

describe.skipIf(!run)('what creating a dungeon scene costs', () => {
  const rows: string[] = [];
  for (const [name, request, styleId] of CASES) {
    it(name, async () => {
      const vault = createInMemoryApp();
      AssetService.resetInstance();
      const assetService = AssetService.getInstance(vault.app);
      await assetService.initialize();
      await assetService.createCollection('Perf');
      const t0 = performance.now();
      const at = (): number => Math.round(performance.now() - t0);
      const events: string[] = [];
      let longest = 0;
      const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration); });
      observer.observe({ type: 'longtask', buffered: false });
      const sizes: number[] = [];
      const deps: DungeonSceneDeps = {
        app: vault.app,
        assetService,
        render: async (job) => {
          const start = at();
          const result = await client.render(job);
          events.push(`${job.output.kind}${'floor' in job.output && job.output.floor ? ` f${job.output.floor}` : ''} ${start}–${at()}`);
          return result;
        },
        convertImage: async (bitmap) => {
          const start = at();
          const mp = (bitmap.width * bitmap.height / 1e6).toFixed(0);
          const result = await optimizeBitmap(bitmap, { ...IMAGE_PRESETS.map, quality: SCENE_MAP_QUALITY }, { thumbnail: THUMBNAIL_SPEC });
          sizes.push(result.image.size);
          events.push(`encode ${mp} MP ${start}–${at()}`);
          return result;
        },
        thumbnails: new AssetThumbnailService(vault.app, assetService),
      };
      const model = generateDungeon(request);
      const look = lookOverride ?? styleId;
      const result = await createDungeonSceneWith(deps, { name: `Perf Gen ${name}`, request, model, style: dungeonStyle(look), view: DEFAULT_VIEW, collectionId: 'Perf' });
      const total = at();
      observer.disconnect();
      if (!result.ok) throw new Error(result.problem);
      rows.push(`${name}: total ${total} ms, longest main-thread task ${Math.round(longest)} ms, maps ${sizes.map((s) => (s / 1e6).toFixed(1)).join(' / ')} MB\n  ${events.join('\n  ')}`);
      await commands.writeFile('out/perf-gen/scene.txt', rows.join('\n'));
      const limit = (look === 'crayon' ? CRAYON_LIMITS : LIMITS)[name];
      if (limit !== undefined) expect(total, `${name}: ${total} ms`).toBeLessThan(limit);
    });
  }
});
