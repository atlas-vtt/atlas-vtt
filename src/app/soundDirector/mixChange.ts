import type { Mood, MoodLayer, MoodMusic } from '../sound/soundTypes';

const LEVEL_TOLERANCE_DB = 0.01;

function sameLevel(a: number, b: number): boolean {
  return Math.abs(a - b) < LEVEL_TOLERANCE_DB;
}

function sameMusic(saved: MoodMusic, now: MoodMusic, known: (id: string) => boolean): boolean {
  if (saved === 'keep') return true;
  if (saved === 'none' || now === 'none' || now === 'keep') return saved === now;
  const tracks = saved.tracks.filter(known);
  if (tracks.length === 0) return now.tracks.length === 0;
  // A mix's list takes each track as its copy comes, so its order says nothing yet.
  return tracks.length === now.tracks.length
    && tracks.every((track) => now.tracks.includes(track))
    && saved.shuffle === now.shuffle
    && sameLevel(saved.levelDb, now.levelDb);
}

function sameLayers(saved: readonly MoodLayer[], now: readonly MoodLayer[], known: (id: string) => boolean): boolean {
  const layers = saved.filter((layer) => known(layer.sound));
  return layers.length === now.length && layers.every((layer) => now.some((other) => other.sound === layer.sound && sameLevel(other.levelDb, layer.levelDb)));
}

/**
 * Whether the mix is no longer what its mood says, as Save to mood would see it: `now` is what it would
 * save as. A sound the mood names that was deleted is not missed, and a mood that leaves the music alone
 * does not mind what it does.
 */
export function mixDiffersFrom(mood: Pick<Mood, 'music' | 'layers'>, now: { music: MoodMusic; layers: readonly MoodLayer[] }, known: (id: string) => boolean): boolean {
  return !sameMusic(mood.music, now.music, known) || !sameLayers(mood.layers, now.layers, known);
}
