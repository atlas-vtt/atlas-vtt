import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import type { CaveWayPart } from '../../src/app/dungeons/render/cave/caveArt';
import { buildArtScene } from '../../src/app/dungeons/render/art/artScene';
import { drawGlyph } from '../../src/app/dungeons/render/art/glyph';
import type { Hand } from '../../src/app/dungeons/render/art/hand';
import { CAVE_WAYS } from '../../src/app/dungeons/render/cave/ways';
import { crayonBox } from '../../src/app/dungeons/render/crayon/crayonBox';
import { crayonHand } from '../../src/app/dungeons/render/crayon/hand';
import { crayonPens } from '../../src/app/dungeons/render/crayon/pens';
import { engravedHand } from '../../src/app/dungeons/render/engraved/hand';
import { pensOf } from '../../src/app/dungeons/render/engraved/pens';
import { glyphFit } from '../../src/app/dungeons/render/propShapes';
import { PROP_GLYPHS } from '../../src/app/dungeons/render/props/registry';
import { createRenderEnv } from '../../src/app/dungeons/render/renderEnv';
import { stoneColours } from '../../src/app/dungeons/render/stone/colours';
import { stoneHand } from '../../src/app/dungeons/render/stone/hand';
import { drawTerrainGround, drawTerrainOpenings } from '../../src/app/dungeons/render/terrain/drawTerrain';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import type { CellPoint, DungeonModel, TerrainKind } from '../../src/app/dungeons/model';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { draft } from '../../src/app/dungeons/terrain/catalog';
import { addDoor, addRoom, emptyFloor, emptyModel } from '../fixtures/dungeonModelBuilder';

/**
 * What each way up or down costs to draw, per painter, at play zoom (150 px a cell): the middle of
 * five runs of 200 drawings, against twice the slowest reference prop (fountain, well, statue) in
 * the same painter, as every family is held (style guide §10); terrain that covers its cells
 * (shafts, chasms, ledges, the floor under a hole) is only recorded. The table goes to
 * `out/perf-glyph/caveVertical.txt`, so a change can be held to what a feature cost before it.
 */

const PX = 150;
const LOOKS = ['parchment', 'print', 'crayon'] as const;
const box = (x: number, y: number, w: number, h: number): CellPoint[] => Array.from({ length: w * h }, (_, i) => ({ x: x + (i % w), y: y + Math.floor(i / w) }));

/** `area`: terrain drawn over its cells, as large as the room makes it, recorded against what it cost before rather than held to a prop's limit. */
type Sample = { name: string; floor: number; build: (model: DungeonModel) => void; draw: (hand: Hand) => void; area?: true };

const way = (part: CaveWayPart) => (hand: Hand): void => CAVE_WAYS[part]?.(hand);
const stair = (kind: 'pitch' | 'scree', index: number) => (model: DungeonModel): void => {
  model.floors[index]!.stairs = [{ x: 1, y: 1, w: 2, h: 3, down: { x: 0, y: 1 }, way: kind, to: 1 - index, link: 0 }];
};
const piece = (kind: TerrainKind, cells: CellPoint[], extra: Parameters<typeof draft>[3] = {}, opening?: boolean) => (model: DungeonModel): void => {
  model.floors[0]!.terrain.push({ id: 0, ...draft(kind, 0, cells, extra), ...(opening ? { opening: { bottom: null, link: 0 } } : {}) });
};

