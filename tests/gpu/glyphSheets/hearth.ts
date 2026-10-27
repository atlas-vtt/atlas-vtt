import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import type { GlyphSpecimen } from './types';

/** A Fortress where people live: its hearths burn. */
let lived: DungeonModel | undefined;
const livedIn = (): DungeonModel => (lived ??= generateDungeon({ seed: 11, theme: 'fortress', tags: ['inhabited'], floors: 1 }));

/** Six by four cells round the lived-in Fortress's first hearth. */
function aroundHearth(): { x: number; y: number; cells: number; rows: number } {
  const hearth = livedIn().floors[0]!.props.find(p => p.kind === 'hearth')!;
  return { x: Math.round(hearth.x - 3), y: Math.round(hearth.y - 2), cells: 6, rows: 4 };
}

/** A cold fireplace built into a wall, turned both ways, and two of them along one wall; and one burning where people live. */
export const SPECIMEN: GlyphSpecimen = {
  family: 'hearth',
  pieces: [0, Math.PI / 2].map(rotation => ({ kind: 'hearth', rotation, against: 'wall' as const })),
  // Cell pieces use their actual row: marking them against a wall discards at.y when the harness calculates group depth.
  crowded: [
    { kind: 'hearth', rotation: 0, at: { x: 0, y: 1 } },
    { kind: 'hearth', rotation: 0, at: { x: 3, y: 1 } },
  ],
  scenes: [{ name: 'lit', model: livedIn, floor: 0, get window() { return aroundHearth(); } }],
};
