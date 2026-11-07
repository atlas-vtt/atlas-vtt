import { describe, expect, it } from 'vitest';
import type { SoundInfo } from '@/app/sound/soundTypes';
import { addLayer, setMusicLevel, startMusic } from '@/app/soundDirector/liveEdits';
import { editPausedMusic, pauseMusic, pauseOnShiftedClock, resumeMusic, shownMusic, withPauseStillMeant } from '@/app/soundDirector/musicPause';
import { musicPosition } from '@/app/soundDirector/musicList';
import { EMPTY_MIX, mixAsMood, type SoundMix } from '@/app/soundDirector/soundMix';
import { EMPTY_TABLE_SOUND } from '@/app/soundDirector/tableSound';

const RATE = 48_000;
const track = (key: string, seconds = 60): SoundInfo => ({ key, frames: seconds * RATE, gainDb: 0 });
const RAIN = track('rain', 30);

function playing(): SoundMix {
  const withMusic = startMusic(EMPTY_TABLE_SOUND, [track('a'), track('b')], false, -4, 7, 0, 0, 0);
  return { ...EMPTY_MIX, table: addLayer(withMusic, RAIN, 0, 0, 0, 0) };
}

const at = (mix: SoundMix, now: number): { key: string; seconds: number } | null => {
  const play = mix.table.music;
  const position = play && musicPosition(play, now);
  return position ? { key: position.track.key, seconds: Math.round(position.frame / RATE) } : null;
};

describe('pausing the music', () => {
  it('stops the music where it is and leaves the ambience playing', () => {
    const paused = pauseMusic(playing(), 70_000);
    expect(paused.table.music).toBeNull();
    expect(paused.table.layers.map((layer) => layer.sound.key)).toEqual(['rain']);
    expect(paused.table.outgoing).toHaveLength(1);
    expect(paused.paused?.at).toBe(70_000);
    expect(shownMusic(paused)?.tracks.map((one) => one.key)).toEqual(['a', 'b']);
  });

  it('goes on from the same track and second however long it was paused', () => {
    const before = at(playing(), 70_000);
    const resumed = resumeMusic(pauseMusic(playing(), 70_000), 500_000);
    expect(before).toEqual({ key: 'b', seconds: 10 });
    expect(at(resumed, 500_000)).toEqual(before);
    expect(at(resumed, 505_000)).toEqual({ key: 'b', seconds: 15 });
    expect(resumed.paused).toBeUndefined();
  });

  it('does nothing without music, twice, or before a list has begun', () => {
    const none = { ...EMPTY_MIX };
    expect(pauseMusic(none, 1000)).toBe(none);
    const once = pauseMusic(playing(), 1000);
    expect(pauseMusic(once, 2000)).toBe(once);
    const coming = { ...EMPTY_MIX, table: startMusic(EMPTY_TABLE_SOUND, [track('a')], false, 0, 1, 5000, 0, 0) };
    expect(pauseMusic(coming, 1000)).toBe(coming);
    expect(resumeMusic(playing(), 1000)).toEqual(playing());
  });

  it('ends once anything starts music, and keeps edits made meanwhile', () => {
    const paused = pauseMusic(playing(), 10_000);
    const louder = editPausedMusic(paused, (play) => setMusicLevel({ ...paused.table, music: play }, 2, 11_000).music);
    expect(louder.paused?.play.gainDb).toBe(2);
    expect(resumeMusic(louder, 20_000).table.music?.gainDb).toBe(2);
    const other = { ...paused, table: startMusic(paused.table, [track('z')], false, 0, 1, 12_000, 0, 0) };
    expect(withPauseStillMeant(other).paused).toBeUndefined();
    expect(withPauseStillMeant(paused)).toBe(paused);
  });

  it('is still the mix\'s music when it is saved as a mood', () => {
    const mood = mixAsMood(pauseMusic(playing(), 10_000), (key) => key, 4, 20_000);
    expect(mood.music).toMatchObject({ tracks: ['a', 'b'], levelDb: -4 });
  });

  it('keeps its position when the clock steps', () => {
    const paused = pauseMusic(playing(), 70_000).paused!;
    const shifted = pauseOnShiftedClock(paused, 5_000);
    const resumed = resumeMusic({ ...EMPTY_MIX, paused: shifted }, 900_000);
    expect(at(resumed, 900_000)).toEqual({ key: 'b', seconds: 10 });
  });
});
