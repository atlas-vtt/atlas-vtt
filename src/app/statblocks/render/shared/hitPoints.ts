import { isHitPointsKey } from '../../../resources/resourceFields';

/** Marks the element that holds a creature's hit points; `attachDiceRolling` sends its hit dice to the hit point roll. */
export type HitPointsAttribute = { 'data-hit-points'?: '' };

/** Whether any of these keys or labels names hit points ("hp", "Hit Points:", "Health"). */
export function namesHitPoints(...names: ReadonlyArray<string | undefined>): boolean {
  return names.some((name) => name !== undefined && isHitPointsKey(name));
}

/** The attribute to spread onto an element when it holds hit points, else nothing. */
export function hitPointsAttribute(holdsHitPoints: boolean): HitPointsAttribute {
  return holdsHitPoints ? { 'data-hit-points': '' } : {};
}
