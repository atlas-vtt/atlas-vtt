import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FIRST_PROP_KINDS } from '../../src/app/dungeons/drawnKinds';
import type { PropKind } from '../../src/app/dungeons/model';
import { buildArtScene } from '../../src/app/dungeons/render/art/artScene';
import { drawGlyph } from '../../src/app/dungeons/render/art/glyph';
import type { Hand } from '../../src/app/dungeons/render/art/hand';
import { engravedHand } from '../../src/app/dungeons/render/engraved/hand';
import { pensOf } from '../../src/app/dungeons/render/engraved/pens';
import { glyphFit, type PropGlyph } from '../../src/app/dungeons/render/propShapes';
import { PROP_GLYPHS } from '../../src/app/dungeons/render/props/registry';
import { createRenderEnv } from '../../src/app/dungeons/render/renderEnv';
import { stoneColours } from '../../src/app/dungeons/render/stone/colours';
import { stoneHand } from '../../src/app/dungeons/render/stone/hand';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW, type ArtDirection } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { modelOf } from './glyphSheetModel';
import { GROUNDS_KINDS, type GroundsKind, type WindowSize } from '../../src/app/dungeons/houseModel';
import { drawWindowsOf } from '../../src/app/dungeons/render/art/windows';
import { polysPath, rectPoly } from '../../src/app/dungeons/render/art/paths';
import type { Vec } from '../../src/app/dungeons/render/geometry';
import { drawBoundaryWall, drawGate, drawHedge } from '../../src/app/dungeons/render/grounds/boundary';
import { engravedGroundsPaint } from '../../src/app/dungeons/render/grounds/engravedPaint';
import { drawColumn, drawFountain, drawTree } from '../../src/app/dungeons/render/grounds/garden';
import { drawOutbuildingFloor, drawPorchFloor, drawWays } from '../../src/app/dungeons/render/grounds/ground';
import { crownOf, type Crown, type CrownSpecies } from '../../src/app/dungeons/render/grounds/crowns';
import { outbuildingOf } from '../../src/app/dungeons/render/grounds/groundsShapes';
import { drawOutbuilding } from '../../src/app/dungeons/render/grounds/outbuildings';
import type { GroundsPaint } from '../../src/app/dungeons/render/grounds/paint';
import { stoneGroundsPaint } from '../../src/app/dungeons/render/grounds/stonePaint';
import { WALL_LIGHT_GLYPHS } from '../../src/app/dungeons/render/wallLights/wallLightGlyphs';

/**
 * What one piece costs to draw, per painter: each kind drawn 200 times at play zoom (150 px a
 * cell), the middle of five runs. A kind of a family may cost at most twice the slowest of the
 * reference props (fountain, well, statue) in the same painter (style guide §10), and so may a
 * piece of a house's grounds, a window of each size, a lived-in dungeon's wall lights, a kind's drawing on a house's floor and with its fire burning. The tables go to `out/perf-glyph/cost.txt` and `grounds-cost.txt`.
 */

const PX = 150;
const DRAWS = 200;
const RUNS = 5;
const REFERENCE: readonly PropKind[] = ['fountain', 'well', 'statue'];
const FIRST_PROPS = new Set(FIRST_PROP_KINDS);
const LOOK: Record<ArtDirection, string> = { stone: 'parchment', engraved: 'print' };

/** A painter's hand over a canvas of one room, at play zoom, and the colours its props take for water and cloth. */
function handOf(direction: ArtDirection): { hand: Hand; canvas: OffscreenCanvas; water: string; cloth: string; paint: GroundsPaint } {
  const canvas = new OffscreenCanvas(5 * PX, 5 * PX);
  const ctx = canvas.getContext('2d')!;
  const model = modelOf(5, 5, []);
  const style = dungeonStyle(LOOK[direction]);
  const env = createRenderEnv(ctx, visibleDungeon(model, DEFAULT_VIEW), style, DEFAULT_VIEW, PX);
  ctx.scale(PX, PX);
  const scene = buildArtScene(env, { originCell: { x: 0, y: 0 }, widthPx: canvas.width, heightPx: canvas.height, pxPerCell: PX }, [], false);
  if (direction === 'stone') {
    const c = stoneColours(env.palette, false);
    const hand = stoneHand(scene, c);
    return { hand, canvas, water: c.water, cloth: c.cloth, paint: stoneGroundsPaint(hand, c) };
  }
  const pens = pensOf(scene);
  const hand = engravedHand(scene, pens);
  return { hand, canvas, water: pens.water, cloth: pens.floor, paint: engravedGroundsPaint(hand, pens) };
}

