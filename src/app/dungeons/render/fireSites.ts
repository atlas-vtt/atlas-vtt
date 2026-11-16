import type { DungeonModel, DungeonProp } from '../model';
import type { Vec } from './geometry';
import { HEARTH_FIREBOX, STACK_FACE, STACK_FIREBOX, STACK_FIREBOX_OUTLINE, STACK_FUEL } from './props/hearth/shapes';
import { FIRE_AREA } from './props/livedIn/campfire';

/**
 * Where a dungeon's fires burn: in every fireplace and fire pit the map draws, once someone lives
 * there. The map draws them lit (`PropGlyph.lit`) and the scene gives each a light.
 */

/** Whether the dungeon is lived in (the `inhabited` tag): then its fires burn. */
export function firesLit(model: Pick<DungeonModel, 'tags'>): boolean {
  return model.tags.includes('inhabited');
}

export interface FireSite {
  /** Where the fire burns, in cells. */
  at: Vec;
  /** Half the fire's width, in cells. */
  radius: number;
  /**
   * A fireplace's mouth: the way it opens (radians, 0 towards −y, as a piece's rotation) and how
   * wide, in degrees, the opening is seen from the fire. A fire pit burns in the open and has none.
   */
  opening?: { rotation: number; angle: number };
  /**
   * A house's firebox cut into its chimney stack, in cells: four corners, the two of its mouth on
   * the stack's face, then the fire-back's two, in `STACK_FIREBOX_OUTLINE`'s order.
   */
  firebox?: readonly Vec[];
}

/** A fire in a piece's own cells: where it burns, half its width, the half-width of the mouth it shines out of and how far behind the mouth it lies. */
interface LocalFire {
  at: Vec;
  radius: number;
  mouth?: { half: number; depth: number };
}

/** A house's fireplace: in the middle of the firebox cut into the stack, shining out of the mouth on the stack's face. */
const STACK_FIRE: LocalFire = {
  at: { x: 0, y: STACK_FIREBOX.y },
  radius: STACK_FUEL.w / 2,
  mouth: { half: STACK_FIREBOX_OUTLINE[1]!.x, depth: STACK_FIREBOX.y - STACK_FACE },
};
/** A hearth standing out of a wall: in the middle of its firebox, whose front lies open to the room. */
const HEARTH_FIRE: LocalFire = {
  at: { x: HEARTH_FIREBOX.x, y: HEARTH_FIREBOX.y },
  radius: HEARTH_FIREBOX.w / 2 - 0.1,
  mouth: { half: HEARTH_FIREBOX.w / 2, depth: HEARTH_FIREBOX.h / 2 },
};
const PIT_FIRE: LocalFire = { at: { x: FIRE_AREA.x, y: FIRE_AREA.y }, radius: FIRE_AREA.r };

/** Degrees a mouth `half` wide each way is seen across from a fire `depth` behind it. */
function mouthAngle({ half, depth }: { half: number; depth: number }): number {
  return Math.round((2 * Math.atan2(half, depth) * 180) / Math.PI);
}

/** A point of a piece's own cells on the map, as the piece is drawn: turned and scaled about its centre. */
function onMap(prop: DungeonProp, p: Vec): Vec {
  const c = Math.cos(prop.rotation);
  const s = Math.sin(prop.rotation);
  const x = p.x * prop.scale;
  const y = p.y * prop.scale;
  return { x: prop.x + x * c - y * s, y: prop.y + x * s + y * c };
}

function siteOf(prop: DungeonProp, fire: LocalFire, firebox?: readonly Vec[]): FireSite {
  return {
    at: onMap(prop, fire.at),
    radius: fire.radius * prop.scale,
    ...(fire.mouth && { opening: { rotation: prop.rotation, angle: mouthAngle(fire.mouth) } }),
    ...(firebox && { firebox: firebox.map(p => onMap(prop, p)) }),
  };
}

/**
 * The fires of a floor's pieces as the map draws them (`propsAsDrawn`, rooms on show only), on a
 * house's floor (`DungeonFloor.walls === 'edges'`) or elsewhere: every fireplace and fire pit.
 */
export function fireSites(props: readonly DungeonProp[], house: boolean): FireSite[] {
  return props.flatMap((prop): FireSite[] => {
    if (prop.kind === 'campfire') return [siteOf(prop, PIT_FIRE)];
    if (prop.kind !== 'hearth') return [];
    return [house ? siteOf(prop, STACK_FIRE, STACK_FIREBOX_OUTLINE) : siteOf(prop, HEARTH_FIRE)];
  });
}
