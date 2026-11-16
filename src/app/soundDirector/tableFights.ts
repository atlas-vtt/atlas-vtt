import type { Mood, SceneSound } from '../sound/soundTypes';
import type { LastMix } from './deviceFacts';
import type { SoundDirectorDeps } from './directorDeps';
import { watchFights, type FightStore } from './fightWatch';
import { SceneFollow } from './sceneFollow';

export interface TableFightsHost {
  isOn(): boolean;
  activeMoodId(): string | null;
  play(mood: Mood): void;
  snapshot(): LastMix;
  restore(last: LastMix): void;
}

/** The map views' stores, heard for fights, and through them the links of scenes that are open. */
export class TableFights {
  readonly follow: SceneFollow<LastMix>;
  private readonly views = new Map<string, { store: FightStore; stop: () => void }>();

  constructor(private readonly deps: Pick<SoundDirectorDeps, 'settings' | 'presented' | 'moods' | 'readSceneSound'>, host: TableFightsHost) {
    this.follow = new SceneFollow<LastMix>({
      isFollowing: () => host.isOn() && deps.settings.getSoundSettings().followScenes,
      presented: () => deps.presented.get(),
      sceneSoundOf: (path) => this.sceneSoundOf(path),
      linkedMood: (id) => this.linkedMood(id),
      activeMoodId: () => host.activeMoodId(),
      play: (mood) => host.play(mood),
      snapshot: () => host.snapshot(),
      restore: (last) => host.restore(last),
      after: (ms, run) => {
        const timer = window.setTimeout(run, ms);
        return () => window.clearTimeout(timer);
      },
    });
  }

  join(viewId: string, store: FightStore): void {
    this.leave(viewId);
    const stop = watchFights(store, {
      started: (path, sound) => this.follow.fightStarted(path, sound),
      ended: (path) => this.follow.fightEnded(path),
    });
    this.views.set(viewId, { store, stop });
  }

  leave(viewId: string): void {
    this.views.get(viewId)?.stop();
    this.views.delete(viewId);
  }

  dispose(): void {
    for (const { stop } of this.views.values()) stop();
    this.views.clear();
    this.follow.dispose();
  }

  private sceneSoundOf(path: string): Promise<SceneSound | null> {
    const open = [...this.views.values()].map(({ store }) => store.getState()).find((state) => state.mapPath === path);
    return open ? Promise.resolve(open.sound) : this.deps.readSceneSound(path);
  }

  private async linkedMood(moodId: string): Promise<Mood | null> {
    await this.deps.moods.whenLoaded();
    return this.deps.moods.mood(moodId);
  }
}
