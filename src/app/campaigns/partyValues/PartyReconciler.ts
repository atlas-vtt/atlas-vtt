import type { StoreApi } from 'zustand';
import { isHistoryTravelling, runUntracked } from '../../stores/history';
import type { ViewState } from '../../types/viewState';
import { followWrite, isEmptyWrite, settleTokens, type PartyContext, type PartyScene, type PartyWrite } from './partyReconcile';

/** What the reconciler reads and writes of a view store. */
export type PartyStoreState = Pick<ViewState, 'objects' | 'partyValues' | 'isMapLoading'>;

interface Seen extends PartyScene {
  readonly loading: boolean;
}

/** How often a pass follows up on what other listeners wrote during its own write. */
const MAX_ROUNDS = 4;

const seenOf = (state: PartyStoreState): Seen => ({ tokens: state.objects.tokens, partyValues: state.partyValues, loading: state.isMapLoading });

/**
 * Keeps a view store's player-character tokens and its `partyValues` one: while a campaign is
 * followed (`setContext`), a value the GM changes on a character's token goes to the party and to
 * the character's other tokens, values that reached the party from elsewhere reach the tokens,
 * and a token placed or a scene loaded takes the party's values (adopting what the party lacks).
 * An undo or redo puts the store back value by value, and the tokens then take the party's
 * values, so undoing a move never undoes a value set since. Its writes are Atlas's own
 * (`runUntracked`): during a GM write they are part of that write's step. Nothing happens while
 * a scene loads, or while no campaign is followed: tokens keep their own values then.
 */
export class PartyReconciler {
  private context: PartyContext | null = null;
  private seen: Seen;
  private writing = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly store: StoreApi<PartyStoreState>) {
    this.seen = seenOf(store.getState());
    this.unsubscribe = store.subscribe(() => this.follow());
  }

  /**
   * Follows the values of `context`'s campaign, or none. A campaign the store starts to follow
   * settles every token at once, adopting into the party what the tokens hold and it lacks.
   */
  setContext(context: PartyContext | null): void {
    this.context = context;
    this.settle();
  }

  /** Every player character's token takes the party's values again, adopting what the party lacks: e.g. once other tokens count as player characters. */
  settle(): void {
    const state = this.store.getState();
    this.seen = seenOf(state);
    if (this.context && !state.isMapLoading) this.write(settleTokens(this.seen, this.context, true));
  }

  destroy(): void {
    this.unsubscribe();
    this.context = null;
  }

  private follow(): void {
    if (this.writing) return;
    const before = this.seen;
    const state = this.store.getState();
    this.seen = seenOf(state);
    const context = this.context;
    if (!context || state.isMapLoading) return;
    if (before.loading) this.write(settleTokens(this.seen, context, true));
    else if (isHistoryTravelling(this.store)) this.write(settleTokens(this.seen, context, false));
    else if (before.tokens !== this.seen.tokens || before.partyValues !== this.seen.partyValues) this.write(followWrite(before, this.seen, context));
  }

  /** Writes a pass, then follows up on whatever other listeners wrote to tokens or values during it. */
  private write(pass: PartyWrite): void {
    let next = pass;
    for (let round = 0; round < MAX_ROUNDS && this.context && !isEmptyWrite(next); round++) {
      const written = this.apply(next);
      const now = seenOf(this.store.getState());
      this.seen = now;
      if (now.tokens === written.tokens && now.partyValues === written.partyValues) return;
      next = followWrite(written, now, this.context);
    }
  }

  private apply(pass: PartyWrite): PartyScene {
    const state = this.store.getState();
    const tokens = Object.keys(pass.tokens).length > 0 ? { ...state.objects.tokens, ...pass.tokens } : state.objects.tokens;
    const partyValues = Object.keys(pass.party).length > 0 ? { ...state.partyValues, ...pass.party } : state.partyValues;
    this.writing = true;
    try {
      runUntracked(this.store, () => this.store.setState({
        ...(tokens !== state.objects.tokens && { objects: { ...state.objects, tokens } }),
        ...(partyValues !== state.partyValues && { partyValues }),
      }));
    } finally {
      this.writing = false;
    }
    return { tokens, partyValues };
  }
}
