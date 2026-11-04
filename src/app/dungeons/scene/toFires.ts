import type { LightEmission, LightSource } from '../../types/lightingTypes';
import { fireSites, firesLit, type FireSite } from '../render/fireSites';
import { propsAsDrawn } from '../render/propsAsDrawn';
import type { VisibleDungeon } from '../render/visibleDungeon';
import type { DungeonStyle, DungeonView } from '../style';
import { cellsToUnits, squaresToUnits, type SceneUnit } from './gameUnits';
import { lavaColours } from './liquidColours';
import type { DungeonPlacement } from './toWalls';

/**
 * The lights of a lived-in floor's fires (`firesLit`): one in every fireplace and fire pit the map
 * draws burning. A fireplace shines out of its mouth in a beam as wide as the mouth is seen from the
 * fire (`FireSite.opening`), its cheeks bounding it; a fire pit burns in the open, all around.
 */

/**
 * How far a fire lights, in grid squares: a fire pit as far as a torch (20 ft bright, 40 ft dim), a
 * fireplace less, its fire smaller and down in a recess, brightly only near the hearth (10 ft) and
 * dimly across a room (30 ft).
 */
const REACH = { pit: { bright: 4, dim: 8 }, fireplace: { bright: 2, dim: 6 } } as const;
/** A wood fire's light, a little redder than a torch's. */
const FIRE_COLOUR = '#ff9038';

/**
 * The light of each fire on the floor, ranges in the collection's units (`unit`) and the flame as
 * wide as the fire is drawn; none where the dungeon is not lived in. A look without colour of its
 * own (Engraved, Monochrome) lights its fires as its lava glows, in its own light pigment.
 */
export function floorFires(
  dungeon: VisibleDungeon,
  style: DungeonStyle,
  view: DungeonView,
  placement: DungeonPlacement,
  unit: SceneUnit,
  id: string,
  level?: string,
): Record<string, LightSource> {
  if (!firesLit(dungeon.model)) return {};
  const shown = propsAsDrawn(dungeon).filter(prop => dungeon.roomShapes.has(prop.room));
  const color = style.direction === 'engraved' || view.monochrome ? lavaColours(style, view).glint : FIRE_COLOUR;
  const { originCell, pxPerCell } = placement;
  const lights: Record<string, LightSource> = {};
  fireSites(shown, dungeon.floor.walls === 'edges').forEach((site, index) => {
    const lightId = `light_${id}_fire_${index + 1}`;
    lights[lightId] = {
      id: lightId,
      kind: 'light',
      x: (site.at.x - originCell.x) * pxPerCell,
      y: (site.at.y - originCell.y) * pxPerCell,
      emission: emissionOf(site, view, unit, color),
      ...(site.opening && { rotation: degrees(site.opening.rotation) }),
      ...(level && { levels: [level] }),
    };
  });
  return lights;
}

function emissionOf(site: FireSite, view: DungeonView, unit: SceneUnit, color: string): LightEmission {
  const reach = site.opening ? REACH.fireplace : REACH.pit;
  return {
    bright: squaresToUnits(reach.bright, unit),
    dim: squaresToUnits(reach.dim, unit),
    color,
    intensity: 1,
    animation: 'torch',
    sourceRadius: cellsToUnits(site.radius, view, unit),
    // A flame's marker: the torch is the light kind drawn as one.
    kind: 'torch',
    ...(site.opening && { angle: site.opening.angle }),
  };
}

/** A piece's turn in radians as a light's rotation: degrees, 0 facing up, turning clockwise. */
function degrees(radians: number): number {
  return (((Math.round((radians * 180) / Math.PI) % 360) + 360) % 360);
}
