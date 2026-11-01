import type { Mood } from '../sound/soundTypes';
import type { SoundDirectorDeps } from './directorDeps';
import type { AudienceLine, PlayersSounds, SceneMoods } from './tableClock';

/** What a table online reads of the library, and tells the Sound page while it runs. */
export class PlayersSeam {
  private current: PlayersSounds | null = null;
  private drop: (() => void) | null = null;
  private dropAudience: (() => void) | null = null;

  constructor(private readonly deps: Pick<SoundDirectorDeps, 'moods' | 'readSceneSound' | 'collectionOf'>, private readonly changed: () => void) {}

  get sounds(): PlayersSounds | null {
    return this.current;
  }

  use(sounds: PlayersSounds | null): void {
    this.drop?.();
    this.current = sounds;
    this.drop = sounds?.onChange(this.changed) ?? null;
    this.changed();
  }

  useAudience(audience: AudienceLine | null, show: (line: string | null) => void): void {
    this.dropAudience?.();
    this.dropAudience = audience?.onChange(() => show(audience.line())) ?? null;
    show(audience?.line() ?? null);
  }

  moodsOf(collectionId: string): readonly Mood[] {
    return this.deps.moods.moodsOf(collectionId);
  }

  async sceneMoods(scenePath: string): Promise<SceneMoods> {
    const collectionId = this.deps.collectionOf(scenePath);
    const sound = await this.deps.readSceneSound(scenePath);
    const ids = [sound?.mood, sound?.combatMood].filter((id) => id !== undefined);
    return { collectionId, linked: ids.flatMap((id) => this.deps.moods.mood(collectionId, id) ?? []) };
  }
}