const SAMPLES: readonly Sample[] = [
  { name: 'pitch', floor: 0, build: stair('pitch', 0), draw: way('pitch') },
  { name: 'pitch from below', floor: 1, build: stair('pitch', 1), draw: way('aven') },
  { name: 'scree from above', floor: 0, build: stair('scree', 0), draw: way('scree') },
  { name: 'scree from below', floor: 1, build: stair('scree', 1), draw: way('scree') },
  {
    name: 'scree steps', floor: 0, draw: way('scree'),
    build: model => { addDoor(model.floors[0]!, 2, 2, { x: 0, y: 1 }, 'steps', 0, 0).descends = true; },
  },
  {
    // A climb stands in a way between two caves and its edge runs from wall to wall: a doorway two cells wide, as a pitch's passage is.
    name: 'climb', floor: 0, draw: way('climbWay'),
    build: model => {
      const floor = model.floors[0]!;
      floor.rooms = [];
      addRoom(floor, { x: 0, y: 0, w: 5, h: 2 });
      addRoom(floor, { x: 0, y: 3, w: 5, h: 2 });
      floor.cave!.heights = [0, 0];
      const door = addDoor(floor, 2, 2, { x: 0, y: 1 }, 'opening', 0, 1);
      door.wide = { x: 1, y: 0 };
      door.way = 'climb';
      door.descends = true;
      door.drop = { depth: 20, kind: 'shaft' };
    },
  },
  { name: 'shaft', floor: 0, area: true, build: piece('shaft', [{ x: 2, y: 2 }], { traits: { drop: { depth: 20, kind: 'shaft' } } }, true), draw: drawTerrainOpenings },
  { name: 'chasm', floor: 0, area: true, build: piece('chasm', [...box(1, 2, 3, 1), ...box(2, 3, 2, 1)], {}, true), draw: drawTerrainOpenings },
  { name: 'aven', floor: 0, build: piece('aven', [{ x: 2, y: 2 }], { traits: { drop: { depth: 30, kind: 'shaft' } } }), draw: hand => drawTerrainGround(hand, { water: '#5d94b8', cloth: '#7d2a26' }) },
  { name: 'ledge', floor: 0, area: true, build: piece('ledge', box(1, 2, 3, 1), { facing: { x: 0, y: 1 }, steps: [{ x: 3, y: 2 }] }), draw: hand => drawTerrainGround(hand, { water: '#5d94b8', cloth: '#7d2a26' }) },
  { name: 'chasm-floor', floor: 0, area: true, build: piece('chasm-floor', box(2, 2, 2, 1)), draw: hand => drawTerrainGround(hand, { water: '#5d94b8', cloth: '#7d2a26' }) },
];

function handOf(look: string, sample?: Sample): { hand: Hand; ctx: OffscreenCanvasRenderingContext2D } {
  const model = emptyModel(412);
  model.theme = 'cavern';
  model.floors.push(emptyFloor());
  for (const floor of model.floors) {
    addRoom(floor, { x: 0, y: 0, w: 5, h: 5 });
    floor.cave = { lane: [], heights: [0], faults: [], streams: [], basins: [], dams: [] };
  }
  sample?.build(model);
  const ctx = new OffscreenCanvas(5 * PX, 5 * PX).getContext('2d')!;
  ctx.scale(PX, PX);
  const style = dungeonStyle(look);
  const env = createRenderEnv(ctx, visibleDungeon(model, DEFAULT_VIEW, sample?.floor ?? 0), style, DEFAULT_VIEW, PX, 'drawn');
  const scene = buildArtScene(env, { originCell: { x: 0, y: 0 }, widthPx: 5 * PX, heightPx: 5 * PX, pxPerCell: PX }, [], false);
  if (style.direction === 'stone') return { hand: stoneHand(scene, stoneColours(env.palette, false)), ctx };
  if (style.direction === 'crayon') return { hand: crayonHand(scene, crayonPens(scene), crayonBox(scene)), ctx };
  return { hand: engravedHand(scene, pensOf(scene)), ctx };
}

function measure(draw: () => void, ctx: OffscreenCanvasRenderingContext2D): number {
  const runs: number[] = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    for (let i = 0; i < 200; i++) draw();
    ctx.getImageData(0, 0, 1, 1);
    runs.push(performance.now() - start);
  }
  return runs.sort((a, b) => a - b)[2]!;
}

describe('the ways up and down', () => {
  it('keeps every vertical feature within twice the slowest reference prop in each painter', async () => {
    const rows = ['painter\tfeature\tms per 200\tlimit'];
    const failures: string[] = [];
    for (const look of LOOKS) {
      const reference = (['fountain', 'well', 'statue'] as const).map(kind => {
        const { hand, ctx } = handOf(look);
        return measure(() => drawGlyph(hand, { x: 2.5, y: 2.5, rotation: 0, scale: 1, fit: glyphFit({ kind, scale: 1 }) }, PROP_GLYPHS[kind]!, hand.scene.env.palette.water, hand.paint('cloth').fill), ctx);
      });
      const limit = 2 * Math.max(...reference);
      rows.push(`${look}\treference\t${Math.max(...reference).toFixed(2)}\t`);
      for (const sample of SAMPLES) {
        const { hand, ctx } = handOf(look, sample);
        const ms = measure(() => sample.draw(hand), ctx);
        rows.push(`${look}\t${sample.name}\t${ms.toFixed(2)}\t${limit.toFixed(2)}`);
        if (!sample.area && ms > limit) failures.push(`${look} ${sample.name}: ${ms.toFixed(2)} > ${limit.toFixed(2)}`);
      }
    }
    await commands.writeFile('out/perf-glyph/caveVertical.txt', `${rows.join('\n')}\n`);
    expect(failures).toEqual([]);
  });
});
