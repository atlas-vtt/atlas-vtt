import { computeTokenPixelSize } from '../pixi/token-renderer/tokenSizing';
import type { TokenEntity } from '../types';
import type { Point } from '../types/visionTypes';

/** Whether the players see a token. */
export type TokenSeen = (tokenId: string) => boolean;

/** The circle a token covers on the map. */
export interface TokenFootprint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** The tokens a measurement starts on, and whether the players saw every one of them when it started. */
export interface MeasureOrigin {
  readonly tokenIds: readonly string[];
  readonly unseenAtStart: boolean;
}

/** The origin of a measurement that starts on no token. */
export const NO_MEASURE_ORIGIN: MeasureOrigin = Object.freeze({ tokenIds: Object.freeze([]), unseenAtStart: false });

/**
 * The circles every token covers, hidden ones included: as wide as its sprite, or its ring where that
 * is larger, around where it is shown (`displayed`, its sprite) and, where that differs, where it is
 * stored. A position that is no finite number covers nothing.
 */
export function tokenFootprints(
  tokens: Readonly<Record<string, TokenEntity>>,
  displayed: Readonly<Record<string, { readonly x: number; readonly y: number } | null>>,
  gridSize: number,
  ringScale: number,
): TokenFootprint[] {
  const footprints: TokenFootprint[] = [];
  for (const [id, token] of Object.entries(tokens)) {
    const radius = (computeTokenPixelSize(gridSize, token.size || 1) / 2) * Math.max(1, ringScale);
    if (!(radius >= 0)) continue;
    const shown = displayed[id];
    const centres = shown && (shown.x !== token.x || shown.y !== token.y) ? [shown, token] : [shown ?? token];
    for (const { x, y } of centres) {
      if (Number.isFinite(x) && Number.isFinite(y)) footprints.push({ id, x, y, radius });
    }
  }
  return footprints;
}

/**
 * The tokens whose footprint covers any of `points` (its edge included), each once, and whether
 * `seen` said of any of them that the players did not see it then.
 */
export function measureOriginOf(points: readonly Point[], footprints: readonly TokenFootprint[], seen: TokenSeen): MeasureOrigin {
  const tokenIds: string[] = [];
  for (const footprint of footprints) {
    if (!tokenIds.includes(footprint.id) && points.some((point) => covers(footprint, point))) tokenIds.push(footprint.id);
  }
  if (tokenIds.length === 0) return NO_MEASURE_ORIGIN;
  return { tokenIds, unseenAtStart: tokenIds.some((id) => !seen(id)) };
}

/**
 * Whether the players' picture shows a measurement: never one that started on a token they did not
 * see, and otherwise while they see every token it started on, wherever those stand now.
 */
export function measureShownToPlayers(origin: MeasureOrigin, seen: TokenSeen): boolean {
  return !origin.unseenAtStart && origin.tokenIds.every((id) => seen(id));
}

function covers({ x, y, radius }: TokenFootprint, point: Point): boolean {
  const dx = point.x - x;
  const dy = point.y - y;
  return dx * dx + dy * dy <= radius * radius;
}
