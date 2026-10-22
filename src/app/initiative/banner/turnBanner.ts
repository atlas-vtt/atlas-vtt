/**
 * What the turn banner says when the turn of a running fight moves on: whose turn it is (the
 * combatant's portrait and name, or by sides the side's name) and, when a round begins, the round.
 * The players' banner follows their list: no banner where the list marks no turn (a hidden turn
 * holder), and no name where the list shows none.
 */

import { formatList } from '../../i18n';
import { tokenDisplayName } from '../../pixi/token-renderer/tokenDisplayName';
import type { TokenEntity } from '../../types';
import type { InitiativeState } from '../../types/initiativeTypes';
import { currentTurn, turnKey } from '../turnHolders';
import { fightSides, sideName } from '../sides';

/** The portrait of the combatant whose turn it is, drawn as the map draws its token. */
export interface TurnBannerPortrait {
  readonly imagePath: string;
  readonly showRing: boolean;
  readonly ringColor?: string | undefined;
}

export interface TurnBanner {
  /** The turn it names (`turnKey`). */
  readonly key: string;
  /** The round, where this turn began one (or the fight); null otherwise. */
  readonly round: number | null;
  /** The combatant's or the side's name; null where the viewer is shown none. */
  readonly title: string | null;
  readonly portrait: TurnBannerPortrait | null;
}

/** Who the banner is for: the GM sees every turn by the names the map shows; players see what their list shows. */
export type BannerViewer = { readonly kind: 'gm' } | { readonly kind: 'players'; readonly showNames: boolean };

/** The turn a banner was last worked out for. */
export interface TurnSeen {
  readonly key: string;
  readonly round: number;
}

type BannerState = Pick<InitiativeState, 'isActive' | 'round' | 'entries' | 'sides'>;

/**
 * The banner for the turn now, or null outside a fight, without a turn holder, or where the viewer
 * is not to see it. `previous` is the turn seen before: a round is named where the round changed
 * or the fight began.
 */
export function turnBannerOf(
  previous: TurnSeen | null,
  initiative: BannerState,
  tokens: Readonly<Record<string, TokenEntity>>,
  viewer: BannerViewer,
): TurnBanner | null {
  const turn = currentTurn(initiative);
  if (!turn) return null;
  const key = turnKey(turn);
  const round = previous === null || previous.round !== turn.round ? turn.round : null;
  if (turn.kind === 'sides') {
    const refs = new Map(initiative.sides ? fightSides(initiative.sides).map((side) => [side.id, side]) : []);
    const title = formatList(turn.sides.map((id) => sideName(refs.get(id) ?? { id })));
    return { key, round, title, portrait: null };
  }
  const { entry } = turn;
  const token = tokens[entry.tokenId];
  if (viewer.kind === 'players' && (!token || token.isHidden)) return null;
  const title = viewer.kind === 'gm' ? (token ? tokenDisplayName(token) : null) ?? entry.name : viewer.showNames ? entry.name : null;
  const portrait = entry.imagePath ? { imagePath: entry.imagePath, showRing: token?.showRing !== false, ringColor: token?.ringColor } : null;
  return { key, round, title: title || null, portrait };
}

/**
 * Follows a store's fight and says when the turn moved on: `next` answers the banner for a turn
 * other than the last one seen, and null otherwise. A scene that loads or changes starts afresh
 * without a banner, as does the first look at a fight already running.
 */
export class TurnWatch {
  private seen: TurnSeen | null = null;
  private scene: string | null | undefined = undefined;

  next(
    state: { readonly initiative: BannerState | undefined; readonly mapPath: string | null; readonly isMapLoading: boolean; readonly objects: { readonly tokens: Readonly<Record<string, TokenEntity>> } },
    viewer: BannerViewer,
  ): TurnBanner | null {
    const turn = state.initiative ? currentTurn(state.initiative) : null;
    const now = turn ? { key: turnKey(turn), round: turn.round } : null;
    const first = this.scene === undefined || this.scene !== state.mapPath || state.isMapLoading;
    const previous = this.seen;
    this.scene = state.isMapLoading ? undefined : state.mapPath;
    this.seen = now;
    if (first || now === null || state.initiative === undefined || now.key === previous?.key) return null;
    return turnBannerOf(previous, state.initiative, state.objects.tokens, viewer);
  }

  /** Forget the turn seen: the next look starts afresh. */
  reset(): void {
    this.seen = null;
    this.scene = undefined;
  }
}
