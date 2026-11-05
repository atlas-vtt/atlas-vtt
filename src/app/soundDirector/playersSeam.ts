import type { Mood } from '../sound/soundTypes';
import type { SoundDirectorDeps } from './directorDeps';
import type { AudienceLine, PlayersSounds } from './tableClock';

/** What a table online reads of the library, and tells the Sound page while it runs. */
export class PlayersSeam {
  private current: PlayersSounds | null = null;
  private drop: (() => void) | null = null;
  private dropAudience: (() => void) | null = null;

  constructor(private readonly deps: Pick<SoundDirectorDeps, 'moods' | 'readSceneSound'>, private readonly changed: () => void) {}

  get sounds(): PlayersSounds | null {
    return this.current;
  }

  use(sounds: PlayersSounds | null): void {
    this.drop?.();
    this.current = sounds;
    this.drop = sounds?.onChange(this.changed) ?? null;
    this.changed();
  }

  useAudience(audience: AudienceLine | null, show: (line: string | null, detail: string | null) => void): void {
    this.dropAudience?.();
    this.dropAudience = audience?.onChange(() => show(audience.line(), audience.detail())) ?? null;
    show(audience?.line() ?? null, audience?.detail() ?? null);
  }

  moods(): readonly Mood[] {
    return this.deps.moods.moods();
  }

  /** The moods a scene links, for those that still are. */
  async sceneMoods(scenePath: string): Promise<Mood[]> {
    const sound = await this.deps.readSceneSound(scenePath);
    const ids = [sound?.mood, sound?.combatMood].filter((id) => id !== undefined);
    return ids.flatMap((id) => this.deps.moods.mood(id) ?? []);
  }
}
