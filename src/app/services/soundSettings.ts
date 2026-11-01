/** The GM's levels and how sound follows the table; kept in the plugin's data beside the dice volume. */
export interface SoundSettings {
  musicDb: number;
  ambienceDb: number;
  masterDb: number;
  /** The fade of a mood made now, and of a layer added or taken away by hand. */
  fadeSeconds: number;
  /** Whether a presented scene's mood and a fight's mood play by themselves. */
  followScenes: boolean;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { musicDb: 0, ambienceDb: -6, masterDb: 0, fadeSeconds: 4, followScenes: true };

export const CHANNEL_DB_RANGE = { min: -40, max: 6 } as const;
export const MAX_FADE_SECONDS = 30;

function readDb(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(CHANNEL_DB_RANGE.max, Math.max(CHANNEL_DB_RANGE.min, value)) : fallback;
}

/** The stored settings, which a hand or a sync tool may have changed: what cannot be read is the default. */
export function readSoundSettings(value: unknown): SoundSettings {
  const stored: Record<string, unknown> = typeof value === 'object' && value !== null ? { ...value } : {};
  const { fadeSeconds, followScenes } = stored;
  return {
    musicDb: readDb(stored.musicDb, DEFAULT_SOUND_SETTINGS.musicDb),
    ambienceDb: readDb(stored.ambienceDb, DEFAULT_SOUND_SETTINGS.ambienceDb),
    masterDb: readDb(stored.masterDb, DEFAULT_SOUND_SETTINGS.masterDb),
    fadeSeconds: typeof fadeSeconds === 'number' && Number.isFinite(fadeSeconds) ? Math.min(MAX_FADE_SECONDS, Math.max(0, fadeSeconds)) : DEFAULT_SOUND_SETTINGS.fadeSeconds,
    followScenes: followScenes !== false,
  };
}
