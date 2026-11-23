import { CHANNEL_DB_RANGE } from '../services/soundSettings';
import { shownMusic } from '../soundDirector/musicPause';
import type { SoundMix } from '../soundDirector/soundMix';

export const clampDb = (db: number): number => Math.min(CHANNEL_DB_RANGE.max, Math.max(CHANNEL_DB_RANGE.min, db));

/** What a remote's Music key moves and shows: the Sound page's Music fader. Null while the page shows no music. */
export const musicLevel = (mix: SoundMix): number | null => shownMusic(mix)?.gainDb ?? null;

/**
 * What a remote's Ambience key shows: the loudest layer. A press moves every layer by its step, so this moves with
 * it until the loudest reaches the top, and it needs no level of its own a fader drag on the page could leave behind.
 * Null without layers.
 */
export function ambienceLevel(mix: SoundMix): number | null {
  const { layers } = mix.table;
  return layers.length > 0 ? Math.max(...layers.map((play) => play.gainDb)) : null;
}

/** Every layer moved by one difference that takes the loudest to `loudestDb`, each kept within the faders' range. */
export function layersShiftedTo(mix: SoundMix, loudestDb: number): Map<string, number> {
  const loudest = ambienceLevel(mix);
  const deltaDb = loudest === null ? 0 : clampDb(loudestDb) - loudest;
  return new Map(mix.table.layers.map((play) => [play.sound.key, clampDb(play.gainDb + deltaDb)]));
}
