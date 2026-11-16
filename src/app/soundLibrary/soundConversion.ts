import type { SoundRefusal } from '../sound/codec/demux/demuxTypes';

/** How far a sound's playable copy has come on this device. */
export type SoundConversion =
  | { state: 'not-converted' }
  /** `progress` runs from 0 to 1, null while it is not known. */
  | { state: 'converting'; progress: number | null }
  | { state: 'ready' }
  /** It cannot become a copy: the file says why, until the file changes. */
  | { state: 'refused'; reason: SoundRefusal };

export const NOT_CONVERTED: SoundConversion = { state: 'not-converted' };
