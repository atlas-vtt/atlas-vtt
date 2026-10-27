/**
 * The cave art registry: what a Cavern's floor is drawn with in place of a built floor's flagstones,
 * walls, dressed rock and doors. The painters ask it on a cave floor only; a part nobody has drawn
 * yet falls to today's drawing, and its id stays in `awaitingDrawings.json`, so no build ships a
 * cave in flagstones. The art plan's cave families fill `ground/` and `ways/` and never this file.
 */

import type { ArtScene } from '../art/artScene';
import type { Hand } from '../art/hand';
import type { Pens } from '../engraved/pens';
import type { RenderEnv } from '../renderEnv';
import type { StoneColours } from '../stone/colours';
import { CAVE_GROUND } from './ground';
import { CAVE_WAYS } from './ways';

const GROUND_PARTS = ['floor', 'edge', 'surround', 'mouth'] as const;
const WAY_PARTS = ['narrows', 'crawl', 'pitch', 'aven', 'scree'] as const;
export const CAVE_PARTS = [...GROUND_PARTS, ...WAY_PARTS] as const;
export type CavePart = (typeof CAVE_PARTS)[number];
export type CaveGroundPart = (typeof GROUND_PARTS)[number];
export type CaveWayPart = (typeof WAY_PARTS)[number];

/** A painter-level drawing of a cave: one per painter, as `drawFloor` and the walls are. */
export interface CaveGroundPainting {
  stone: (scene: ArtScene, c: StoneColours) => void;
  engraved: (scene: ArtScene, pens: Pens) => void;
}

/** Draws every way of its part on the floor on show, through the painter's hand, as `drawPassages` does. */
export type CaveWayDraw = (hand: Hand) => void;

/** Whether the floor on show is a cave's. */
export function onCaveFloor(env: RenderEnv): boolean {
  return env.dungeon.floor.cave !== undefined;
}

/** The drawing of a cave's ground part on a cave floor; undefined elsewhere or while undrawn. */
export function caveGround(part: CaveGroundPart, env?: RenderEnv): CaveGroundPainting | undefined {
  return env && !onCaveFloor(env) ? undefined : CAVE_GROUND[part];
}

/** The drawing of a cave's ways of a part on a cave floor; undefined elsewhere or while undrawn. */
export function caveWay(part: CaveWayPart, env?: RenderEnv): CaveWayDraw | undefined {
  return env && !onCaveFloor(env) ? undefined : CAVE_WAYS[part];
}

/** The parts with a drawing. */
export function drawnCaveParts(): CavePart[] {
  return [...GROUND_PARTS.filter((part) => CAVE_GROUND[part] !== undefined), ...WAY_PARTS.filter((part) => CAVE_WAYS[part] !== undefined)];
}

/** Whether a rock surround of this look is built (dressed blocks, a course of bricks), which a cave draws as its own rock instead. */
export function builtSurround(env: RenderEnv): boolean {
  const { mode } = env.style.surround;
  return mode === 'stonework' || mode === 'bricks';
}
