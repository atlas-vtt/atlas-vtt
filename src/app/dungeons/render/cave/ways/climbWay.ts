import type { DungeonDoor } from '../../../model';
import type { Hand } from '../../art/hand';
import { hash2 } from '../../art/noise';
import { polyPath } from '../../art/paths';
import { pinchFrame } from './pinch';
import { rope } from './rope';
import { OPENING_RADIUS, roundMouth } from './shaftMouth';
import { drawShaftDown, ringMiddle } from './shafts';
import { clipped, clipToFloor, doorsOfWay } from './wayDoors';

/** A shaft's mouth in a climb's cell, in cells across its middle: inside the cell, so it never meets the narrows' shoulders. */
const RADIUS = 0.4;
/** How far into the upper side the rope is tied, in cells from the door cell's middle: within half a cell of it. */
const TIE = 0.78;

/** The seed of a climb's mouth: its cell's own, so one climb's rock never moves when another changes. */
function seedOf(hand: Hand, door: DungeonDoor): number {
  return Math.floor(hash2(door.x, door.y, hand.scene.env.dungeon.model.seed + 17) * 0x7fffffff);
}

/**
 * A climb within a floor (a pitch or a chimney of ten or twenty feet in a passage): the shaft's
 * mouth a pitch between floors has, round in the door cell and as much narrower for a chimney or a
 * squeeze as a hole in a chamber's floor is, and a rope tied on the upper side going over its near
 * lip and down into it. From the lower side the same mouth reads as the way up the rope hangs in.
 * It is drawn within the floor: a door cell's walls may wander a fifth of a cell into it, and a
 * mouth drawn over their ink would hide the walls the scene puts there.
 */
export function drawClimbs(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'climb')) {
    const { at } = pinchFrame(door);
    const radius = RADIUS * (OPENING_RADIUS[door.drop?.kind ?? 'shaft'] / OPENING_RADIUS.shaft);
    const mouth = roundMouth(at(0, 0), radius, seedOf(hand, door));
    // The frame runs from `from` towards `to`: the upper side is `from` where the way descends.
    const up = door.descends ? -1 : 1;
    const lip = at(0.02, up * radius * 0.92);
    clipped(hand, clipToFloor, () =>
      drawShaftDown(hand, mouth, () => {
        const tie = up * TIE;
        const anchor = [at(-0.13, tie - 0.08), at(0.07, tie - 0.07), at(0.12, tie + 0.03), at(-0.02, tie + 0.09), at(-0.15, tie + 0.02)];
        hand.fill(polyPath(anchor), 'rock');
        hand.line([anchor], 'outline', true);
        const shelf = ringMiddle(mouth.rings[2]!);
        rope(hand, [at(-0.1, tie - 0.03), at(-0.05, tie + 0.05), at(0.05, tie + 0.04), at(0.06, tie - 0.04), at(-0.03, tie - up * 0.12), lip, { x: lip.x * 0.2 + shelf.x * 0.8, y: lip.y * 0.2 + shelf.y * 0.8 }]);
      }, lip),
    );
  }
}
