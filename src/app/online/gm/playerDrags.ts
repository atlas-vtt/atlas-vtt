import type { PlayerDrag, PlayerDragCancel, PlayerMove } from '../protocol/index.ts';
import { holdTokens } from '../../lighting/sightOnDrop';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import { placeTokens } from '../../stores/tokenStacking';
import type { HeldTokens } from '../../types/viewUIState';
import type { Point } from '../movement/index.ts';
import { checkMove, landing, MoveRate, type MoveContext } from './moveCheck.ts';
import type { MoveState, MoveStore } from './playerMoves.ts';

/** Drag messages a player may send: a burst of 40, then 40 a second (the browser sends about 30). */
export const DRAG_BURST = 40;
export const DRAGS_PER_SECOND = 40;
/** How long a drag lasts without word from its player before the GM drops the token where it is. */
export const DRAG_IDLE_MS = 3_000;

export interface PlayerDragPorts {
  /** The shared scene, its list, owners and map, with the tokens as the store holds them now. */
  context(state: MoveState): MoveContext;
  now(): number;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
}

/** A player's drag the GM follows: whose, which token (by GM id and by the id the player knows), and where it was taken from. */
interface LiveDrag {
  readonly from: string;
  readonly alias: string;
  readonly tokenId: string;
  readonly start: { readonly x: number; readonly y: number };
  lastAt: number;
}

const key = (from: string, tokenId: string): string => `${from}\n${tokenId}`;
const loaded = (state: MoveState): boolean => state.mapLoaded && !state.isMapLoading;

/**
 * Players' drags of their own tokens, followed live on the GM's map as Atlas's own drag runs: the
 * first drag message holds the token (`holdTokens`, so sight on drop waits as for the GM's drag) and
 * opens a history transaction, each further one moves it through the store, and the drop puts it
 * down on top (`placeTokens`) and closes the transaction, so the whole drag is one undo step. Drags of
 * several players at once share one step. On a lit scene every message and the drop move the token
 * from where it is up to the first wall in the way (`landing`), so a drag never takes it through a
 * wall or a closed door. A drag the GM takes over (by holding any token), one whose
 * scene unloads, whose player leaves or stops sending, or that the checks refuse, ends at once: the
 * token stays where it is, or goes back where it was taken from when refused or cancelled.
 */
export class PlayerDrags {
  private readonly store: MoveStore;
  private readonly ports: PlayerDragPorts;
  private readonly rate = new MoveRate(DRAG_BURST, DRAGS_PER_SECOND);
  /** The drags under way, by GM token id. */
  private readonly live = new Map<string, LiveDrag>();
  /** Drags the GM took over, by player and token: the rest of that drag, and its drop, are not taken. */
  private readonly taken = new Set<string>();
  /** Whether the drags' history transaction is open, and whether a drag in it moved a token for good. */
  private open = false;
  private changed = false;
  /** The held tokens as these drags last wrote them: any other value means the GM holds tokens. */
  private held: HeldTokens | null = null;
  private writing = false;
  private idle: number | undefined;

  constructor(store: MoveStore, ports: PlayerDragPorts) {
    this.store = store;
    this.ports = ports;
  }

  /** Whether the GM is pressing or dragging tokens: the players' drags then wait. */
  gmHolds(state: MoveState): boolean {
    if (state.isDragging) return true;
    return this.live.size > 0 ? state.heldTokens !== this.held : Object.keys(state.heldTokens).length > 0;
  }

  /** Where each token under a drag was taken from, by GM token id. */
  starts(): Map<string, Point> {
    return new Map([...this.live.values()].map(({ tokenId, start }) => [tokenId, start]));
  }

