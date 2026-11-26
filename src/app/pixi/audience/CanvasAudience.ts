import type { StoreApi } from 'zustand';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasState } from '../../storeFactory';
import type { TokenEntity } from '../../types';
import { mapTokens } from '../../tokens/offMap';
import type { EventEmitter } from '../../utils/typedEmitter';
import type { TokenSeen } from '../../vision/measureOrigin';
import type { TokenPerception } from '../../vision/tokenPerception';
import { NOTHING_SEEN, seenByPlayers } from '../token-renderer/PlayerSightTokens';

export interface CanvasAudienceDeps {
  store: Pick<StoreApi<ViewAtlasState>, 'getState' | 'subscribe'>;
  /** The view's bus, which tells of the command palette's player mode (`player-mode-changed`). */
  eventBus: Pick<EventEmitter, 'on' | 'off'>;
  /** Whether the peek key holds the players' lighting on the canvas now (`SessionLighting`); never in a view without lighting. */
  peeking(): boolean;
}

/** What the audience asks of the tokens the canvas draws. */
export interface AudienceTokens {
  /** Shows each token, its UI and what stands with it as the canvas is drawn for now. */
  show(): void;
  /** How the players perceive each token by the canvas's sight, committed fog and roof; undefined where nothing takes one from them. */
  perception(): TokenPerception | undefined;
}

/**
 * Whom a map view's canvas is drawn for now, and what the players see of its tokens there. It is
 * drawn for the players in session view (Table mode is one), in a player view, in the command
 * palette's player mode and while the peek key is held. All but the peek take the players'
 * perspective: hidden tokens are left out. Everything on the canvas that the players' picture
 * changes listens to one notice (`onChange`): whom the canvas is drawn for changed, the players'
 * sight changed, or a token came into it or left it.
 */
export class CanvasAudience {
  private playerMode = false;
  private tokens: AudienceTokens | null = null;
  private readonly listeners = new Set<() => void>();
  /** The tokens the players saw when they were last told of while the canvas showed their picture; null in the GM's view. */
  private seen: Set<string> | null = null;
  private readonly stops: Array<() => void>;

  constructor(private readonly deps: CanvasAudienceDeps) {
    const playerModeChanged = (on: boolean): void => {
      this.playerMode = on;
      this.refresh();
    };
    deps.eventBus.on('player-mode-changed', playerModeChanged);
    this.stops = [
      () => deps.eventBus.off('player-mode-changed', playerModeChanged),
      deps.store.subscribe((state, previous) => {
        if (state.isGMView !== previous.isGMView || state.isPlayerView !== previous.isPlayerView) this.refresh();
      }),
    ];
  }

  /** Whether the canvas takes the players' perspective: session view, a player view or the palette's player mode, not a peek. */
  takesPlayersPerspective(): boolean {
    const { isGMView, isPlayerView } = this.deps.store.getState();
    return this.playerMode || isPlayerView || !isGMView;
  }

  /** Whether the canvas shows the players' picture: in their perspective, or while the peek key is held. */
  showsPlayers(): boolean {
    return this.takesPlayersPerspective() || this.deps.peeking();
  }

  /** Whether the players see each token on the canvas while it shows their picture; null in the GM's view. Without tokens drawn they see none. */
  seenOnCanvas(): TokenSeen | null {
    if (!this.showsPlayers()) return null;
    return this.tokens ? seenByPlayers(this.mapTokens(), this.tokens.perception()) : NOTHING_SEEN;
  }

  /** The tokens of the canvas, which show what the audience sees from now on; returns the function that lets them go. */
  drawTokens(tokens: AudienceTokens): () => void {
    this.tokens = tokens;
    return () => {
      if (this.tokens === tokens) this.tokens = null;
    };
  }

  /**
   * What the players' picture rests on changed: whom the canvas is drawn for, the players' sight,
   * the fog or the roof over it, the tokens the pointer holds. The tokens show it, and listeners hear.
   */
  refresh(): void {
    this.tokens?.show();
    this.tokensChanged();
  }

  /**
   * The tokens were drawn anew or as the store has them now. Listeners hear while the canvas shows
   * the players' picture, and when it stops showing it; in the GM's view nothing follows their sight.
   */
  tokensChanged(): void {
    const seen = this.seenOnCanvas();
    if (!seen && !this.seen) return;
    this.seen = seen ? new Set(Object.keys(this.mapTokens()).filter((id) => seen(id))) : null;
    this.notify();
  }

  /**
   * A token is drawn at a new place, and the players now see it or not (`seen`). Listeners hear only
   * when that changed against the last time they heard, so a drag that changes nobody's sight tells nobody.
   */
  moved(tokenId: string, seen: boolean): void {
    if (!this.seen || this.seen.has(tokenId) === seen) return;
    if (seen) this.seen.add(tokenId);
    else this.seen.delete(tokenId);
    this.notify();
  }

  /** Calls `listener` whenever whom the canvas is drawn for, or what the players see of its tokens, may have changed. Returns the function that stops it. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    for (const stop of this.stops) stop();
    this.listeners.clear();
    this.tokens = null;
  }

  /** The tokens on the map of the level shown. */
  private mapTokens(): Readonly<Record<string, TokenEntity>> {
    return mapTokens(levelObjects(this.deps.store.getState()));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
