import { fogSparesToken } from '../characters/partyTokens';
import type { FogCoverage } from '../fog/fogCoverage';
import type { TokenEntity } from '../types';
import type { Point } from '../types/visionTypes';
import type { TokenSeen } from '../vision/measureOrigin';
import type { TokenPerception } from '../vision/tokenPerception';
import type { SightPolicy } from '../vision/tokenSightPolicy';

/**
 * The roof over the players' picture of a floor: none; the roof the canvas draws, which hides a token whose centre it
 * covers; or one whose pieces cannot be read (`'unread'`), which fails closed: players see only the tokens their eyes
 * always see.
 */
export type PictureRoof = null | ((point: Point) => boolean) | 'unread';

/** What the players' frame of a floor hides tokens by besides the lighting. */
export interface FrameFacts {
  readonly tokens: Readonly<Record<string, TokenEntity>>;
  /** Where a token is drawn now; fog and the roof are read there, and at its stored place where it is not drawn. */
  place(tokenId: string): Point | null | undefined;
  /** The committed fog: none followed (undefined), one that cannot be read (null: it covers everything), or its coverage. */
  readonly fog: FogCoverage | null | undefined;
  readonly roof: PictureRoof;
  /** Whose eyes look, which decides what an unread roof leaves them. */
  readonly policy: SightPolicy;
}

/** Whether committed fog covers a token's place, kept by the place's object while the coverage and the place stay. */
export class FogMembership {
  private readonly known = new WeakMap<object, { coverage: FogCoverage; x: number; y: number; covered: boolean }>();

  covers(coverage: FogCoverage, point: Point): boolean {
    const known = this.known.get(point);
    if (known?.coverage === coverage && known.x === point.x && known.y === point.y) return known.covered;
    const covered = coverage.covers(point);
    this.known.set(point, { coverage, x: point.x, y: point.y, covered });
    return covered;
  }
}

/** Whether committed fog or the roof hides a token from the players' frame, the fog read once for every token asked of. */
function hidden(id: string, facts: FrameFacts, fog: FogCoverage | null | undefined, membership: FogMembership): boolean {
  const { tokens, roof, policy } = facts;
  const token = tokens[id];
  const point = facts.place(id) ?? token;
  const fogged = fog !== undefined && (fog === null || fog.shape.length > 0);
  if (fogged && !(token !== undefined && fogSparesToken(token)) && (fog === null || point === undefined || membership.covers(fog, point))) return true;
  return roof === 'unread' ? token === undefined || !policy.alwaysSeen(token) : roof !== null && point !== undefined && roof(point);
}

/** Whether committed fog or the roof hides the token from the players' frame, whatever the lighting perceives. */
export function frameHides(tokenId: string, facts: FrameFacts, membership: FogMembership): boolean {
  return hidden(tokenId, facts, facts.fog, membership);
}

/**
 * How the players' frame shows each token: as `lit` perceives it (the lighting; none while the floor is unlit), unless
 * committed fog covers it, which never takes one of the party's (`fogSparesToken`), or the roof does. `lit` as it is
 * while neither fog nor a roof is there to hide anything.
 */
export function framePerception(lit: TokenPerception | undefined, facts: FrameFacts, membership = new FogMembership()): TokenPerception | undefined {
  const { fog, roof } = facts;
  if ((fog === undefined || (fog !== null && fog.shape.length === 0)) && roof === null) return lit;
  return (id) => (hidden(id, facts, fog, membership) ? 'unseen' : (lit?.(id) ?? 'seen'));
}

/** Whether a token is hidden from the players: they are sent nothing of it, see no light it carries, and none of them acts as it. */
export const hiddenFromPlayers = (token: { readonly isHidden?: boolean | undefined } | undefined): boolean => token?.isHidden === true;

/**
 * Whether the players see a token, for what shows only with it: it exists, is not hidden, and `perception` (their sight
 * with committed fog and the roof) sees it, or answers nothing (an unlit floor nothing covers). A token they only sense,
 * do not see or that fog covers is not seen.
 */
export function seenByPlayers(tokens: Readonly<Record<string, { isHidden?: boolean }>>, perception: TokenPerception | undefined): TokenSeen {
  return (tokenId) => {
    const token = tokens[tokenId];
    return !!token && !hiddenFromPlayers(token) && (perception?.(tokenId) ?? 'seen') === 'seen';
  };
}

/** Sees no token: what a players' frame answers while it cannot tell. */
export const NOTHING_SEEN: TokenSeen = () => false;