  /** A drag message: starts or moves the player's drag, or ends it when the token may no longer be theirs. */
  receive(from: string, drag: PlayerDrag): void {
    const state = this.store.getState();
    if (!this.rate.take(from, this.ports.now()) || !loaded(state) || this.gmHolds(state)) return;
    const live = this.find(from, drag.id);
    const context = this.context(state, live);
    const verdict = checkMove(from, drag, context);
    if (!verdict.ok) {
      if (verdict.reason !== 'place' && live !== undefined) this.end([live], 'back');
      return;
    }
    if (this.taken.has(key(from, verdict.tokenId))) return;
    const token = state.objects.tokens[verdict.tokenId];
    if (live === undefined && token !== undefined) this.begin({ from, alias: drag.id, tokenId: verdict.tokenId, start: { x: token.x, y: token.y }, lastAt: 0 });
    const current = this.live.get(verdict.tokenId);
    if (current === undefined || token === undefined) return;
    current.lastAt = this.ports.now();
    // From where the last message left it, up to the first wall in the way.
    const at = landing(context, token, verdict);
    this.write((draft) => {
      const moved = draft.objects.tokens[verdict.tokenId];
      if (moved === undefined) return;
      moved.x = at.x;
      moved.y = at.y;
      draft._audioDirty = true;
    });
  }

  /**
   * The player's drop of a token: where it ended their drag (the drop's place, or before the first
   * wall on the way there), false when it was refused (the token went back, or the GM had taken the
   * drag over), and null when no drag of theirs was under way.
   */
  drop(from: string, move: PlayerMove): Point | false | null {
    const state = this.store.getState();
    const live = this.find(from, move.id);
    const context = this.context(state, live);
    const tokenId = context.scene === move.scene ? context.listedToken(move.id) : undefined;
    if (tokenId !== undefined && this.taken.delete(key(from, tokenId))) return false;
    if (live === undefined) return null;
    const verdict = checkMove(from, move, context);
    if (!verdict.ok || this.gmHolds(state)) {
      this.end([live], 'back');
      return false;
    }
    const token = state.objects.tokens[live.tokenId];
    const at = token === undefined ? { x: verdict.x, y: verdict.y } : landing(context, token, verdict);
    this.end([live], at);
    return at;
  }

  /**
   * The player let go without a drop (a second finger took the map, a cancelled touch, a drop where
   * the drag began): the token goes back where the drag took it from, and no undo step is left.
   */
  cancel(from: string, cancel: PlayerDragCancel): void {
    const live = this.find(from, cancel.id);
    const context = this.context(this.store.getState(), live);
    if (context.scene !== cancel.scene) return;
    const tokenId = context.listedToken(cancel.id);
    if (tokenId !== undefined) this.taken.delete(key(from, tokenId));
    if (live !== undefined) this.end([live], 'back');
  }

  /** A player left the table: their drags end with the tokens where they are. */
  playerLeft(player: string): void {
    this.endWhereTheyAre([...this.live.values()].filter((live) => live.from === player));
  }

  /** Ends every drag with its token where it is: the shared scene changed or sharing stops. */
  stop(): void {
    this.end([...this.live.values()], 'as-is');
    this.taken.clear();
  }

  /** Hears the store: the GM holding tokens takes the drags over, and a scene that unloads ends them. */
  storeChanged(state: MoveState): void {
    if (this.writing || this.live.size === 0) return;
    if (!loaded(state)) return this.end([...this.live.values()], 'as-is');
    if (!this.gmHolds(state)) return;
    for (const live of this.live.values()) if (Object.hasOwn(state.heldTokens, live.tokenId)) this.taken.add(key(live.from, live.tokenId));
    // No write here: the hold is the GM's now, and the GM's own drag opens its transaction next.
    this.end([...this.live.values()], 'as-is');
  }

  private begin(live: LiveDrag): void {
    if (!this.open) {
      beginHistoryTransaction(this.store);
      this.open = true;
      this.changed = false;
    }
    this.live.set(live.tokenId, live);
    this.hold();
    this.armIdle();
  }

