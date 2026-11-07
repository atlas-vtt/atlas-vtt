import type { CaveGroundPainting, CaveGroundPart } from '../caveArt';
import { engravedEdge, stoneEdge } from './edge';
import { engravedFloor, stoneFloor } from './floor';
import { engravedSurround, stoneSurround } from './surround';
import { engravedWayOut, stoneWayOut } from '../mouth/wayOutGround';

/** Natural rock, painted or engraved in the look's own materials and line weights. */
export const CAVE_GROUND: Partial<Record<CaveGroundPart, CaveGroundPainting>> = {
  floor: { stone: stoneFloor, engraved: engravedFloor },
  edge: { stone: stoneEdge, engraved: engravedEdge },
  surround: { stone: stoneSurround, engraved: engravedSurround },
  mouth: { stone: stoneWayOut, engraved: engravedWayOut },
};