/** Milliseconds for `DRAWS` drawings of a kind, the middle of `RUNS` runs; reading a pixel waits for the canvas. */
function cost(direction: ArtDirection, kind: PropKind, glyph: PropGlyph): number {
  const place = { x: 2.5, y: 2.5, rotation: 0, scale: 1, fit: glyphFit({ kind, scale: 1 }) };
  return timed(direction, ({ hand, water, cloth }) => drawGlyph(hand, place, glyph, water, cloth));
}

/** Milliseconds for `DRAWS` of a drawing on a painter's hand, the middle of `RUNS` runs. */
function timed(direction: ArtDirection, draw: (on: ReturnType<typeof handOf>) => void): number {
  const on = handOf(direction);
  const read = on.canvas.getContext('2d')!;
  const runs: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const started = performance.now();
    for (let i = 0; i < DRAWS; i++) draw(on);
    read.getImageData(0, 0, 1, 1);
    runs.push(performance.now() - started);
  }
  return runs.sort((a, b) => a - b)[Math.floor(RUNS / 2)]!;
}

const cells = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => Array.from({ length: w * h }, (_, k) => ({ x: x + (k % w), y: y + Math.floor(k / w) }));
const square = (x: number, y: number, n: number): Vec[][] => [rectPoly({ x, y, w: n, h: n })];

const MIDDLE_CROWN = crownOf({ x: 2.5, y: 2.5 }, 1.1);

/** The largest crown the grounds plant (1.4 cells) of a species, at the first cell along a row that grows one. */
function largestCrown(species: CrownSpecies): Crown {
  for (let k = 0; k < 100; k++) {
    const crown = crownOf({ x: 2.5 + k * 10, y: 2.5 }, 1.4);
    if (crown.species === species) return crown;
  }
  throw new Error(`no ${species}`);
}

/**
 * One of each piece of a house's grounds as a glyph is measured: a piece that stands alone whole
 * (gate, porch, outbuilding, tree, fountain), one that covers ground (lawn, ways, hedge, boundary
 * wall) by one cell of it, in the middle of a stretch so its edges are those of a cell in a run.
 */
const GROUNDS_SAMPLES: Record<GroundsKind, (hand: Hand, paint: GroundsPaint) => void> = {
  garden: (_, paint) => paint.lawn(polysPath(square(2, 2, 1)), cells(2, 2, 1, 1)),
  path: (hand, paint) => drawWays(hand, paint, square(2, 2, 1), cells(2, 2, 1, 1)),
  drive: (hand, paint) => drawWays(hand, paint, square(2, 2, 1), cells(2, 2, 1, 1)),
  hedge: (hand, paint) => drawHedge(hand, paint, { kind: 'hedge', cells: cells(2, 2, 1, 1) }),
  'boundary-wall': (hand) => drawBoundaryWall(hand, { kind: 'boundary-wall', cells: cells(2, 2, 1, 1) }),
  gate: (hand) => drawGate(hand, { kind: 'gate', cells: cells(1, 2, 3, 1), dir: { x: 0, y: -1 } }),
  porch: (hand) => {
    const porch = { kind: 'porch' as const, cells: cells(1, 2, 3, 1), columns: [{ x: 1.15, y: 2.85 }, { x: 3.85, y: 2.85 }] };
    drawPorchFloor(hand, porch);
    porch.columns.forEach((at) => drawColumn(hand, at));
  },
  outbuilding: (hand, paint) => {
    const building = { kind: 'outbuilding' as const, cells: cells(1, 1, 3, 3), use: 'carriage-house' as const, door: { x: 2, y: 4, dir: { x: 0, y: -1 } as const } };
    const frame = outbuildingOf(building);
    drawOutbuildingFloor(hand, building, frame);
    drawOutbuilding(hand, paint, building, frame);
  },
  // A tree of the middle size the grounds plant (crowns 0.8 to 1.4 cells), its crown worked out once as the layout does.
  tree: (_, paint) => drawTree(paint, MIDDLE_CROWN),
  'garden-fountain': (hand, paint) => drawFountain(hand, paint, { kind: 'garden-fountain', cells: cells(2, 2, 2, 2), at: { x: 3, y: 3 } }),
};