  /**
   * Ends drags: puts each token down at a place (on top, as a drop), back where it was taken from, or
   * leaves it as it is; the last drag to end lets go of the hold and closes the transaction, as one
   * undo step when a token moved for good.
   */
  private end(drags: readonly LiveDrag[], outcome: { readonly x: number; readonly y: number } | 'back' | 'as-is'): void {
    if (drags.length === 0) return;
    for (const live of drags) this.live.delete(live.tokenId);
    const last = this.live.size === 0;
    if (outcome !== 'back') this.changed = true;
    if (outcome !== 'as-is') {
      this.write((draft) => {
        if (outcome === 'back') {
          for (const { tokenId, start } of drags) {
            const token = draft.objects.tokens[tokenId];
            if (token !== undefined) Object.assign(token, start);
          }
          draft._audioDirty = true;
        } else placeTokens(draft, drags.map(({ tokenId }) => ({ id: tokenId, ...outcome })));
        if (last && Object.keys(draft.heldTokens).length > 0) draft.heldTokens = {};
      });
    }
    if (!last) return outcome === 'as-is' ? undefined : this.hold();
    const state = this.store.getState();
    // Let go of a hold that is still these drags' own; one the GM has taken over stays the GM's.
    if (outcome === 'as-is' && state.heldTokens === this.held && !state.isDragging) this.write((draft) => {
      draft.heldTokens = {};
    });
    this.held = null;
    this.cancelIdle();
    if (!this.open) return;
    this.open = false;
    if (this.changed) endHistoryTransaction(this.store);
    else abandonHistoryTransaction(this.store);
  }

  /** Drops each drag's token where it is, or puts it back when its player may no longer move it. */
  private endWhereTheyAre(drags: readonly LiveDrag[]): void {
    for (const live of drags) {
      const state = this.store.getState();
      const token = state.objects.tokens[live.tokenId];
      const context = this.context(state, live);
      const verdict = token === undefined || context.scene === null ? null : checkMove(live.from, { scene: context.scene, id: live.alias, x: token.x, y: token.y }, context);
      this.end([live], verdict?.ok === true ? { x: verdict.x, y: verdict.y } : 'back');
    }
  }

  /** Notes the dragged tokens as held, each from the place it was taken at. */
  private hold(): void {
    holdTokens({
      getState: () => {
        const { objects, heldTokens } = this.store.getState();
        const setHeldTokens = (held: HeldTokens): void => this.write((draft) => {
          draft.heldTokens = held;
        });
        return { objects, heldTokens, setHeldTokens };
      },
    }, [...this.live.keys()]);
    this.held = this.store.getState().heldTokens;
  }

  private write(recipe: (draft: MoveState) => void): void {
    this.writing = true;
    try {
      this.store.setState(recipe);
    } finally {
      this.writing = false;
    }
  }

  /** The player's drag of the token they know by `alias`. */
  private find(from: string, alias: string): LiveDrag | undefined {
    for (const live of this.live.values()) if (live.from === from && live.alias === alias) return live;
    return undefined;
  }

  /** What a drag message is checked against: a drag under way keeps its token even should it leave the players' list meanwhile. */
  private context(state: MoveState, live: LiveDrag | undefined): MoveContext {
    const context = this.ports.context(state);
    return live === undefined ? context : { ...context, listedToken: (alias) => (alias === live.alias ? live.tokenId : context.listedToken(alias)) };
  }

  private armIdle(): void {
    if (this.idle !== undefined) return;
    this.idle = this.ports.setTimer(() => {
      this.idle = undefined;
      const now = this.ports.now();
      this.endWhereTheyAre([...this.live.values()].filter((live) => now - live.lastAt >= DRAG_IDLE_MS));
      if (this.live.size > 0) this.armIdle();
    }, DRAG_IDLE_MS / 3);
  }

  private cancelIdle(): void {
    if (this.idle !== undefined) this.ports.clearTimer(this.idle);
    this.idle = undefined;
  }
}
