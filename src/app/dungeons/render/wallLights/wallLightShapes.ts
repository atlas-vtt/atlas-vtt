import type { Vec } from '../geometry';

/**
 * The lights a lived-in dungeon hangs on its walls, and where each one's flame burns. Only numbers:
 * the placement (`wallLightSites.ts`), the scene's lights and the drawings all read them, and the
 * generator's worker never loads a drawing.
 */

/** A Fortress torch in an iron bracket, a Haunted Mansion's candle sconce, a torch wedged into a cave's rock, a brazier standing on a cave's floor. */
export type WallLightKind = 'bracket' | 'sconce' | 'cave-torch' | 'brazier';

/**
 * Where a light's flame burns in its drawing's own cells: a wall light's wall runs along
 * `y = OFF_WALL` (0.1) behind it and the room lies towards −y; a brazier stands round its centre.
 * The scene's light stands there, in the open before the wall's face, so the wall stops its back half.
 */
export const FLAME: Readonly<Record<WallLightKind, Vec>> = {
  bracket: { x: 0, y: -0.17 },
  // Between the sconce's two candles.
  sconce: { x: 0, y: -0.075 },
  'cave-torch': { x: 0.055, y: -0.17 },
  brazier: { x: 0, y: 0 },
};

/** Half the width of each kind's flame, in cells: what the scene's light takes for its source. */
export const FLAME_RADIUS: Readonly<Record<WallLightKind, number>> = { bracket: 0.06, sconce: 0.05, 'cave-torch': 0.06, brazier: 0.12 };

/** A brazier's iron bowl, in cells. */
export const BRAZIER_RADIUS = 0.26;
