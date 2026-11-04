import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { resourceUpdate, withCurrent } from '../../../resources/resourceValues';
import type { ViewState } from '../../../types/viewState';
import type { Timers } from '../companionTimers.ts';
import { editableValue, withMaxValue, type ResourceEdit } from './resourceEdit.ts';

/** An edit of a token in the shared scene. */
export type TokenResourceEdit = Extract<ResourceEdit, { readonly kind: 'token' }>;
/** What became of an edit: the current value the resource holds after it (and its maximum, where the edit set one), or null when it was refused. */
export type ResourceAnswer = (taken: number | null, max?: number) => void;

/** What resource writes read and write of an Atlas tab's store. */
export type ResourceWriteState = Pick<ViewState, 'objects' | 'mapLoaded' | 'isMapLoading' | 'isDragging' | 'heldTokens'>;

export interface ResourceWriteStore {
  getState(): ResourceWriteState;
  /** A write as the GM's own: Atlas's history records it as one undo step. */
  setState(recipe: (draft: ResourceWriteState) => void): void;
  subscribe(listener: (state: ResourceWriteState) => void): () => void;
}

export interface ResourceWritePorts extends Timers {
  /** The resource definitions the scene's tokens are drawn by. */
  definitions(): readonly ResourceDefinition[];
  ownerOf(tokenId: string): string | undefined;
}

interface Waiting {
  readonly edit: TokenResourceEdit;
  readonly answer: ResourceAnswer;
}

const holds = (state: ResourceWriteState): boolean => state.isDragging || Object.keys(state.heldTokens).length > 0;
const loaded = (state: ResourceWriteState): boolean => state.mapLoaded && !state.isMapLoading;

/**
 * Players' edits of their characters' resources on the shared scene, written as the GM's own: one
 * undo step each, through `resourceUpdate` on the token as the store holds it then, clamped to the
 * resource's range. A maximum the player set by hand is remembered as the GM's would be
 * (`overriddenMax`); one the token takes from its note is not. While anyone holds tokens (the GM's
 * drag, a player's drag: a write would join that drag's undo step) an edit waits, the latest of each
 * token and resource, and is taken once the hold has ended, checked again: the token must still be
 * its sender's and the resource one they may change. An edit that is not taken is answered with null.
 */
export class ResourceWrites {
  private readonly store: ResourceWriteStore;
  private readonly ports: ResourceWritePorts;
  private readonly waiting = new Map<string, Waiting>();
  private timer: number | undefined;
  private unsubscribe: (() => void) | null = null;

  constructor(store: ResourceWriteStore, ports: ResourceWritePorts) {
    this.store = store;
    this.ports = ports;
  }

  start(): void {
    this.unsubscribe ??= this.store.subscribe((state) => {
      if (this.waiting.size > 0 && !holds(state)) this.schedule();
    });
  }

  /** Ends the writes: edits that wait are refused. */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== undefined) this.ports.clearTimer(this.timer);
    this.timer = undefined;
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const { answer } of waiting) answer(null);
  }

  write(edit: TokenResourceEdit, answer: ResourceAnswer): void {
    const state = this.store.getState();
    if (!loaded(state)) return answer(null);
    if (!holds(state)) return this.apply(edit, answer);
    // The latest word of the player wins; the sheet that follows it answers the earlier one too.
    this.waiting.set(`${edit.tokenId}\n${edit.key}`, { edit, answer });
  }

  /** Takes the waiting edits once the write that let go has finished (its listeners run inside the drag's undo step). */
  private schedule(): void {
    if (this.timer !== undefined) return;
    this.timer = this.ports.setTimer(() => {
      this.timer = undefined;
      this.flush();
    }, 0);
  }

  private flush(): void {
    if (holds(this.store.getState())) return;
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const { edit, answer } of waiting) this.apply(edit, answer);
  }

  private apply(edit: TokenResourceEdit, answer: ResourceAnswer): void {
    const state = this.store.getState();
    const token = state.objects.tokens[edit.tokenId];
    const { max } = edit;
    const value = token === undefined || !loaded(state) || this.ports.ownerOf(edit.tokenId) !== edit.from ? null : editableValue(token, this.ports.definitions(), edit.key, edit.tracked, max !== undefined);
    if (token === undefined || value === null) return answer(null);
    const next = max === undefined ? withCurrent(value, edit.current) : withMaxValue(value, edit.current, max.value, max.fixed);
    const byHand = max?.route.kind === 'hand';
    const newlyByHand = byHand && token.overriddenMax?.includes(edit.key) !== true;
    if (next.current !== value.current || next.max !== value.max || newlyByHand) {
      const update = resourceUpdate(token, edit.key, next, byHand);
      this.store.setState((draft) => {
        const live = draft.objects.tokens[edit.tokenId];
        if (live !== undefined) Object.assign(live, update);
      });
    }
    if (max === undefined) answer(next.current);
    else answer(next.current, next.max);
  }
}
