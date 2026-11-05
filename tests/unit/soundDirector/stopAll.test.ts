import { describe, expect, it } from 'vitest';
import type { SoundInfo } from '@/app/sound/soundTypes';
import { addLayer, startMusic } from '@/app/soundDirector/liveEdits';
import { bringBack, pauseMusic, pauseOnShiftedClock, shownMusic, stopEverything, withPauseStillMeant } from '@/app/soundDirector/musicPause';
import { musicPosition } from '@/app/soundDirector/musicList';
import { EMPTY_MIX, type SoundMix } from '@/app/soundDirector/soundMix';
import { EMPTY_TABLE_SOUND } from '@/app/soundDirector/tableSound';

const RATE = 48_000;
const track = (key: string, seconds = 60): SoundInfo => ({ key, frames: seconds * RATE, gainDb: 0 });

function playing(): SoundMix {
  const withMusic = startMusic(EMPTY_TABLE_SOUND, [track('a'), track('b')], false, -4, 7, 0, 0, 0);
  return { ...EMPTY_MIX, table: addLayer(withMusic, track('rain', 30), 0, 0, 0, 0) };
}

const at = (mix: SoundMix, now: number): { key: string; seconds: number } | null => {
  const play = mix.table.music;
  const position = play && musicPosition(play, now);
  return position ? { key: position.track.key, seconds: Math.round(position.frame / RATE) } : null;
};

describe('Stop all', () => {
  it('fades the whole table out and holds the music where it stopped', () => {
    const stopped = stopEverything(playing(), 70_000);
    expect(stopped.table.silenced).toBe(true);
    expect(stopped.table.music).toBeNull();
    expect(stopped.table.layers.map((layer) => layer.sound.key)).toEqual(['rain']);
    expect(stopped.paused).toMatchObject({ at: 70_000, byStop: true });
    expect(shownMusic(stopped)?.tracks.map((one) => one.key)).toEqual(['a', 'b']);
    expect(stopEverything(stopped, 80_000)).toBe(stopped);
  });

  it('brings the music back from the same second however long it was stopped, with the ambience', () => {
    const before = at(playing(), 70_000);
    const back = bringBack(stopEverything(playing(), 70_000), 500_000);
    expect(back.table.silenced).toBe(false);
    expect(back.paused).toBeUndefined();
    expect(back.table.outgoing).toEqual([]);
    expect(at(back, 500_000)).toEqual(before);
    expect(back.table.layers.map((layer) => layer.sound.key)).toEqual(['rain']);
  });

  it('leaves music the GM had paused paused', () => {
    const paused = pauseMusic(playing(), 10_000);
    const stopped = stopEverything(paused, 20_000);
    expect(stopped.paused).toBe(paused.paused);
    const back = bringBack(stopped, 30_000);
    expect(back.table.silenced).toBe(false);
    expect(back.paused).toBe(paused.paused);
  });

  it('keeps its hold across a step of the clock, and gives it up as a plain pause once something else ends the stop', () => {
    const stopped = stopEverything(playing(), 70_000);
    expect(pauseOnShiftedClock(stopped.paused!, 1000)).toMatchObject({ at: 71_000, byStop: true });
    // A mood without music ends the stop: the music stays paused, for the GM to resume.
    const ended = withPauseStillMeant({ ...stopped, table: { ...stopped.table, silenced: false } });
    expect(ended.paused?.at).toBe(70_000);
    expect(ended.paused?.byStop).toBeUndefined();
  });
});
