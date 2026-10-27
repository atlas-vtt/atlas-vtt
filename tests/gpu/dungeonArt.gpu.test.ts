import { describe, it } from 'vitest';
import { DEFAULT_VIEW, type DungeonView } from '../../src/app/dungeons/style';
import { DUNGEON_STYLES, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { ART_DUNGEONS, ART_SPOTS, GROWTH_SPOTS, artModel, drawClose, drawWhole } from './dungeonArtSheets';
import { savePng } from './dungeonRenderHarness';
import { specimen } from './dungeonArtSpecimen';
import { DEFAULT_PX_PER_CELL, mapLayout, suggestedPxPerCell } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { renderThumbnail } from '../../src/app/dungeons/render/thumbnail';

/** The dungeon the gallery's cards are judged on. */
const CARD_DUNGEON = 'crumbling';

/**
 * Every look on dungeons of every kind, whole and close up at 200 px per cell with tokens, written
 * to `out/dungeon-render/v2-art/` for judging by eye, when asked for: `VITE_ART=1` draws them all,
 * `VITE_ART_LOOK`, `VITE_ART_DUNGEON` and `VITE_ART_SHOT` (whole, close, mono, card, specimen,
 * spots, growth, scene) narrow a run while iterating.
 */

const only = (key: string): string[] | null => {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return value ? value.split(',') : null;
};
const looks = only('VITE_ART_LOOK');
const dungeons = only('VITE_ART_DUNGEON');
const shots = only('VITE_ART_SHOT') ?? ['whole', 'close'];
/** The sheets take minutes and are for a person: they are drawn only when asked for. */
const asked = Boolean(looks ?? dungeons ?? only('VITE_ART_SHOT') ?? only('VITE_ART'));

describe.skipIf(!asked)('dungeon looks, for judging by eye', () => {
  for (const { id } of DUNGEON_STYLES) {
    if (looks && !looks.includes(id)) continue;
    for (const { name } of ART_DUNGEONS) {
      // A family names every dungeon of it: `cavern` draws `cavern-lava` and its kin.
      if (dungeons && !dungeons.some((d) => name === d || name.startsWith(`${d}-`))) continue;
      it(`${id} ${name}`, async () => {
        const model = artModel(name);
        const views: [string, DungeonView][] = [['', DEFAULT_VIEW]];
        if (shots.includes('mono')) views.push(['-mono', { ...DEFAULT_VIEW, monochrome: true }]);
        for (const [suffix, view] of views) {
          for (let floor = 0; floor < model.floors.length; floor++) {
            const f = model.floors.length > 1 ? `-f${floor}` : '';
            if (shots.includes('whole')) await savePng(drawWhole(model, id as DungeonStyleId, view, floor), `v2-art/${id}-${name}${f}${suffix}`);
            if (shots.includes('close')) await savePng(drawClose(model, id as DungeonStyleId, view, floor), `v2-art/${id}-${name}${f}${suffix}-close`);
          }
        }
      });
    }
    if (shots.includes('card')) {
      it(`${id} card`, async () => {
        // A style card as the gallery draws it: 104 × 78 points at a device pixel ratio of 2.
        const canvas = new OffscreenCanvas(208, 156);
        renderThumbnail(canvas.getContext('2d')!, artModel(CARD_DUNGEON), dungeonStyle(id), DEFAULT_VIEW, { width: 208, height: 156, legibleAt: 2 });
        await savePng(canvas, `v2-art/card-${id}`);
      });
    }
    if (shots.includes('specimen')) {
      it(`${id} specimen`, async () => {
        const model = specimen();
        const layout = mapLayout(model, 120, DEFAULT_VIEW);
        for (const [floor, openings] of [[0, 'cut'], [0, 'drawn'], [1, 'cut']] as const) {
          const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
          renderMap(canvas.getContext('2d')!, model, dungeonStyle(id), DEFAULT_VIEW, { pxPerCell: 120, floor, openings });
          await savePng(canvas, `v2-art/specimen-${id}-f${floor}-${openings}`);
        }
      });
    }
    if (shots.includes('scene')) {
      it(`${id} vegetation at a scene's resolution`, async () => {
        // As a created scene draws it: 400 px a cell, whole (written reduced) and a window with tokens.
        for (const name of ['overgrown-fortress', 'overgrown-cavern', 'overgrown-mansion', 'overgrown-halls']) {
          // A family names every dungeon of it: `cavern` draws `cavern-lava` and its kin.
      if (dungeons && !dungeons.some((d) => name === d || name.startsWith(`${d}-`))) continue;
          const model = artModel(name);
          const pxPerCell = suggestedPxPerCell(model);
          const layout = mapLayout(model, pxPerCell, DEFAULT_VIEW);
          const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
          renderMap(canvas.getContext('2d')!, model, dungeonStyle(id), DEFAULT_VIEW, { pxPerCell });
          await savePng(canvas, `v2-art/scene-${id}-${name}`);
          await savePng(drawClose(model, id as DungeonStyleId, DEFAULT_VIEW, 0, 8, 5, true, undefined, DEFAULT_PX_PER_CELL), `v2-art/scene-${id}-${name}-close`);
        }
      });
    }
    if (shots.includes('growth')) {
      it(`${id} vegetation`, async () => {
        for (const spot of GROWTH_SPOTS) {
          const canvas = drawClose(artModel(spot.dungeon), id as DungeonStyleId, DEFAULT_VIEW, 0, 6, 4, false, spot.centre);
          await savePng(canvas, `v2-art/growth-${id}-${spot.name}`);
        }
      });
    }
    if (shots.includes('spots')) {
      it(`${id} terrain spots`, async () => {
        for (const spot of ART_SPOTS) {
          const canvas = drawClose(artModel(spot.dungeon), id as DungeonStyleId, DEFAULT_VIEW, spot.floor, spot.cells ?? 10, spot.rows ?? 7, false, spot.centre);
          await savePng(canvas, `v2-art/spot-${id}-${spot.name}`);
        }
      });
    }
  }
});
