import type { GlyphSpecimen } from './types';

const QUARTER = Math.PI / 2;
const KINDS = ['statue', 'fountain', 'well', 'dais'] as const;

/** The first props that stay, the quality every family is held to, as the families' sheets show them. */
export const SPECIMEN: GlyphSpecimen = {
  family: 'reference',
  pieces: KINDS.flatMap(kind => [0, QUARTER].map(rotation => ({ kind, rotation, ...(kind === 'dais' && { against: 'wall' as const }) }))),
  crowded: [
    // An empty dais at the wall, a statue and a well beside it.
    { kind: 'dais', rotation: 0, against: 'wall', at: { x: 1.5, y: 2 } },
    { kind: 'statue', rotation: 0, at: { x: 4.3, y: 1.55 } },
    { kind: 'well', rotation: 0, at: { x: 5.4, y: 1.0 } },
  ],
};
