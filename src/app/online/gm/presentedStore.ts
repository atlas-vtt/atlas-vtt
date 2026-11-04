import type { SceneState, SceneStore } from './atlasView.ts';
import { showsPresented, type PresentedTab } from './presentedScene.ts';

/**
 * The shared view's store as players may see it. All scene tabs of an Atlas view share one store, so
 * while the GM works on another tab it holds another scene. While the view shows the scene Atlas presents
 * to its player view this is the store itself; otherwise it holds, as Atlas's player window holds its last
 * frame: it reads as the last state it showed of the presented scene, marked loading (so nothing is sent
 * and players' moves are refused), takes no writes and tells its listeners nothing until the presented
 * scene is shown again. Atlas switches the active tab before it loads the next scene, so the hold begins
 * while the store still holds the presented one.
 */
export class PresentedStore implements SceneStore {
  private readonly real: SceneStore;
  private presented: PresentedTab | null;
  private last: SceneState;
  private frozen: SceneState | null = null;
  private holding = false;
  private readonly onHold: () => void;
  private readonly listeners = new Set<(state: SceneState) => void>();
  private readonly stops: (() => void)[];

  /** `real` shows the presented tab now; `onHold` runs as the hold begins, while writes still reach `real`. */
  constructor(real: SceneStore, presented: PresentedTab, onHold: () => void) {
    this.real = real;
    this.presented = presented;
    this.onHold = onHold;
    this.last = real.getState();
    this.stops = [real.subscribe((state) => this.check(state, true)), presented.tabs.subscribe(() => this.check(real.getState(), false))];
  }

  /** Atlas's history of the store, so that player drags stay one undo step. */
  get temporal(): unknown {
    return (this.real as { temporal?: unknown }).temporal;
  }

  /** Whether players are held on the last state they saw. */
  get held(): boolean {
    return this.frozen !== null;
  }

  /** The level of a scene with several that Atlas presents (the eye); unset is the first. */
  get presentedLevel(): string | undefined {
    return this.presented?.levelId;
  }

  /** Atlas presents this tab of the view now, or none of its tabs (null). */
  present(presented: PresentedTab | null): void {
    this.presented = presented;
    this.check(this.real.getState(), false);
  }

  getState(): SceneState {
    return this.frozen ?? this.real.getState();
  }

  setState(recipe: (draft: SceneState) => void): void {
    if (this.frozen === null) this.real.setState(recipe);
  }

  subscribe(listener: (state: SceneState) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  dispose(): void {
    for (const stop of this.stops) stop();
    this.listeners.clear();
  }

  private check(state: SceneState, changed: boolean): void {
    if (this.presented !== null && showsPresented(state, this.presented)) {
      this.last = state;
      if (this.frozen === null && !changed) return;
      this.frozen = null;
      this.notify(state);
    } else if (this.frozen === null) this.hold();
  }

  /** Listeners hear the presented scene unloading (writes still reach the store, so player drags end there), then it is frozen. */
  private hold(): void {
    if (this.holding) return;
    this.holding = true;
    try {
      const frozen: SceneState = { ...this.last, isMapLoading: true };
      this.onHold();
      this.notify(frozen);
      this.frozen = frozen;
    } finally {
      this.holding = false;
    }
  }

  private notify(state: SceneState): void {
    for (const listener of [...this.listeners]) listener(state);
  }
}
