import type { GlyphSpecimen, SpecimenPiece } from './types';

const TURNS = [0, Math.PI / 2];
const pieces: SpecimenPiece[] = TURNS.map(rotation => ({ kind: 'bust', rotation }));

/** Busts line a gallery's wall either side of an empty dais. */
export const SPECIMEN: GlyphSpecimen = {
  family: 'dressing',
  pieces,
  crowded: [
    { kind: 'dais', rotation: 0, against: 'wall', at: { x: 4, y: 2 } },
    { kind: 'bust', rotation: 0, at: { x: 0.4, y: 1.7 } },
    { kind: 'bust', rotation: 0, at: { x: 1.4, y: 1.7 } },
    { kind: 'bust', rotation: 0, at: { x: 6.6, y: 1.7 } },
    { kind: 'bust', rotation: 0, at: { x: 7.6, y: 1.7 } },
  ],
};
