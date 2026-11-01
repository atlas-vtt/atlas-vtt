/** A music or ambience file in the vault. Stored in a record file like other assets. */
export type SoundKind = 'music' | 'ambience';

export type SoundLicence = 'unknown' | 'cc0' | 'cc-by' | 'other';
export type SoundStreaming = 'unknown' | 'licensed' | 'not-for-streaming';

export interface SoundRecord {
  id: string;
  name: string;
  kind: SoundKind;
  filePath: string;
  /** Frames at 48 kHz. Unset plays the whole file, looping when the kind or mood asks for it. */
  loop?: { startFrame: number; endFrame: number };
  /** The GM's own correction on top of the measured loudness. */
  trimDb?: number;
  tags?: string[];
  licence: SoundLicence;
  credit?: string;
  sourceUrl?: string;
  streaming: SoundStreaming;
}

export const MAX_MOOD_LAYERS = 8;

export interface MoodLayer {
  sound: string;
  levelDb: number;
}

export type MoodMusic =
  | { tracks: string[]; shuffle: boolean; levelDb: number }
  | 'keep'
  | 'none';

/** A saved mix: pressing it makes the room sound like this. One JSON file per mood. */
export interface Mood {
  id: string;
  name: string;
  order: number;
  fadeSeconds: number;
  music: MoodMusic;
  layers: MoodLayer[];
}

/** Optional field of a scene file, outside `objects`. */
export interface SceneSound {
  mood?: string;
  combatMood?: string;
}

/** What the engine reads a sound through: the Opus cache on the GM's side, the store on a page. */
export interface SoundBytes {
  readonly byteLength: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

/** What the engine knows of a converted sound. */
export interface SoundInfo {
  /** Opaque on the wire: never a name. */
  key: string;
  frames: number;
  /** Linear-free, in dB: `min(target - lufs, ceiling - truePeak) + trim`. */
  gainDb: number;
  loop?: { startFrame: number; endFrame: number };
}

/** Music being played: enough to go on through the list with nobody telling it to. */
export interface MusicPlay {
  tracks: SoundInfo[];
  seed: number;
  shuffle: boolean;
  /** Table time in ms at which the list began. */
  startAt: number;
  gainDb: number;
  /** Table time at which the fade towards this gain begins, and how long it runs. */
  fade: SoundFade;
}

export interface LayerPlay {
  sound: SoundInfo;
  startAt: number;
  gainDb: number;
  muted?: boolean;
  fade: SoundFade;
}

/**
 * A fade on the table's clock. A play comes in from silence when its fade begins where it begins
 * (`fade.at === startAt`); any other fade moves what already sounds to the play's `gainDb`.
 */
export interface SoundFade {
  at: number;
  ms: number;
}

/** The whole small state of a table's sound. Sent whole on each change; idempotent. */
export interface TableSound {
  revision: number;
  silenced: boolean;
  silenceFade: SoundFade;
  music: MusicPlay | null;
  /** Fading out; dropped once its fade has ended. */
  outgoing: MusicPlay[];
  layers: LayerPlay[];
  outgoingLayers: LayerPlay[];
}
