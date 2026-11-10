/**
 * Rests the GM took, as they are announced: Atlas's online table writes a `rest` entry in its log
 * for each one taken while a table runs (`onRested`). One list of listeners per app.
 */

import type { App } from 'obsidian';
import type { RestChange, SkippedRule } from './restTypes';

/** A rest that was taken: whose, which button, and what it changed and skipped. */
export interface RestSummary {
  /** The library token that is the character, and its name. */
  readonly characterId: string;
  readonly characterName: string;
  readonly notePath: string;
  readonly button: { readonly id: string; readonly name: string };
  /** The actions picked in the rest's steps, by name, in the order picked. */
  readonly picks: readonly string[];
  /** Every change, each naming the character it was made to (the one resting, or one an action was taken for). */
  readonly changes: readonly RestChange[];
  readonly skipped: readonly SkippedRule[];
  /** The summary as the GM's notice said it. */
  readonly text: string;
}

type RestListener = (summary: RestSummary) => void;

const listeners = new WeakMap<App, Set<RestListener>>();

/** Calls `listener` with every rest the GM takes in this app from now on; returns the function that stops it. */
export function onRested(app: App, listener: RestListener): () => void {
  let set = listeners.get(app);
  if (!set) listeners.set(app, set = new Set());
  set.add(listener);
  return () => { set.delete(listener); };
}

/** Tells every listener of `app` that a rest was taken. */
export function announceRested(app: App, summary: RestSummary): void {
  for (const listener of [...(listeners.get(app) ?? [])]) {
    try {
      listener(summary);
    } catch (error) {
      console.error('[Atlas] A listener of rests failed:', error);
    }
  }
}
