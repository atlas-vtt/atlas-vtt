import { useState, useSyncExternalStore } from 'react';
import { clearTagsMessage, toggleTagMessage, type AtlasMessage } from './armariumMessages';
import type { StoreTags } from './storeTags';

/**
 * The store's tags as the sidebar shows them. `waiting`: the page has not said them yet. `none`: it did not say them in
 * time (an Armarium page from before the sidebar showed its tags, or one that could not load).
 */
export type StoreTagsState =
  | { status: 'waiting' }
  | { status: 'ready'; tags: StoreTags }
  | { status: 'none' };

const WAITING: StoreTagsState = { status: 'waiting' };
const NONE: StoreTagsState = { status: 'none' };

/** How long the sidebar waits for the page's tags before it says there are none. */
const ANSWER_WITHIN_MS = 15_000;

/**
 * Links the asset manager's sidebar with the Armarium page in its frame. The page holds the filter: the sidebar shows
 * what the page last said (`receive`) and hands every press to the page (`toggle`, `clear`), which applies its own
 * rules and says the new state. One per asset manager; the frame's bridge connects it while the store is shown.
 */
export class StoreTagFilter {
  private state: StoreTagsState = WAITING;
  private send: ((message: AtlasMessage) => void) | null = null;
  private timer: number | null = null;
  private readonly listeners = new Set<() => void>();

  /** Starts a frame's link: what the last frame said is forgotten. Returns its end. */
  connect(send: (message: AtlasMessage) => void): () => void {
    this.send = send;
    this.publish(WAITING);
    this.stopTimer();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (this.state.status === 'waiting') this.publish(NONE);
    }, ANSWER_WITHIN_MS);
    return () => {
      if (this.send !== send) return;
      this.send = null;
      this.stopTimer();
      this.publish(WAITING);
    };
  }

  receive(tags: StoreTags): void {
    this.stopTimer();
    this.publish({ status: 'ready', tags });
  }

  toggle(tag: string): void {
    this.send?.(toggleTagMessage(tag));
  }

  clear(): void {
    this.send?.(clearTagsMessage());
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly snapshot = (): StoreTagsState => this.state;

  private publish(next: StoreTagsState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private stopTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}

/** One filter for the life of the component. */
export function useStoreTagFilter(): StoreTagFilter {
  return useState(() => new StoreTagFilter())[0];
}

export function useStoreTags(filter: StoreTagFilter): StoreTagsState {
  return useSyncExternalStore(filter.subscribe, filter.snapshot);
}
