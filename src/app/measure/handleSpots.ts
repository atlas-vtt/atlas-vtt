/**
 * Where the badge of a kept measurement stands that lies on a token: on the rim of the token's
 * space, like an aura's, so that the token's middle takes the presses meant for the token. A ruler
 * starts on the centre of its token's cell, and a badge left there would take them all.
 */

import type { Point } from '../types/visionTypes';
import { auraBadgePoint } from './auraArea';
import { isAura } from './keptMeasures';
import type { AreaToken } from './measureTokens';
import type { KeptMeasure } from './measureTypes';
import { spaceRadius, type TokenGrid } from './tokenDistance';

/** How near the rim of a token's space a point lies and is no longer in it, world pixels: an origin on a cell's edge lies on the rim of the token in that cell, where its badge covers nothing. */
const RIM_ROOM = 0.5;

/** What was asked for last of one list of measurements, and what came of it. */
interface Asked {
  readonly tokens: Readonly<Record<string, AreaToken>>;
  readonly cellSize: number;
  readonly spots: ReadonlyMap<string, Point>;
}

const asked = new WeakMap<readonly KeptMeasure[], Asked>();
const NO_SPOTS: ReadonlyMap<string, Point> = new Map<string, Point>();

/**
 * The token whose space holds `point`, its rim not counted: the one lying on top where several do
 * (the last of the highest `layer`, as a click picks it); null where none does.
 */
export function tokenHolding(point: Point, tokens: Iterable<AreaToken>, grid: Pick<TokenGrid, 'size'>): AreaToken | null {
  let top: AreaToken | null = null;
  for (const token of tokens) {
    if (top && (token.layer ?? 0) < (top.layer ?? 0)) continue;
    const reach = spaceRadius(token, grid) - RIM_ROOM;
    const x = point.x - token.x;
    const y = point.y - token.y;
    if (reach > 0 && x * x + y * y < reach * reach) top = token;
  }
  return top;
}

/** The token a kept measurement lies on: the one an aura follows, else the one that holds its origin. */
function bearerOf(measure: KeptMeasure, tokens: Readonly<Record<string, AreaToken>>, grid: Pick<TokenGrid, 'size'>): AreaToken | null {
  if (isAura(measure)) return tokens[measure.follows] ?? null;
  const origin = measure.points[0];
  return origin ? tokenHolding(origin, Object.values(tokens), grid) : null;
}

/**
 * Where the badges of the measurements in `measures` stand that lie on one of `tokens`: on the
 * token's rim, the first where an aura's always stood and each further one of the same token a
 * step along the rim, in the order they were kept, so that none lies on another. A measurement on
 * no token is not among them: its badge stands on its origin. Worked out once for one list, the
 * same tokens and one cell size.
 */
export function rimSpots(measures: readonly KeptMeasure[], tokens: Readonly<Record<string, AreaToken>>, grid: Pick<TokenGrid, 'size'>): ReadonlyMap<string, Point> {
  if (measures.length === 0) return NO_SPOTS;
  const last = asked.get(measures);
  if (last && last.tokens === tokens && last.cellSize === grid.size) return last.spots;
  const spots = new Map<string, Point>();
  const taken = new Map<string, number>();
  for (const measure of measures) {
    const token = bearerOf(measure, tokens, grid);
    if (!token || !Number.isFinite(token.x) || !Number.isFinite(token.y)) continue;
    const place = taken.get(token.id) ?? 0;
    taken.set(token.id, place + 1);
    spots.set(measure.id, auraBadgePoint(token, grid, place));
  }
  asked.set(measures, { tokens, cellSize: grid.size, spots });
  return spots;
}
