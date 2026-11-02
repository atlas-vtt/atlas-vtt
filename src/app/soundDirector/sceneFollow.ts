import type { Mood, SceneSound } from '../sound/soundTypes';
import type { PresentedScene } from '../services/presentedScene';

/** A scene's mood waits this long, so passing through scenes changes nothing. */
export const SCENE_FOLLOW_DELAY_MS = 2000;

export interface SceneFollowDeps<Snapshot> {
  isFollowing(): boolean;
  presented(): PresentedScene | null;
  /** The scene's links, as its open view holds them or else its file; null when it has none. */
  sceneSoundOf(path: string): Promise<SceneSound | null>;
  /** The mood a link names; a mood that is gone reads as no link. */
  linkedMood(moodId: string): Promise<Mood | null>;
  /** The mood that plays, if the mix is that mood. */
  activeMoodId(): string | null;
  play(mood: Mood): void;
  /** What plays now, to come back to. */
  snapshot(): Snapshot;
  restore(snapshot: Snapshot): void;
  after(ms: number, run: () => void): () => void;
}

/**
 * What the table's course does to the sound: the presented scene's mood after a short wait, a fight's
 * mood while it lasts, and back after it. A scene without a link changes nothing. Anything the GM presses
 * stands until the next change of scene or fight, which this only ever reacts to.
 */
export class SceneFollow<Snapshot> {
  private cancelPending: (() => void) | null = null;
  private beforeFight: Snapshot | null = null;
  /** A read answering after a later change or press must not act. */
  private generation = 0;

  constructor(private readonly deps: SceneFollowDeps<Snapshot>) {}

  presentedChanged(): void {
    this.cancel();
    if (!this.deps.isFollowing()) return;
    const generation = this.generation;
    this.cancelPending = this.deps.after(SCENE_FOLLOW_DELAY_MS, () => {
      this.cancelPending = null;
      void this.applyPresented(generation);
    });
  }

  /** A press beats a scene's mood still on its way. */
  manualPress(): void {
    this.cancel();
  }

  fightStarted(scenePath: string, sound: SceneSound | null): void {
    this.cancel();
    if (!this.deps.isFollowing() || !sound?.combatMood || !this.isTableScene(scenePath)) return;
    const generation = this.generation;
    void this.deps.linkedMood(sound.combatMood).then((linked) => {
      if (!linked || generation !== this.generation || !this.deps.isFollowing()) return;
      this.beforeFight ??= this.deps.snapshot();
      this.deps.play(linked);
    });
  }

  fightEnded(scenePath: string): void {
    if (!this.isTableScene(scenePath)) return;
    const snapshot = this.beforeFight;
    this.beforeFight = null;
    this.cancel();
    if (snapshot !== null && this.deps.isFollowing()) this.deps.restore(snapshot);
  }

  dispose(): void {
    this.cancel();
    this.beforeFight = null;
  }

  private cancel(): void {
    this.generation++;
    this.cancelPending?.();
    this.cancelPending = null;
  }

  /** A fight in a scene being prepared on another tab is no fight at the table. */
  private isTableScene(scenePath: string): boolean {
    const presented = this.deps.presented();
    return presented === null || presented.filePath === scenePath;
  }

  private async applyPresented(generation: number): Promise<void> {
    const scene = this.deps.presented();
    if (!scene) return;
    const sound = await this.deps.sceneSoundOf(scene.filePath);
    const linked = sound?.mood ? await this.deps.linkedMood(sound.mood) : null;
    if (!linked || generation !== this.generation || !this.deps.isFollowing()) return;
    this.beforeFight = null;
    if (this.deps.activeMoodId() !== linked.id) this.deps.play(linked);
  }
}
