/**
 * Which way a dungeon's floors stack. Floors keep their planning order (index 0 is the entrance
 * floor, each next one farther from it); the stack says where each lies: below the last in a
 * Cavern, above it in a Fortress or Haunted Mansion, and a house's cellar (`below`, the last
 * indices) under its entrance floor. Every "is this floor below that one" asks here.
 */

import type { DungeonModel } from '../model';
import { THEMES } from '../themes/themes';
import { THEME_IDS, type ThemeId } from '../themes/themeTypes';
import type { StairEnd } from './stairSpots';

/** Where each next floor lies: above the entrance floor (`up`) or below it (`down`). */
export type FloorRise = 'up' | 'down';

export interface FloorStack {
  readonly rise: FloorRise;
  readonly count: number;
  /** In a rising stack, how many of the last floors lie under the entrance floor, each below the one before: a house's cellar. */
  readonly below: number;
}

export function floorStack(rise: FloorRise, count: number, below = 0): FloorStack {
  return { rise, count, below: rise === 'up' ? Math.max(0, Math.min(below, count - 1)) : 0 };
}

/** A model's stack, from its theme; a model without one (an older export) or with one this version does not know goes down. */
export function stackOf(model: Pick<DungeonModel, 'floors'> & { theme?: ThemeId; below?: number }): FloorStack {
  const known = (THEME_IDS as readonly unknown[]).includes(model.theme);
  return floorStack(known ? THEMES[model.theme as ThemeId].rise : 'down', model.floors.length, model.below ?? 0);
}

/** Where a floor lies, in floors from the entrance floor: up positive, down negative. */
export function levelOf(stack: FloorStack, floor: number): number {
  if (stack.rise === 'down') return 0 - floor;
  const storeys = stack.count - stack.below;
  return floor < storeys ? floor : storeys - 1 - floor;
}

function floorAt(stack: FloorStack, level: number): number | null {
  for (let floor = 0; floor < stack.count; floor++) if (levelOf(stack, floor) === level) return floor;
  return null;
}

/** The floor physically under `floor`, or null where none lies there. */
export function floorBelow(stack: FloorStack, floor: number): number | null {
  return floorAt(stack, levelOf(stack, floor) - 1);
}

/** The floor physically over `floor`, or null where none lies there. */
export function floorAbove(stack: FloorStack, floor: number): number | null {
  return floorAt(stack, levelOf(stack, floor) + 1);
}

/** Whether floor `a` lies above floor `b`. */
export function isAbove(stack: FloorStack, a: number, b: number): boolean {
  return levelOf(stack, a) > levelOf(stack, b);
}

/** The end of a stairwell on `floor` that leads to `to`: its upper end where `floor` lies above. */
export function stairEnd(stack: FloorStack, floor: number, to: number): StairEnd {
  return isAbove(stack, floor, to) ? 'upper' : 'lower';
}

/** The floors from the top of the stack to its bottom. */
export function topDown(stack: FloorStack): number[] {
  return Array.from({ length: stack.count }, (_, k) => k).sort((a, b) => levelOf(stack, b) - levelOf(stack, a));
}

/** The floors from the bottom of the stack to its top. */
export function bottomUp(stack: FloorStack): number[] {
  return topDown(stack).reverse();
}

/** A floor's elevation in game units, `height` a floor, the entrance floor from 0 to `height`. */
export function levelElevation(stack: FloorStack, floor: number, height: number): { bottom: number; top: number } {
  // + 0 writes the entrance floor of a Cavern as 0, not −0.
  const bottom = levelOf(stack, floor) * height + 0;
  return { bottom, top: bottom + height };
}

/** The water level a floor floods to: a cave's every floor, a building's lowest alone (water does not stand upstairs). */
export function floorWaterLevel(stack: FloorStack, floor: number, level: number): number {
  return stack.rise === 'down' || floorBelow(stack, floor) === null ? level : 0;
}
