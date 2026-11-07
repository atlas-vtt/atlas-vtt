import { instanceBadgeNumbers } from '../../initiative/cardInstanceNumber';
import { levelObjects } from '../../levels/levelObjects';
import { isOffMap, sceneTokens } from '../../tokens/offMap';
import type { ViewState } from '../../types/viewState';
import type { TokenSeen } from '../../vision/measureOrigin';

/** What the players' badge numbers read of the view's state: its tokens, its levels and whether it shows badges. */
export type PlayerBadgeState = Pick<ViewState, 'levels' | 'viewedLevel'> & {
  readonly objects: Pick<ViewState['objects'], 'tokens'>;
  readonly tokenSettings?: Partial<Pick<ViewState['tokenSettings'], 'showInstanceBadges'>>;
};

/** The numbers the players' badges show, for what else shows a token to them (their initiative list). */
export interface PlayerBadgeNumbers {
  /** The number the players' badge of `tokenId` shows after the last pass: none where it shows none. */
  numberOf(tokenId: string): number | null;
  /** Calls `listener` whenever a pass or a reset changes what `numberOf` answers; returns the unsubscribe. */
  onNumbersChange(listener: () => void): () => void;
}

function sameNumbers(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  return a.size === b.size && [...a].every(([id, number]) => b.get(id) === number);
}

/**
 * The numbers the players' frame shows on look-alikes: the GM's own (`instanceBadgeNumbers`), so a
 * token has one number on every screen, on the tokens the players see and the combatants beside the
 * map their initiative list shows unless hidden. A token they do not see shows them none. The badge
 * itself is the GM's, shown and hidden with its token.
 */
export class ShownBadgeNumbers implements PlayerBadgeNumbers {
  private shown: ReadonlyMap<string, number> = new Map();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly state: () => PlayerBadgeState) {}

  /** Takes the numbers of the tokens `seen` answers for; tells the listeners where that changed what `numberOf` answers. */
  pass(seen: TokenSeen): void {
    const state = this.state();
    const tokens = sceneTokens(levelObjects(state));
    const shown = new Map<string, number>();
    for (const [id, number] of instanceBadgeNumbers(tokens, state.tokenSettings?.showInstanceBadges ?? true)) {
      const token = tokens[id];
      if (isOffMap(token) ? token?.isHidden !== true : seen(id)) shown.set(id, number);
    }
    if (sameNumbers(this.shown, shown)) return;
    this.shown = shown;
    this.announce();
  }

  numberOf(tokenId: string): number | null {
    return this.shown.get(tokenId) ?? null;
  }

  onNumbersChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts anew, for a map whose tokens were all made anew. */
  reset(): void {
    if (this.shown.size === 0) return;
    this.shown = new Map();
    this.announce();
  }

  private announce(): void {
    for (const listener of this.listeners) listener();
  }
}
