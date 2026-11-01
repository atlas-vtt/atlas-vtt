import type { App } from 'obsidian';
import type { SoundRecord } from '../sound/soundTypes';

/** How far a sound's playable copy has come on this device. */
export type SoundConversion =
  | { state: 'not-converted' }
  /** `progress` runs from 0 to 1, null while it is not known. */
  | { state: 'converting'; progress: number | null }
  | { state: 'ready' };

/**
 * What the sound's owner on this device tells the library about each sound's copy. `stateOf`
 * answers with the same object while a sound's state is the same, since cards read it on every render.
 */
export interface SoundConversionState {
  stateOf(sound: SoundRecord): SoundConversion;
  onChanged(listener: () => void): () => void;
}

const NOT_CONVERTED: SoundConversion = { state: 'not-converted' };

const NOTHING_CONVERTED: SoundConversionState = {
  stateOf: () => NOT_CONVERTED,
  onChanged: () => () => undefined,
};

const sources = new WeakMap<App, SoundConversionState>();

/** Who reports conversions for this app; until someone does, no sound is converted. */
export const soundConversionOf = (app: App): SoundConversionState => sources.get(app) ?? NOTHING_CONVERTED;

/** Hands the reports to `source` until the returned function is called. */
export function provideSoundConversion(app: App, source: SoundConversionState): () => void {
  sources.set(app, source);
  return () => {
    if (sources.get(app) === source) sources.delete(app);
  };
}
