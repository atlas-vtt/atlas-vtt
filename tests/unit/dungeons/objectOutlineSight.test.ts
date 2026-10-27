import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { DEFAULT_PX_PER_CELL, mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { dungeonScene } from '../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { sealTolerance, worldTexel } from '../../../src/app/lighting/lightingConstants';
import { sealWalls } from '../../../src/app/lighting/sealWalls';
import type { Point } from '../../../src/app/types/visionTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { computeVisibility, pointInPolygon } from '../../../src/app/vision/visibility';
import { wallList } from '../../../src/app/vision/wallList';

/**
 * A column's outline casts a lamp's shadow but is no hole and no cover: a lamp that lights a
 * column's faces lights its top, the way the players' picture draws it, and what stands right
 * behind the column lies in its shadow, while sight passes the outline altogether. Before, the
 * outline was a closed wall from both sides and every column top was a black octagon.
 */
describe('the outline of a tall object, as sight and light see it', () => {
  it.each(['sight', 'light'] as const)('shows the top of every column a %s source reaches the faces of, and what lies behind it to sight alone', (channel) => {
    const model = generateDungeon({ seed: 3, theme: 'fortress', tags: ['colonnades', 'large'], floors: 1 });
    const pxPerCell = DEFAULT_PX_PER_CELL;
    const layout = mapLayout(model, pxPerCell, DEFAULT_VIEW);
    const image = { width: layout.widthPx, height: layout.heightPx };
    const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell }, image, { unitType: 'feet', ruleDistance: 5 })!;
    const walls = sealWalls(wallList(parts.scene.walls), sealTolerance(worldTexel(image)));
    const outlines = new Map<string, WallSegment[]>();
    for (const wall of Object.values(parts.scene.walls)) {
      if (!wall.id.includes('_shadow_')) continue;
      outlines.set(wall.chainId!, [...(outlines.get(wall.chainId!) ?? []), wall]);
    }
    let checked = 0;
    for (const faces of outlines.values()) {
      const corners = faces.map((face) => face.p1);
      const middle: Point = { x: corners.reduce((sum, p) => sum + p.x, 0) / corners.length, y: corners.reduce((sum, p) => sum + p.y, 0) / corners.length };
      const radius = Math.max(...corners.map((p) => Math.hypot(p.x - middle.x, p.y - middle.y)));
      for (const angle of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) {
        const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
        const viewer = { x: middle.x + dx * (radius + pxPerCell * 0.6), y: middle.y + dy * (radius + pxPerCell * 0.6) };
        const reach = computeVisibility(viewer, pxPerCell * 20, walls, undefined, channel);
        // Only where the source reaches the near face, which another wall or object may hide.
        const near = { x: middle.x + dx * radius * 0.95, y: middle.y + dy * radius * 0.95 };
        const nearOutside = { x: middle.x + dx * (radius + 4), y: middle.y + dy * (radius + 4) };
        if (!pointInPolygon(nearOutside, reach)) continue;
        checked++;
        expect(pointInPolygon(near, reach), `the near edge of the top of ${faces[0]!.chainId}`).toBe(true);
        expect(pointInPolygon(middle, reach), `the top of ${faces[0]!.chainId}`).toBe(true);
        const behind = { x: middle.x - dx * (radius + 6), y: middle.y - dy * (radius + 6) };
        expect(pointInPolygon(behind, reach), `right behind ${faces[0]!.chainId}`).toBe(channel === 'sight');
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});
