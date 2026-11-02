import type { SoundInfo } from '../soundTypes';

/** Target of the mix, lower than a streaming service's, as several layers sound together. */
const TARGET_LUFS = -20;
const PEAK_CEILING_DB = -1;

/** How far the GM's trim goes either way, in dB. */
export const MAX_TRIM_DB = 24;

export function clampTrim(trimDb: number): number {
  return Math.max(-MAX_TRIM_DB, Math.min(MAX_TRIM_DB, trimDb));
}

/**
 * `min(-20 - lufs, -1 - truePeak) + trim`. A sound too short for a full measuring block has no loudness
 * and goes by its peak alone; a silent one has nothing to raise.
 */
export function soundGainDb(lufs: number, truePeakDb: number, trimDb = 0): number {
  const toTarget = Number.isFinite(lufs) ? TARGET_LUFS - lufs : Infinity;
  const toCeiling = Number.isFinite(truePeakDb) ? PEAK_CEILING_DB - truePeakDb : Infinity;
  const gain = Math.min(toTarget, toCeiling);
  return (Number.isFinite(gain) ? gain : 0) + (Number.isFinite(trimDb) ? clampTrim(trimDb) : 0);
}

export interface SoundMeasure {
  frames: number;
  lufs: number;
  truePeakDb: number;
}

/** What the engine and the table know of a converted sound, from what import measured. */
export function soundInfoOf(key: string, measure: SoundMeasure, record: { trimDb?: number; loop?: { startFrame: number; endFrame: number } } = {}): SoundInfo {
  const info: SoundInfo = { key, frames: measure.frames, gainDb: soundGainDb(measure.lufs, measure.truePeakDb, record.trimDb) };
  if (record.loop) info.loop = record.loop;
  return info;
}
