import { describe, expect, it } from 'vitest';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { paletteOf, parseHex } from '../../src/app/dungeons/render/palette';
import { houseCells } from '../../src/app/dungeons/geometry';
import { OUTER_WALL, doorwayShape, windowSpan } from '../../src/app/dungeons/render/houseShapes';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { dungeonWalls } from '../../src/app/dungeons/scene/toWalls';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { edgeHouse } from '../unit/dungeons/house/edgeFixtures';
import { inkMask, nearestInk, wallsOnInk, type Picture } from './dungeonFidelityChecks';
import { savePng, withoutText } from './dungeonRenderHarness';

/**
 * A house's walls on cell edges in both painters: the scene's walls lie on drawn ink, inner walls
 * as well as outer ones, and each window cuts its outer wall, so the wall's ink is gone over the
 * window's embrasure, where the window's own sill, board and frame stand.
 */

const PX = 120;
const LOOKS: readonly DungeonStyleId[] = ['parchment', 'print', 'night'];

describe('a house drawn with its walls on cell edges', () => {
  for (const look of LOOKS) {
    it(`puts walls on ink and cuts the windows (${look})`, async () => {
      const model = edgeHouse();
      const style = dungeonStyle(look);
      const layout = mapLayout(model, PX, DEFAULT_VIEW);
      const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
      const { ctx, texts } = withoutText(canvas.getContext('2d')!);
      renderMap(ctx, model, style, DEFAULT_VIEW, { pxPerCell: PX });
      expect(texts).toEqual([]);
      await savePng(canvas, `house/edge-${look}`);
      const picture: Picture = { data: canvas.getContext('2d')!.getImageData(0, 0, layout.widthPx, layout.heightPx).data, width: layout.widthPx, height: layout.heightPx };
      const mask = inkMask(picture, parseHex(paletteOf(style, DEFAULT_VIEW).ink));
      const placement = { originCell: layout.originCell, pxPerCell: PX };
      const walls = Object.values(dungeonWalls(model, style, DEFAULT_VIEW, placement).walls);
      const solid = walls.filter((wall) => wall.type === 'solid' && wall.blocks === undefined);
      // The sides of a secret door's doorway are no drawn walls: the map draws the wall unbroken there.
      const rooms = new Map(model.floors[0]!.rooms.map((room) => [room.id, room]));
      const house = houseCells(model.floors[0]!);
      const secret = model.floors[0]!.doors.filter((door) => door.kind === 'secret').map((door) => doorwayShape(door, rooms, house));
      const inSecret = (p: { x: number; y: number }): boolean => {
        const c = { x: p.x / PX + layout.originCell.x, y: p.y / PX + layout.originCell.y };
        return secret.some((r) => c.x >= r.x - 0.05 && c.x <= r.x + r.w + 0.05 && c.y >= r.y - 0.05 && c.y <= r.y + r.h + 0.05);
      };
      const far = wallsOnInk(solid, mask, picture).filter((s) => s.distance > 3 && !inSecret(s.at));
      expect(far.slice(0, 5)).toEqual([]);
      const toPx = (p: { x: number; y: number }): { x: number; y: number } => ({ x: (p.x - layout.originCell.x) * PX, y: (p.y - layout.originCell.y) * PX });
      for (const window of model.floors[0]!.windows!) {
        const [a, b] = windowSpan(window);
        // In the embrasure between the window board and the frame, where the wall's joints, hatching or ink would show were it not cut.
        const off = -(OUTER_WALL / 2 - 0.07);
        const probes = [0.3, 0.5, 0.7].map((t) => toPx({ x: a.x + (b.x - a.x) * t + window.dir.x * off, y: a.y + (b.y - a.y) * t + window.dir.y * off }));
        for (const p of probes) expect(nearestInk(mask, picture, p, 1), `${look}: window at ${window.x},${window.y}`).toBe(Infinity);
      }
    });
  }
});
