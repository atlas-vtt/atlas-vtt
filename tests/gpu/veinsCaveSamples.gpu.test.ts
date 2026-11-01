import { describe, it } from 'vitest';
import { commands } from 'vitest/browser';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { floorLetter } from '../../src/app/dungeons/scene/roomKeys';
import { dungeonNote, noteRooms } from '../../src/app/dungeons/scene/toNote';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { savePng } from './dungeonRenderHarness';

/**
 * Whole caverns as the Veins of the Earth rules make them, for a person to judge by eye: each
 * drawn at 100 px a cell in Stone & shadow (parchment), with its note as the scene would get it
 * and a summary of its rooms, ways and terrain beside it, all written to `out/veins-samples/` as
 * `full-<name>`. They take a while and judge nothing, so they are drawn only when asked for:
 * `VITE_VEINS_SAMPLES=1`.
 */

const OUT = 'out/veins-samples';
const PX = 100;

interface Sample {
  name: string;
  request: DungeonRequest;
  /** The floors drawn, by index. */
  floors: number[];
}

const SAMPLES: readonly Sample[] = [
  { name: 'untagged-285084', request: { seed: 285084, theme: 'cavern', tags: [], floors: 1 }, floors: [0] },
  { name: 'large-wet-11', request: { seed: 11, theme: 'cavern', tags: ['large', 'wet'], floors: 2 }, floors: [0, 1] },
  { name: 'small-cramped-winding-42', request: { seed: 42, theme: 'cavern', tags: ['small', 'cramped', 'winding'], floors: 1 }, floors: [0] },
  { name: 'medium-flooded-deep-7', request: { seed: 7, theme: 'cavern', tags: ['medium', 'flooded', 'deep'], floors: 3 }, floors: [0, 2] },
  // One cave of each formation the tags name: sulphuric, fungal, a burrow, a fault.
  { name: 'sulphuric-acid-3', request: { seed: 3, theme: 'cavern', tags: ['acid'], floors: 1 }, floors: [0] },
  { name: 'fungal-overgrown-3', request: { seed: 3, theme: 'cavern', tags: ['overgrown'], floors: 1 }, floors: [0] },
  { name: 'burrow-string-3', request: { seed: 3, theme: 'cavern', tags: ['string'], floors: 1 }, floors: [0] },
  { name: 'fault-dry-crumbling-3', request: { seed: 3, theme: 'cavern', tags: ['dry', 'crumbling'], floors: 1 }, floors: [0] },
];

/** What a summary says of each floor: its rooms, its doors and the terrain of each room. */
function summary(model: DungeonModel): unknown {
  return {
    seed: model.seed,
    formation: model.cave?.variant ?? null,
    character: model.cave?.character ?? null,
    floors: model.floors.map((floor, index) => ({
      floor: floorLetter(index),
      rooms: floor.rooms.map((room) => ({
        id: room.id,
        kind: room.kind,
        tier: room.tier ?? null,
        size: `${room.w}×${room.h}`,
        up: room.vertical?.up ?? [],
        down: room.vertical?.down ?? [],
        terrain: [...new Set(floor.terrain.filter((piece) => piece.room === room.id).map((piece) => piece.kind))],
      })),
      doors: floor.doors.map((door) => ({ from: door.from, to: door.to, kind: door.kind, way: door.way ?? null, width: door.width ?? null, wide: Boolean(door.wide) })),
    })),
  };
}

describe.skipIf((import.meta.env as Record<string, string | undefined>).VITE_VEINS_SAMPLES !== '1')('whole caverns, for judging by eye', () => {
  for (const sample of SAMPLES) {
    it(`draws ${sample.name}`, async () => {
      const model = generateDungeon(sample.request);
      const layout = mapLayout(model, PX, DEFAULT_VIEW);
      for (const floor of sample.floors) {
        const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
        renderMap(canvas.getContext('2d')!, model, dungeonStyle('parchment'), DEFAULT_VIEW, { pxPerCell: PX, floor });
        await savePng(canvas, `full-${sample.name}-${floorLetter(floor)}`, OUT);
      }
      const levels = model.floors.length > 1 ? model.floors.map((_, index) => floorLetter(index)) : null;
      const rooms = noteRooms(model, DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: PX }, levels);
      await commands.writeFile(`${OUT}/full-${sample.name}.md`, dungeonNote(sample.name, rooms, model));
      await commands.writeFile(`${OUT}/full-${sample.name}.json`, `${JSON.stringify(summary(model), null, 2)}\n`);
    });
  }
});
