import type { GmMessage, PlayerDrag, PlayerDragCancel, PlayerMove } from '../protocol/index.ts';
import { placeTokens, type PlacedTokensState } from '../../stores/tokenStacking';
import type { ViewState } from '../../types/viewState';
import { checkMove, insideMap, landing, MoveRate, type MoveContext } from './moveCheck.ts';
import { PlayerDrags } from './playerDrags.ts';

/** What player moves read and write of an Atlas tab's store. */
export type MoveState = PlacedTokensState & Pick<ViewState, 'objects' | 'mapLoaded' | 'isMapLoading' | 'isDragging' | 'heldTokens'>;

export interface MoveStore {
  getState(): MoveState;
  /** A write as the GM's own: Atlas's history records it as one undo step. */
  setState(recipe: (draft: MoveState) => void): void;
  subscribe(listener: (state: MoveState) => void): () => void;
}

export interface PlayerMovePorts {
  /** The shared scene, its list and owners, and the map's size, as they are now. */
  context(): Omit<MoveContext, 'tokens'>;
  send(body: GmMessage, to: string): void;
  now(): number;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
}

/** A move held while the GM drags: who sent it, and where the token stood then. */
interface Waiting {
  readonly from: string;
  readonly move: PlayerMove;
  readonly x: number;
  readonly y: number;
}

/**
 * Players' moves of their own tokens. A drag is followed live (`PlayerDrags`) and its drop ends it.
 * A drop without a drag under way is checked (`checkMove`, a rate per player), then put down as the
 * GM's drop puts tokens down (`placeTokens`: the place and on top of the others), one undo step per
 * move; on a lit scene a token stops before the first wall in its way (`landing`), and its sender
 * hears where. Everyone sees it through the token list. While the GM holds tokens (a write would join the
 * GM's drag in one undo step) a move waits, and is taken once the GM's drag has closed, unless the
 * GM moved that token meanwhile. A refused move tells its sender where the token stays.
 */
export class PlayerMoves {
  private readonly store: MoveStore;
  private readonly ports: PlayerMovePorts;
  private readonly rate = new MoveRate();
  /** The last waiting move of each token, by GM id. */
  private readonly waiting = new Map<string, Waiting>();
  private readonly drags: PlayerDrags;
  private timer: number | undefined;
  private unsubscribe: (() => void) | null = null;

  constructor(store: MoveStore, ports: PlayerMovePorts) {
    this.store = store;
    this.ports = ports;
    this.drags = new PlayerDrags(store, { ...ports, context: (state) => this.context(state) });
  }

  start(): void {
    this.unsubscribe ??= this.store.subscribe((state) => {
      this.drags.storeChanged(state);
      if (this.waiting.size > 0 && !this.drags.gmHolds(state)) this.schedule();
    });
  }

  /** A drag message: the token follows the player's pointer on the GM's map. */
  drag(from: string, drag: PlayerDrag): void {
    this.drags.receive(from, drag);
  }

  /** Where each token a player drags now was taken from, by GM token id. */
  dragStarts(): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
    return this.drags.starts();
  }

  /** The player let go of a drag without a drop: the token goes back, with no undo step. */
  dragCancel(from: string, cancel: PlayerDragCancel): void {
    this.drags.cancel(from, cancel);
  }

  /** A player left: their drags end with the tokens where they are. */
  playerLeft(player: string): void {
    this.drags.playerLeft(player);
  }

  /** The shared scene changed: drags of the last one end where their tokens are. */
  sceneChanged(): void {
    this.drags.stop();
  }

  stop(): void {
    this.drags.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== undefined) this.ports.clearTimer(this.timer);
    this.timer = undefined;
    this.waiting.clear();
  }

  receive(from: string, move: PlayerMove): void {
    const state = this.store.getState();
    if (!this.rate.take(from, this.ports.now()) || !state.mapLoaded || state.isMapLoading) return this.refuse(from, move);
    const dropped = this.drags.drop(from, move);
    if (dropped !== null) return dropped !== false && dropped.x === move.x && dropped.y === move.y ? undefined : this.refuse(from, move);
    const verdict = checkMove(from, move, this.context(state));
    if (!verdict.ok) return this.refuse(from, move);
    if (!this.drags.gmHolds(state)) return this.apply(from, verdict.tokenId, move);
    const earlier = this.waiting.get(verdict.tokenId);
    if (earlier !== undefined && earlier.from !== from) this.refuse(earlier.from, earlier.move);
    const token = state.objects.tokens[verdict.tokenId];
    this.waiting.set(verdict.tokenId, { from, move, x: token?.x ?? Number.NaN, y: token?.y ?? Number.NaN });
  }

  /** Takes the waiting moves once the GM's write that let go has finished (its listeners run inside the drag's undo step). */
  private schedule(): void {
    if (this.timer !== undefined) return;
    this.timer = this.ports.setTimer(() => {
      this.timer = undefined;
      this.flush();
    }, 0);
  }

  private flush(): void {
    const state = this.store.getState();
    if (this.drags.gmHolds(state)) return;
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const { from, move, x, y } of waiting) {
      const now = this.store.getState();
      const verdict = now.mapLoaded && !now.isMapLoading ? checkMove(from, move, this.context(now)) : null;
      const token = verdict?.ok === true ? now.objects.tokens[verdict.tokenId] : undefined;
      if (verdict?.ok !== true || token === undefined || token.x !== x || token.y !== y) this.refuse(from, move);
      else this.apply(from, verdict.tokenId, move);
    }
  }

  /**
   * Puts the token down where the move takes it: its place, or before the first wall on the way there.
   * Its sender hears where it stays when that is not the place they sent, and nothing is written when
   * a wall keeps it where it is.
   */
  private apply(from: string, tokenId: string, move: PlayerMove): void {
    const state = this.store.getState();
    const token = state.objects.tokens[tokenId];
    const at = token === undefined ? move : landing(this.context(state), token, move);
    const stopped = at.x !== move.x || at.y !== move.y;
    if (!stopped || at.x !== token?.x || at.y !== token.y) this.store.setState((draft) => placeTokens(draft, [{ id: tokenId, x: at.x, y: at.y }]));
    if (stopped) this.refuse(from, move);
  }

  /** Tells the sender the move was not taken, with the token's place where the players see it. */
  private refuse(from: string, move: PlayerMove): void {
    const state = this.store.getState();
    const context = this.context(state);
    const tokenId = context.scene === move.scene ? context.listedToken(move.id) : undefined;
    const token = tokenId === undefined ? undefined : state.objects.tokens[tokenId];
    const seen = token !== undefined && token.isHidden !== true && insideMap(token.x, token.y, null);
    this.ports.send({ t: 'move-refused', scene: move.scene, id: move.id, x: seen ? token.x : null, y: seen ? token.y : null }, from);
  }

  private context(state: MoveState): MoveContext {
    return { ...this.ports.context(), tokens: state.objects.tokens };
  }
}
