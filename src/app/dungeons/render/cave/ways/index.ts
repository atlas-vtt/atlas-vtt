import type { CaveWayDraw, CaveWayPart } from '../caveArt';
import { drawBreakdowns } from './breakdownWay';
import { drawClimbs } from './climbWay';
import { drawCrawls } from './crawl';
import { drawLetterboxes } from './letterbox';
import { drawLowWays } from './lowWay';
import { drawNarrows } from './narrows';
import { drawScree } from './scree';
import { drawAvens, drawPitches } from './shafts';
import { drawSqueezes } from './squeeze';
import { drawSumps } from './sumpWay';
import { drawTraverses } from './traverseWay';

/** Natural cave ways, drawn through each look's hand in map coordinates. */
export const CAVE_WAYS: Partial<Record<CaveWayPart, CaveWayDraw>> = {
  narrows: drawNarrows,
  crawl: drawCrawls,
  pitch: drawPitches,
  aven: drawAvens,
  scree: drawScree,
  lowWay: drawLowWays,
  squeeze: drawSqueezes,
  letterbox: drawLetterboxes,
  sumpWay: drawSumps,
  traverseWay: drawTraverses,
  breakdownWay: drawBreakdowns,
  climbWay: drawClimbs,
};
