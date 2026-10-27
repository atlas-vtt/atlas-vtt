import type { CaveWayDraw, CaveWayPart } from '../caveArt';
import { drawCrawls } from './crawl';
import { drawNarrows } from './narrows';
import { drawScree } from './scree';
import { drawAvens, drawPitches } from './shafts';

/** Natural cave ways, drawn through each look's hand in map coordinates. */
export const CAVE_WAYS: Partial<Record<CaveWayPart, CaveWayDraw>> = {
  narrows: drawNarrows,
  crawl: drawCrawls,
  pitch: drawPitches,
  aven: drawAvens,
  scree: drawScree,
};
