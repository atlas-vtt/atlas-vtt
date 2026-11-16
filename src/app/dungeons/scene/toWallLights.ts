import type { LightEmission, LightKind, LightSource } from '../../types/lightingTypes';
import type { VisibleDungeon } from '../render/visibleDungeon';
import { wallLightsOf } from '../render/wallLights/wallLightSites';
import { FLAME_RADIUS, type WallLightKind } from '../render/wallLights/wallLightShapes';
import type { DungeonStyle, DungeonView } from '../style';
import { cellsToUnits, squaresToUnits, type SceneUnit } from './gameUnits';
import { lavaColours } from './liquidColours';
import type { DungeonPlacement } from './toWalls';

/**
 * The lights of a lived-in floor's wall lights (`wallLightsOf`): one at every flame the map draws,
 * just before its wall's face, so it stands in the open and its wall stops the back half of it.
 */

/**
 * How far each lights, in grid squares: less than a torch carried (20 ft bright, 40 ft dim), as a
 * torch in a bracket lights the wall it hangs on and the floor below it; a sconce's two candles
 * a little more than one candle (5 ft bright, 10 ft dim); a brazier a cave chamber round it.
 */
const REACH: Readonly<Record<WallLightKind, { bright: number; dim: number }>> = {
  bracket: { bright: 1, dim: 4 },
  'cave-torch': { bright: 1, dim: 4 },
  sconce: { bright: 1, dim: 3 },
  brazier: { bright: 2, dim: 5 },
};
/** A torch's and a brazier's flame, as Atlas's torch presets give it; candles a paler yellow, as its candle presets do. */
const LOOK: Readonly<Record<WallLightKind, { color: string; animation: LightEmission['animation']; kind: LightKind }>> = {
  bracket: { color: '#ff9a3c', animation: 'torch', kind: 'torch' },
  'cave-torch': { color: '#ff9a3c', animation: 'torch', kind: 'torch' },
  brazier: { color: '#ff9038', animation: 'torch', kind: 'torch' },
  sconce: { color: '#ffb347', animation: 'candle', kind: 'candle' },
};

/** A wall light's beam, in degrees: the room's half before its wall and a little of the wall's face either side. */
const WALL_BEAM = 200;

/** A drawing's turn in radians as a light's rotation: degrees, 0 facing up, turning clockwise. */
function degrees(radians: number): number {
  return (((Math.round((radians * 180) / Math.PI) % 360) + 360) % 360);
}

/**
 * The light of each wall light on the floor, ranges in the collection's units (`unit`); none where
 * the dungeon is not lived in. A look without colour of its own (Engraved, Monochrome) lights them
 * in its own light pigment, as it does its fires.
 */
export function floorWallLights(
  dungeon: VisibleDungeon,
  style: DungeonStyle,
  view: DungeonView,
  placement: DungeonPlacement,
  unit: SceneUnit,
  id: string,
  level?: string,
): Record<string, LightSource> {
  const lit = wallLightsOf(dungeon);
  if (lit.length === 0) return {};
  const pigment = style.direction === 'engraved' || view.monochrome ? lavaColours(style, view).glint : undefined;
  const { originCell, pxPerCell } = placement;
  const lights: Record<string, LightSource> = {};
  lit.forEach((light, index) => {
    const lightId = `light_${id}_wall_${index + 1}`;
    const reach = REACH[light.kind];
    const look = LOOK[light.kind];
    lights[lightId] = {
      id: lightId,
      kind: 'light',
      x: (light.flame.x - originCell.x) * pxPerCell,
      y: (light.flame.y - originCell.y) * pxPerCell,
      emission: {
        bright: squaresToUnits(reach.bright, unit),
        dim: squaresToUnits(reach.dim, unit),
        color: pigment ?? look.color,
        intensity: 1,
        animation: look.animation,
        sourceRadius: cellsToUnits(FLAME_RADIUS[light.kind], view, unit),
        kind: look.kind,
        // The wall behind stops the back half: a beam a little wider than the room's half, so the light
        // still runs along the wall's face, and the engine traces nothing it would only wall in.
        ...(light.kind !== 'brazier' && { angle: WALL_BEAM }),
      },
      ...(light.kind !== 'brazier' && { rotation: degrees(light.rotation) }),
      ...(level && { levels: [level] }),
    };
  });
  return lights;
}
