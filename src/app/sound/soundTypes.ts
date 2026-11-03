import type { MoodCrestId } from '../types/moodCrestPaths';
import type { PinIconId } from '../types/pinIconPaths';

/** A mood's crest: a pin icon, or one of the crests only moods have (`soundLibrary/moodLook.ts`). */
export type MoodIconId = PinIconId | MoodCrestId;

/** A music or ambience file in the vault. Stored in a record file like other assets. */
export type SoundKind = 'music' | 'ambience';

export interface SoundRecord {
  id: string;
  name: string;
  kind: SoundKind;
  filePath: string;
  /** The file's size when the record was made, by which a file gone from its path is found again. */
  audioSize?: number;
  /** Frames at 48 kHz. Unset plays the whole file, looping when the kind or mood asks for it. */
  loop?: { startFrame: number; endFrame: number };
  /** The GM's own correction on top of the measured loudness. */
  trimDb?: number;
  tags?: string[];
}

export const MAX_MOOD_LAYERS = 8;

/** The spaces a mood's reverb can sound like. */
export const ROOM_IDS = ['room', 'hall', 'cave', 'cathedral'] as const;
export type RoomId = (typeof ROOM_IDS)[number];
/** The room of a mood that names none, and of a table before any mood. */
export const DEFAULT_ROOM: RoomId = 'room';

export interface MoodLayer {
  sound: string;
  levelDb: number;
  /** How much of it the mood's room carries, 0 to 1. Unset is dry. */
  reverb?: number;
}

/** How a list goes on past its end. Unset goes round; `one` holds a track for good; `off` stops at the end of the list. */
export type MusicRepeat = 'one' | 'off';

export type MoodMusic =
  | { tracks: string[]; shuffle: boolean; levelDb: number; repeat?: MusicRepeat; reverb?: number }
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
  /** The crest on its tile (`moodLook`). Unset is the default. */
  icon?: MoodIconId;
  /** A name of the pin tones. Unset is the tone of its icon. */
  tone?: string;
  /** The space its reverb sounds like. Unset is `DEFAULT_ROOM`. */
  room?: RoomId;
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
  /**
   * Its copy is still being made: `frames` and `gainDb` are what can be told so far, and the sound plays from the
   * pages written yet, waiting where it runs ahead of them. Never on the wire.
   */
  growing?: true;
}

/** Music being played: enough to go on through the list with nobody telling it to. */
export interface MusicPlay {
  tracks: SoundInfo[];
  seed: number;
  shuffle: boolean;
  /** Table time in ms at which the list began. */
  startAt: number;
  gainDb: number;
  muted?: boolean;
  /** How much of it the room carries, 0 to 1; moves on the play's fade like its gain. Unset is dry. */
  reverb?: number;
  /** Table time at which the fade towards this gain begins, and how long it runs. */
  fade: SoundFade;
  repeat?: MusicRepeat;
  /**
   * Frames of the list, from its first pass on, that lie behind `startAt`: a play that takes a list up in
   * its middle starts there without changing its order or where its pass ends. Unset is 0.
   */
  listFrame?: number;
}

export interface LayerPlay {
  sound: SoundInfo;
  startAt: number;
  gainDb: number;
  muted?: boolean;
  /** As on `MusicPlay`. */
  reverb?: number;
  fade: SoundFade;
}

/** The room the table's reverb sounds like, and the crossfade that brought it. */
export interface SoundRoom {
  id: RoomId;
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
  /** Unset: `DEFAULT_ROOM`, as it always was. */
  room?: SoundRoom;
}
