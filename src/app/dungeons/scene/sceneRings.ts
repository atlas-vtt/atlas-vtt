import { unionRings } from '../render/clipShapes';
import { shapeRings, type Vec } from '../render/geometry';
import { simplifyRing } from '../render/simplifyRing';
import type { VisibleDungeon } from '../render/visibleDungeon';

/** How far a simplified outline may stray from the drawn one at first, in cells; doubled until it fits. */
const FIRST_TOLERANCE = 0.01;

/**
 * Rings within `limit` corners together: as drawn where they fit, else all simplified alike, as
 * little as it takes. A surface may hold `MAX_LIQUID_CORNERS`, an area light `MAX_AREA_CORNERS`, a
 * map feature `MAX_FEATURE_CORNERS`: fitting a pool's shore to the light's limit drew it as chords
 * far off the painted shore.
 */
export function fitCorners(rings: Vec[][], limit: number): Vec[][] {
  const corners = (fitted: Vec[][]): number => fitted.reduce((sum, ring) => sum + ring.length, 0);
  let fitted = rings;
  for (let tolerance = FIRST_TOLERANCE; corners(fitted) > limit; tolerance *= 2) fitted = rings.map(ring => simplifyRing(ring, tolerance));
  return fitted;
}

const floorRings = new WeakMap<VisibleDungeon, Vec[][]>();

/** The floor's drawn outline in cells, as clipping gives it; worked out once for each floor a scene is built from. */
export function floorRingsOf(dungeon: VisibleDungeon): Vec[][] {
  const kept = floorRings.get(dungeon);
  if (kept) return kept;
  const rings = unionRings(dungeon.floors.flatMap(shape => shapeRings(shape, 0, 100)));
  floorRings.set(dungeon, rings);
  return rings;
}
