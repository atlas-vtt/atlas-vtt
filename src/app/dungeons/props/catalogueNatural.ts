/**
 * The Cavern's rows of the catalogue: formations nature built (`natural`, kept by a hazard room)
 * and the fire pit of a lived-in cave. Spread into `PROP_SPECS`.
 */

import type { PropSpec } from './catalogue';
import type { PropKind } from './propKinds';

type CavernKind = Extract<PropKind, 'stalagmites' | 'column-formation' | 'flowstone' | 'curtain' | 'crystals' | 'mushrooms' | 'boulder' | 'campfire'>;

export const CAVERN_PROP_SPECS: Readonly<Record<CavernKind, PropSpec>> = {
  stalagmites: { footprint: { along: 1, out: 1 }, clear: 'none', cover: 'half', footing: 'block', natural: true },
  'column-formation': { footprint: { along: 1, out: 1 }, clear: 'none', cover: 'total', footing: 'block', natural: true },
  flowstone: { footprint: { along: 1, out: 0 }, clear: 'none', wallPiece: true, natural: true },
  curtain: { footprint: { along: 1, out: 0 }, clear: 'none', wallPiece: true, natural: true },
  // Against a wall or at a pool's edge (the shore verb).
  crystals: { footprint: { along: 1, out: 1 }, clear: 'front', cover: 'half', footing: 'block', natural: true },
  mushrooms: { footprint: { along: 1, out: 1 }, clear: 'none', footing: 'walk', natural: true },
  boulder: { footprint: { along: 1, out: 1 }, clear: 'none', cover: 'half', footing: 'block', natural: true },
  campfire: { footprint: { along: 1, out: 1 }, clear: 'ring', footing: 'block' },
};
