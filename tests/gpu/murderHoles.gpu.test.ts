import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';

/** The scene's picture of a floor with murder holes: each is cut through in its middle, so the gate passage below shows. */
describe('murder holes in the scene picture', () => {
  for (const px of [100, 150, 280]) {
    it(`open through to the floor below at ${px} px a cell, with stone round them`, () => {
      const model = generateDungeon({ seed: 2, theme: 'fortress', tags: [], floors: 3 });
      let holes = 0;
      model.floors.forEach((floor, index) => {
        const murder = floor.terrain.filter((p) => p.kind === 'murder-hole');
        if (murder.length === 0) return;
        const layout = mapLayout(model, px, DEFAULT_VIEW);
        const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
        const ctx = canvas.getContext('2d')!;
        renderMap(ctx, model, dungeonStyle('masonry'), DEFAULT_VIEW, { pxPerCell: px, floor: index, openings: 'cut' });
        const alpha = (x: number, y: number): number => ctx.getImageData(Math.round((x - layout.originCell.x) * px), Math.round((y - layout.originCell.y) * px), 1, 1).data[3]!;
        for (const hole of murder) {
          holes++;
          const c = hole.cells[0]!;
          expect(alpha(c.x + 0.5, c.y + 0.5), `hole ${hole.id} middle`).toBe(0);
          expect(alpha(c.x + 0.15, c.y + 0.15), `hole ${hole.id} stone`).toBe(255);
        }
      });
      expect(holes).toBeGreaterThan(1);
    });
  }
});
