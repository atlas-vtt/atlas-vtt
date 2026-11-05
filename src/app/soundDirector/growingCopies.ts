import type { GrowingCopy, GrowingPages } from '../sound/codec/growingCopy';
import { WHOLE_DECODE_FRAMES } from '../sound/codec/seekTable';
import { soundGainDb } from '../sound/codec/soundInfo';
import type { SoundInfo } from '../sound/soundTypes';

/**
 * A copy being made plays once it holds this much: a minute of sound tells its loudness well enough that what
 * it is evened out to moves little when the whole is measured, and it is about half a second of converting.
 * Shorter sounds wait for their whole copy, which takes no longer.
 */
export const STREAM_START_FRAMES = WHOLE_DECODE_FRAMES;
/** A growing copy's loudness is told again once what it is evened out to has moved this far. */
const GAIN_STEP_DB = 0.5;

/** A copy being made may play: it holds its first minute, the sound is long enough to be read in windows, and its loudness can be told. */
export const isPlayable = (growing: GrowingCopy): boolean =>
  growing.frames >= STREAM_START_FRAMES && growing.estimatedFrames > WHOLE_DECODE_FRAMES && (Number.isFinite(growing.lufs) || Number.isFinite(growing.truePeakDb));

/** What the engine plays a copy being made by: its length as far as can be told, and the gain the table was last told. Null until it may play. */
export function growingInfo(key: string, growing: GrowingCopy, toldGainDb: number | null, trim: Pick<SoundInfo, 'loop'> & { trimDb?: number }): SoundInfo | null {
  if (!isPlayable(growing) || toldGainDb === null) return null;
  return { key, frames: Math.max(growing.estimatedFrames, growing.frames), gainDb: toldGainDb, ...(trim.loop && { loop: trim.loop }), growing: true };
}

/**
 * Adds pages to a copy being made and says the gain to tell the table: the same number while nothing worth
 * telling moved (it may not play yet, or its gain moved less than a step), so the table changes seldom.
 */
export function grownGain(growing: GrowingCopy, pages: GrowingPages, toldGainDb: number | null, trimDb?: number): number | null {
  growing.add(pages);
  if (!isPlayable(growing)) return toldGainDb;
  const gainDb = soundGainDb(growing.lufs, growing.truePeakDb, trimDb);
  return toldGainDb === null || Math.abs(gainDb - toldGainDb) >= GAIN_STEP_DB ? gainDb : toldGainDb;
}
