import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FIRST_PROP_KINDS } from '../../../src/app/dungeons/drawnKinds';
import type { CellPoint, DungeonModel, TerrainKind } from '../../../src/app/dungeons/model';
import { buildArtScene } from '../../../src/app/dungeons/render/art/artScene';
import { drawGlyph } from '../../../src/app/dungeons/render/art/glyph';
import { engravedHand } from '../../../src/app/dungeons/render/engraved/hand';
import { pensOf } from '../../../src/app/dungeons/render/engraved/pens';
import { glyphFit } from '../../../src/app/dungeons/render/propShapes';
import { PROP_GLYPHS } from '../../../src/app/dungeons/render/props/registry';
import { createRenderEnv } from '../../../src/app/dungeons/render/renderEnv';
import { renderMapSvg } from '../../../src/app/dungeons/render/renderMap';
import { stoneColours } from '../../../src/app/dungeons/render/stone/colours';
import { stoneHand } from '../../../src/app/dungeons/render/stone/hand';
import { drawTerrainGround } from '../../../src/app/dungeons/render/terrain/drawTerrain';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { DUNGEON_STYLES, dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { draft, type DraftOptions } from '../../../src/app/dungeons/terrain/catalog';
import { addDoor, addRoom, emptyModel } from '../../fixtures/dungeonModelBuilder';
import { drawToken } from '../dungeonArtSheets';
import { savePng } from '../dungeonRenderHarness';
import { drawWindow, offMonochrome, pathCount } from '../glyphSheetChecks';
import type { GlyphSpecimen } from './types';

const KINDS = ['guano', 'bone-litter', 'sulphur-crust', 'rimstone', 'boulder-choke'] as const;
const ROOT = 'out/dungeon-render/glyph-sheets/caveCover';
const WINDOW = { x: -1, y: -1, cells: 20, rows: 18 };
const box = (x: number, y: number, w: number, h: number): CellPoint[] => Array.from({ length: w * h }, (_, i) => ({ x: x + i % w, y: y + Math.floor(i / w) }));

/** Five cave rooms, their neighbouring rubble textures, and the eleven original props above. */
function specimen(): DungeonModel {
  const model = emptyModel(71);
  model.theme = 'cavern';
  const floor = model.floors[0]!;
  floor.cave = { lane: [], heights: [0, 0, -1, -2, -1, -1], faults: [], basins: [4], streams: [], dams: [] };
  const rooms = [[0, 0, 18, 3], [0, 4, 5, 5], [6, 4, 5, 5], [12, 4, 6, 5], [0, 10, 8, 6], [9, 10, 9, 6]];
  for (const [x, y, w, h] of rooms) {
    const cells = box(x!, y!, w!, h!).filter(c => !((c.x === x || c.x === x! + w! - 1) && (c.y === y || c.y === y! + h! - 1)));
    addRoom(floor, { x: x!, y: y!, w: w!, h: h!, cells });
  }
  // The collapse chamber pinches to a two-cell neck at its eastern mouth.
  floor.rooms[5]!.cells = floor.rooms[5]!.cells!.filter(c => c.x < 16 || c.y === 12 || c.y === 13);
  addDoor(floor, 18, 12, { x: -1, y: 0 }, 'opening', null, 5).wide = { x: 0, y: 1 };
  FIRST_PROP_KINDS.forEach((kind, i) => floor.props.push({ kind, x: i === 0 ? 2 : 4 + (i - 1) * 1.4, y: i === 0 ? 2.8 : 1.6, room: 0, rotation: 0, scale: 1 }));
  const place = (kind: TerrainKind, room: number, cells: CellPoint[], extra: DraftOptions = {}): void => {
    floor.terrain.push({ id: floor.terrain.length, ...draft(kind, room, cells, extra) });
  };
  place('guano', 1, box(1, 5, 2, 2));
  place('rubble-field', 1, box(1, 8, 2, 1));
  place('bone-litter', 2, box(7, 5, 3, 2));
  place('chasm-floor', 2, box(7, 8, 2, 1));
  place('channel', 3, box(14, 5, 1, 3), { traits: { hazard: 'acid' } });
  place('sulphur-crust', 3, [...box(13, 5, 1, 3), ...box(15, 5, 1, 3)]);
  place('rimstone', 4, box(2, 11, 3, 2), { facing: { x: 0, y: 1 } });
  place('pool', 4, box(2, 13, 3, 2));
  place('boulder-choke', 5, box(16, 12, 1, 2));
  place('broken-floor', 5, box(11, 12, 2, 2));
  return model;
}

export const SPECIMEN: GlyphSpecimen = {
  family: 'caveCover', pieces: [], crowded: [],
  scenes: [{ name: 'cover', model: specimen, floor: 0, window: WINDOW }],
};

// The shared harness's scenes currently write whole/window only and its cost gate handles props.
// Keep terrain's additional views and measured costs here, within this family's owned files.
if (!import.meta.env.VITE_GLYPH_FAMILY || import.meta.env.VITE_GLYPH_FAMILY === 'caveCover') {
  for (const { id: look } of DUNGEON_STYLES) {
    it(`proves cave cover in ${look} at play, close, thumbnail and monochrome zoom`, async () => {
      const model = specimen();
      const style = dungeonStyle(look);
      const texts: string[] = [];
      for (const px of [150, 100, 24]) {
        const drawn = drawWindow(model, style, DEFAULT_VIEW, px, WINDOW);
        texts.push(...drawn.texts);
        if (px === 150) drawToken(drawn.canvas.getContext('2d')!, 2.7 * px, 6.8 * px, 0.42 * px, '#2e86c1');
        await savePng(drawn.canvas, `glyph-sheets/caveCover/${look}${px === 150 ? '' : `-${px}`}`);
      }
      const mono = drawWindow(model, style, { ...DEFAULT_VIEW, monochrome: true }, 150, WINDOW);
      texts.push(...mono.texts);
      await savePng(mono.canvas, `glyph-sheets/caveCover/${look}-mono`);
      expect(offMonochrome(mono.canvas, style)).toBe(0);
      for (const [i, y] of [-1, 4, 10].entries()) {
        const close = drawWindow(model, style, DEFAULT_VIEW, 300, { ...WINDOW, y, rows: i === 2 ? 7 : 6 });
        texts.push(...close.texts);
        await savePng(close.canvas, `glyph-sheets/caveCover/${look}-close-${i + 1}`);
      }
      const { svg } = renderMapSvg(model, style, DEFAULT_VIEW, { pxPerCell: 30 });
      expect(svg).not.toContain('<text');
      await commands.writeFile(`${ROOT}/${look}.svg`, svg);
      for (const kind of KINDS) {
        const alone = emptyModel(71);
        addRoom(alone.floors[0]!, { x: 0, y: 0, w: 4, h: 4 });
        const empty = pathCount(renderMapSvg(alone, style, DEFAULT_VIEW, { pxPerCell: 30 }).svg);
        alone.floors[0]!.terrain.push({ id: 0, ...draft(kind, 0, box(1, 1, 2, 2)) });
        expect(pathCount(renderMapSvg(alone, style, DEFAULT_VIEW, { pxPerCell: 30 }).svg) - empty, `${look} ${kind} SVG`).toBeGreaterThan(0);
      }
      expect(texts).toEqual([]);
    });
  }

  it('keeps small Stone fields beside the original hand in every Stone look', async () => {
    const report = ['look\tmonochrome\tkind\tmean RGB error (0..255), occupied 2×2 crop; original above, small fields below'];
    for (const { id: look } of DUNGEON_STYLES.filter(entry => dungeonStyle(entry.id).direction === 'stone')) {
      for (const monochrome of [false, true]) {
        const model = emptyModel(71);
        addRoom(model.floors[0]!, { x: 0, y: 0, w: 21, h: 4 });
        model.floors[0]!.terrain = KINDS.map((kind, id) => ({ id, ...draft(kind, 0, box(1 + id * 4, 1, 2, 2)) }));
        const render = (original: boolean): OffscreenCanvas => {
          const canvas = new OffscreenCanvas(21 * 150, 4 * 150);
          const ctx = canvas.getContext('2d')!;
          const view = { ...DEFAULT_VIEW, monochrome };
          const env = createRenderEnv(ctx, visibleDungeon(model, view), dungeonStyle(look), view, 150);
          ctx.scale(150, 150);
          const scene = buildArtScene(env, { originCell: { x: 0, y: 0 }, widthPx: canvas.width, heightPx: canvas.height, pxPerCell: 150 }, [], false);
          const colours = stoneColours(env.palette, monochrome);
          const hand = stoneHand(scene, colours);
          hand.surface(path => path.rect(0, 0, 21, 4), 'floor');
          // The original closures still hold the raster scene. Only the additive wrapper sees
          // this non-raster marker, so it delegates to those unchanged closures for comparison.
          const originalHand = { ...hand, scene: { ...scene, raster: false } };
          drawTerrainGround(original ? originalHand : hand, { water: colours.water, cloth: colours.cloth });
          return canvas;
        };
        const original = render(true);
        const small = render(false);
        for (const [index, kind] of KINDS.entries()) {
          const x = (1 + index * 4) * 150;
          const before = original.getContext('2d')!.getImageData(x, 150, 300, 300).data;
          const after = small.getContext('2d')!.getImageData(x, 150, 300, 300).data;
          let difference = 0;
          for (let i = 0; i < before.length; i++) if (i % 4 !== 3) difference += Math.abs(before[i]! - after[i]!);
          const mean = difference / (before.length * 0.75);
          report.push(`${look}\t${monochrome}\t${kind}\t${mean.toFixed(4)}`);
          expect(mean, `${look} ${kind} monochrome=${monochrome}`).toBeLessThan(1.5);
        }
        const paired = new OffscreenCanvas(original.width, original.height * 2);
        paired.getContext('2d')!.drawImage(original, 0, 0);
        paired.getContext('2d')!.drawImage(small, 0, original.height);
        await savePng(paired, `glyph-sheets/caveCover/fields-${look}${monochrome ? '-mono' : ''}`);
      }
    }
    await commands.writeFile(`${ROOT}/field-comparison.txt`, `${report.join('\n')}\n`);
  });

  it('draws each cave cover cell within twice the slowest reference prop', async () => {
    const rows = ['painter\tkind\tms per 200 cells\tlimit'];
    const failures: string[] = [];
    for (const look of ['parchment', 'print']) {
      const canvas = new OffscreenCanvas(750, 750);
      const ctx = canvas.getContext('2d')!;
      const model = emptyModel(71);
      addRoom(model.floors[0]!, { x: 0, y: 0, w: 5, h: 5 });
      const env = createRenderEnv(ctx, visibleDungeon(model, DEFAULT_VIEW), dungeonStyle(look), DEFAULT_VIEW, 150);
      ctx.scale(150, 150);
      const scene = buildArtScene(env, { originCell: { x: 0, y: 0 }, widthPx: 750, heightPx: 750, pxPerCell: 150 }, [], false);
      const colours = stoneColours(env.palette, false);
      const pens = pensOf(scene);
      const hand = look === 'parchment' ? stoneHand(scene, colours) : engravedHand(scene, pens);
      const water = look === 'parchment' ? colours.water : pens.water;
      const cloth = look === 'parchment' ? colours.cloth : pens.floor;
      const measure = (draw: () => void): number => {
        const times: number[] = [];
        for (let run = 0; run < 5; run++) {
          const start = performance.now();
          for (let k = 0; k < 200; k++) draw();
          ctx.getImageData(0, 0, 1, 1);
          times.push(performance.now() - start);
        }
        return times.sort((a, b) => a - b)[2]!;
      };
      const reference = (['fountain', 'well', 'statue'] as const).map(kind => measure(() => drawGlyph(hand, { x: 2.5, y: 2.5, rotation: 0, scale: 1, fit: glyphFit({ kind, scale: 1 }) }, PROP_GLYPHS[kind]!, water, cloth)));
      const limit = 2 * Math.max(...reference);
      for (const kind of KINDS) {
        model.floors[0]!.terrain = [{ id: 0, ...draft(kind, 0, [{ x: 2, y: 2 }]) }];
        const cost = measure(() => drawTerrainGround(hand, { water, cloth }));
        rows.push(`${env.style.direction}\t${kind}\t${cost.toFixed(2)}\t${limit.toFixed(2)}`);
        if (cost > limit) failures.push(`${look} ${kind}: ${cost.toFixed(2)} > ${limit.toFixed(2)}`);
      }
    }
    await commands.writeFile('out/perf-glyph/caveCover.txt', `${rows.join('\n')}\n`);
    expect(failures).toEqual([]);
  });
}