/** One window of each size in a house's outer wall. */
const WINDOW_SAMPLES: Record<WindowSize | 'facade', (hand: Hand) => void> = {
  facade: (hand) => drawWindowsOf(hand, [{ x: 2, y: 2, dir: { x: 0, y: -1 }, room: 0 }]),
  tall: (hand) => drawWindowsOf(hand, [{ x: 2, y: 2, dir: { x: 0, y: -1 }, room: 0, size: 'tall' }]),
  small: (hand) => drawWindowsOf(hand, [{ x: 2, y: 2, dir: { x: 0, y: -1 }, room: 0, size: 'small' }]),
};

describe('glyph cost', () => {
  it("draws every kind within twice its painter's slowest reference", async () => {
    const rows = ['painter\tkind\tms per 200\tlimit'];
    const over: string[] = [];
    for (const direction of ['stone', 'engraved'] as const) {
      const costs = new Map(Object.entries(PROP_GLYPHS).map(([kind, glyph]) => [kind as PropKind, cost(direction, kind as PropKind, glyph)]));
      const limit = 2 * Math.max(...REFERENCE.map(kind => costs.get(kind)!));
      // A kind drawn otherwise on a house's floor, or with its fire burning, is held to the same limit there.
      const variants = Object.entries(PROP_GLYPHS).flatMap(([kind, glyph]) => [
        ...(glyph.lit ? [[`${kind} (lit)`, cost(direction, kind as PropKind, glyph.lit)] as const] : []),
        ...(glyph.inHouse ? [[`${kind} (house)`, cost(direction, kind as PropKind, glyph.inHouse)] as const] : []),
        ...(glyph.inHouse?.lit ? [[`${kind} (house, lit)`, cost(direction, kind as PropKind, glyph.inHouse.lit)] as const] : []),
      ]);
      for (const [kind, ms] of [...costs, ...variants]) {
        const reference = FIRST_PROPS.has(kind as PropKind);
        rows.push(`${direction}\t${kind}\t${ms.toFixed(2)}\t${reference ? '(reference)' : limit.toFixed(2)}`);
        if (!reference && ms > limit) over.push(`${direction} ${kind}: ${ms.toFixed(2)} ms, limit ${limit.toFixed(2)}`);
      }
    }
    await commands.writeFile('out/perf-glyph/cost.txt', `${rows.join('\n')}\n`);
    expect(over).toEqual([]);
  });

  it("draws each piece of a house's grounds and each wall light within twice its painter's slowest reference", async () => {
    const rows = ['painter\tkind\tms per 200\tlimit'];
    const over: string[] = [];
    for (const direction of ['stone', 'engraved'] as const) {
      const limit = 2 * Math.max(...REFERENCE.map(kind => cost(direction, kind, PROP_GLYPHS[kind]!)));
      const samples: [string, (on: ReturnType<typeof handOf>) => void][] = [
        ...GROUNDS_KINDS.map((kind): [string, (on: ReturnType<typeof handOf>) => void] => [kind, ({ hand, paint }) => GROUNDS_SAMPLES[kind](hand, paint)]),
        ...(['broadleaf', 'conifer'] as const).map((species): [string, (on: ReturnType<typeof handOf>) => void] => {
          const crown = largestCrown(species);
          return [
            `tree (largest ${species})`,
            ({ hand, paint }) => {
              // Moved back onto the measuring canvas.
              const { ctx } = hand.scene.env;
              ctx.save();
              ctx.translate(2.5 - crown.centre.x, 0);
              drawTree(paint, crown);
              ctx.restore();
            },
          ];
        }),
        ...Object.entries(WINDOW_SAMPLES).map(([size, draw]): [string, (on: ReturnType<typeof handOf>) => void] => [`${size} window`, ({ hand }) => draw(hand)]),
        ...Object.entries(WALL_LIGHT_GLYPHS).map(([kind, glyph]): [string, (on: ReturnType<typeof handOf>) => void] => [
          `wall light: ${kind}`,
          ({ hand, water, cloth }) => drawGlyph(hand, { x: 2.5, y: 2.5, rotation: 0, scale: 1, fit: { along: 0.4, out: 0.3 } }, glyph, water, cloth),
        ]),
      ];
      for (const [kind, draw] of samples) {
        const ms = timed(direction, draw);
        rows.push(`${direction}\t${kind}\t${ms.toFixed(2)}\t${limit.toFixed(2)}`);
        if (ms > limit) over.push(`${direction} ${kind}: ${ms.toFixed(2)} ms, limit ${limit.toFixed(2)}`);
      }
    }
    await commands.writeFile('out/perf-glyph/grounds-cost.txt', `${rows.join('\n')}\n`);
    expect(over).toEqual([]);
  });
});
