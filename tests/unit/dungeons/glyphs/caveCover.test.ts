import { describe, expect, it, vi } from 'vitest';
import { DRAWN_TERRAIN_KINDS } from '../../../../src/app/dungeons/drawnKinds';
import type { CellPoint, TerrainKind } from '../../../../src/app/dungeons/model';
import { buildArtScene } from '../../../../src/app/dungeons/render/art/artScene';
import { pathBounds, polyPath, polysPath, runsPath, type PathFn } from '../../../../src/app/dungeons/render/art/paths';
import { engravedHand } from '../../../../src/app/dungeons/render/engraved/hand';
import { pensOf } from '../../../../src/app/dungeons/render/engraved/pens';
import { createRenderEnv } from '../../../../src/app/dungeons/render/renderEnv';
import { stoneColours } from '../../../../src/app/dungeons/render/stone/colours';
import { stoneHand } from '../../../../src/app/dungeons/render/stone/hand';
import { SvgCanvas } from '../../../../src/app/dungeons/render/svgCanvas';
import { cellBox } from '../../../../src/app/dungeons/render/terrain/cellRings';
import { drawnTerrainKinds, drawTerrainGround, drawTerrainStanding } from '../../../../src/app/dungeons/render/terrain/drawTerrain';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';
import { draft } from '../../../../src/app/dungeons/terrain/catalog';
import { addRoom, emptyModel } from '../../../fixtures/dungeonModelBuilder';

const KINDS = ['guano', 'bone-litter', 'sulphur-crust', 'rimstone', 'boulder-choke'] as const;
const CELLS = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }];

function drawing(kind: TerrainKind, look: string, cells: CellPoint[] = CELLS, seed = 11) {
  const model = emptyModel(seed);
  addRoom(model.floors[0]!, { x: 0, y: 0, w: 5, h: 5 });
  model.floors[0]!.terrain.push({ id: 0, ...draft(kind, 0, cells) });
  const ctx = new SvgCanvas(750, 750);
  const view = { ...DEFAULT_VIEW, shadow: false };
  const env = createRenderEnv(ctx, visibleDungeon(model, view), dungeonStyle(look), view, 150);
  const scene = buildArtScene(env, { originCell: { x: 0, y: 0 }, widthPx: 750, heightPx: 750, pxPerCell: 150 }, [], false, false);
  const hand = env.style.direction === 'stone' ? stoneHand(scene, stoneColours(env.palette, false)) : engravedHand(scene, pensOf(scene));
  const paths: PathFn[] = [];
  const radii: number[] = [];
  vi.spyOn(hand, 'surface').mockImplementation(path => { paths.push(path); });
  vi.spyOn(hand, 'line').mockImplementation(runs => { paths.push(runsPath(runs)); });
  vi.spyOn(hand, 'edges').mockImplementation(poly => { paths.push(polyPath(poly)); });
  vi.spyOn(hand, 'tone').mockImplementation((_field, bounds, clip) => {
    paths.push(clip ?? (path => path.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)));
  });
  vi.spyOn(hand, 'water').mockImplementation(pools => { paths.push(polysPath(pools)); });
  vi.spyOn(hand, 'solid').mockImplementation((path, _at, radius) => { paths.push(path); radii.push(radius); });
  drawTerrainGround(hand, { water: env.palette.water, cloth: env.palette.fill });
  return { hand, paths, radii };
}

describe('cave floor cover', () => {
  it('offers every kind with a ground drawing for both painters', () => {
    for (const kind of KINDS) {
      expect(drawnTerrainKinds()).toContain(kind);
      expect(DRAWN_TERRAIN_KINDS.has(kind)).toBe(true);
      for (const look of ['parchment', 'print']) {
        const { hand, paths } = drawing(kind, look);
        expect(paths.length, `${look} ${kind}`).toBeGreaterThan(0);
        paths.length = 0;
        drawTerrainStanding(hand, { water: '', cloth: '' });
        expect(paths).toEqual([]);
      }
    }
  });

  it('draws only within the piece\'s cells', () => {
    const shapes = [CELLS, [{ x: -3, y: -2 }], [{ x: 1, y: 1 }, { x: 3, y: 3 }]];
    for (const look of ['parchment', 'print']) for (const kind of KINDS) for (const cells of shapes) {
      const box = cellBox(cells);
      for (let seed = 1; seed <= 12; seed++) {
        const { paths } = drawing(kind, look, cells, seed);
        expect(paths.length, kind).toBeGreaterThan(0);
        for (const path of paths) {
          const bounds = pathBounds(path)!;
          expect(bounds.minX, kind).toBeGreaterThanOrEqual(box.x - 0.02);
          expect(bounds.minY, kind).toBeGreaterThanOrEqual(box.y - 0.02);
          expect(bounds.maxX, kind).toBeLessThanOrEqual(box.x + box.w + 0.02);
          expect(bounds.maxY, kind).toBeLessThanOrEqual(box.y + box.h + 0.02);
        }
      }
    }
  });

  it('tells a boulder choke from a rubble field', () => {
    const median = (xs: number[]): number => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    for (const look of ['parchment', 'print']) {
      const rubble = drawing('rubble-field', look).radii;
      const boulders = drawing('boulder-choke', look).radii;
      expect(boulders.length).toBeGreaterThan(0);
      expect(median(boulders)).toBeGreaterThanOrEqual(median(rubble) * 2);
    }
  });
});
