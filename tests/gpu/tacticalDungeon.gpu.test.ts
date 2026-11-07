import { afterAll, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { DungeonWorkerClient } from '../../src/app/dungeons/worker/DungeonWorkerClient';
import DungeonWorker from '../../src/app/dungeons/worker/dungeonWorker?worker&inline';
import { imageDimensions } from '../../src/app/imageProcessing/imageDimensions';
import { dungeonScene } from '../../src/app/dungeons/scene/toScene';
import { dungeonWalls } from '../../src/app/dungeons/scene/toWalls';
import { mapLayout, suggestedPxPerCell, SCENE_MAP_PIXELS } from '../../src/app/dungeons/render/layoutSize';

const client = new DungeonWorkerClient({ createWorker: () => new DungeonWorker({ name: 'Tactical dungeon test' }) });
afterAll(() => client.dispose());

it('renders Tactical maps through the real worker with valid walls and bounded image sizes', async () => {
  for (const fiveRoom of [true, false]) {
    const theme = 'fortress';
    const style = dungeonStyle('parchment');
    const result = await client.render({
      request: { seed: 6271, theme, tags: ['large', fiveRoom ? 'dry' : 'wet', 'flat'], floors: fiveRoom ? 1 : 2, fiveRoom, roomScale: 'tactical' },
      style, view: DEFAULT_VIEW,
      output: { kind: 'map', pxPerCell: 150, maxPixels: 1_500_000 },
    });
    if (result.image.type !== 'png') throw new Error('Expected a PNG');
    expect(await imageDimensions(result.image.blob)).toEqual({ width: result.map.widthPx, height: result.map.heightPx });
    expect(result.map.widthPx * result.map.heightPx).toBeLessThanOrEqual(1_500_000);
    expect(Object.keys(dungeonWalls(result.model, style, DEFAULT_VIEW, result.map).walls).length).toBeGreaterThan(10);
    // Scene creation uses the scene image budget, not this test's reduced PNG export budget.
    const sceneMap = mapLayout(result.model, suggestedPxPerCell(result.model, 150, DEFAULT_VIEW, SCENE_MAP_PIXELS));
    const scene = dungeonScene(result.model, style, DEFAULT_VIEW, sceneMap,
      { width: sceneMap.widthPx, height: sceneMap.heightPx }, { unitType: 'feet', ruleDistance: 5 });
    expect(scene?.scene.grid.size, `${theme}, fiveRoom=${fiveRoom}`).toBe(sceneMap.pxPerCell);
    expect(Object.keys(scene?.scene.walls ?? {}).length).toBeGreaterThan(10);
    const bitmap = await createImageBitmap(result.image.blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.style.maxWidth = '100%';
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    document.body.append(canvas);
    await page.screenshot({ path: `../../logs/tactical/${theme}-${fiveRoom ? 'five' : 'multi'}.png`, fullPage: true });
    canvas.remove();
  }
});
