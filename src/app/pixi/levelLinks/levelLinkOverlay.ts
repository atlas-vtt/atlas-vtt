import type { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { linkHeading } from '../../levels/levelLinks';
import type { FlightEnds } from '../../levels/stairFlights';
import type { LevelLink } from '../../types/sceneLevelTypes';
import type { Point } from '../../types/visionTypes';
import { areaHandlePoint } from '../../vision/polygonArea';
import { PolygonAreaOverlay } from '../areas/PolygonAreaOverlay';
import { MAP_LAYER_Z } from '../mapLayerOrder';

/** Which way stairs lead from the level shown (`linkHeading`). */
export type StairsHeading = ReturnType<typeof linkHeading>;

/** How strongly stairs show while the stairs tool is not in use. */
const RESTING_ALPHA = 0.55;

/** The stairs tool's icon (`StairsIcon`), in screen pixels about the badge's middle. */
const STEPS: readonly [number, number][] = [[3, 20], [8, 20], [8, 15], [13, 15], [13, 10], [18, 10], [18, 5], [21, 5]].map(([x, y]) => [(x! - 12) * 0.55, (y! - 12.5) * 0.55]);

function drawSteps(g: Graphics, at: Point, pixel: number, color: number, alpha: number): void {
  STEPS.forEach(([x, y], index) => (index === 0 ? g.moveTo(at.x + x * pixel, at.y + y * pixel) : g.lineTo(at.x + x * pixel, at.y + y * pixel)));
  g.stroke({ width: 1.6 * pixel, color, alpha, cap: 'round', join: 'round' });
}

/** An arrow up (`dir` -1) or down (1) through the badge's middle, in screen pixels. */
function drawArrow(g: Graphics, at: Point, pixel: number, dir: 1 | -1, color: number, alpha: number): void {
  const tip = { x: at.x, y: at.y + 5 * dir * pixel };
  g.moveTo(at.x, at.y - 5 * dir * pixel).lineTo(tip.x, tip.y);
  g.moveTo(tip.x - 3.5 * pixel, tip.y - 3.5 * dir * pixel).lineTo(tip.x, tip.y).lineTo(tip.x + 3.5 * pixel, tip.y - 3.5 * dir * pixel);
  g.stroke({ width: 1.6 * pixel, color, alpha, cap: 'round', join: 'round' });
}

/** How strongly the row where walked stairs change a token's level is filled, of the outline's strength. */
const BAND_ALPHA = 0.2;
/** The chevron on the end of walked stairs that is stepped on, in screen pixels: its arms, and how far inside the edge. */
const CHEVRON = 4;
const CHEVRON_INSET = 7;

/** Walked stairs' marks on the level shown: their last row filled faintly, and a chevron pointing in where they are stepped on. */
function drawFlight(g: Graphics, { open, band }: FlightEnds, pixel: number, color: number, alpha: number): void {
  g.poly(band, true).fill({ color, alpha: BAND_ALPHA * alpha });
  const [a, b] = open;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(length > 0)) return;
  const along = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // Inwards: the side of the open edge the band lies on, far end and all.
  const bandMiddle = band.reduce((sum, point) => ({ x: sum.x + point.x / band.length, y: sum.y + point.y / band.length }), { x: 0, y: 0 });
  const sign = Math.sign((bandMiddle.x - middle.x) * -along.y + (bandMiddle.y - middle.y) * along.x) || 1;
  const inward = { x: -along.y * sign, y: along.x * sign };
  const tip = { x: middle.x + inward.x * (CHEVRON_INSET + CHEVRON) * pixel, y: middle.y + inward.y * (CHEVRON_INSET + CHEVRON) * pixel };
  const arm = (side: 1 | -1): Point => ({
    x: tip.x - (inward.x + along.x * side) * CHEVRON * pixel,
    y: tip.y - (inward.y + along.y * side) * CHEVRON * pixel,
  });
  const [left, right] = [arm(1), arm(-1)];
  for (const [width, lineColor, lineAlpha] of [[3.5, 0x000000, 0.45], [1.6, color, 1]] as const) {
    g.moveTo(left.x, left.y).lineTo(tip.x, tip.y).lineTo(right.x, right.y);
    g.stroke({ width: width * pixel, color: lineColor, alpha: lineAlpha * alpha, cap: 'round', join: 'round' });
  }
}

/**
 * The stairs of the level shown (`PolygonAreaOverlay`): their outlines with a badge that shows steps
 * where they lead both ways, an arrow where they lead only up or only down, and faint steps where
 * they lead nowhere from this level; walked stairs (`flightOf`) also show their last row, where a
 * token changes level, and a chevron on the end they are stepped on from this level. Shown to the
 * GM at rest too, faintly, so the GM knows where a drop changes a token's level; the corners only
 * with the stairs tool. Never in the players' view or a picture of the scene (the GM's markers).
 */
export function levelLinkOverlay(viewport: Viewport, headingOf: (link: LevelLink) => StairsHeading, flightOf: (link: LevelLink) => FlightEnds | null): PolygonAreaOverlay<LevelLink> {
  return new PolygonAreaOverlay<LevelLink>(viewport, {
    label: 'level-links',
    zIndex: MAP_LAYER_Z.levelLinks,
    restingAlpha: RESTING_ALPHA,
    handleOf: (link) => areaHandlePoint(link.polygon),
    mark: (g, link, { pixel, theme, alpha }) => {
      const flight = flightOf(link);
      if (flight) drawFlight(g, flight, pixel, theme.stroke, alpha);
    },
    decorate: (g, link, { at, pixel, theme, alpha }) => {
      const heading = headingOf(link);
      if (heading === 'up' || heading === 'down') drawArrow(g, at, pixel, heading === 'up' ? -1 : 1, theme.stroke, alpha);
      else drawSteps(g, at, pixel, theme.stroke, heading === 'none' ? alpha * 0.4 : alpha);
    },
  });
}
