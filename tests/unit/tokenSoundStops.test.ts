// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fadeTokenSoundsWithTable } from '@/app/audio/tokenSoundStops';
import { directorRig, mood, record, settle, type DirectorRig } from '../helpers/soundDirectorRig';

/** A table playing a mood, with token sounds wired to it: `stop` is told when they must fade, and over how long. */
async function playingRig(): Promise<{ rig: DirectorRig; stop: ReturnType<typeof vi.fn>; release: () => void }> {
  const rig = directorRig([record('rain')]);
  await settle();
  await rig.director.shelf.refresh();
  rig.director.press(mood('tavern', ['rain']));
  await vi.advanceTimersByTimeAsync(5000);
  const stop = vi.fn();
  const release = fadeTokenSoundsWithTable(rig.director, stop, () => rig.settings.fadeSeconds);
  return { rig, stop, release };
}

describe('token sounds and the table', () => {
  let rig: DirectorRig | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    rig?.director.destroy();
    rig = undefined;
    vi.useRealTimers();
  });

  it('fades token sounds with the mix when Stop all silences the table', async () => {
    const wired = await playingRig();
    rig = wired.rig;

    rig.director.desk.toggleSilence();

    expect(wired.stop).toHaveBeenCalledOnce();
    expect(wired.stop).toHaveBeenCalledWith(2);
  });

  it('fades over the GM\'s fade when it is shorter', async () => {
    const wired = await playingRig();
    rig = wired.rig;
    rig.settings.fadeSeconds = 1;

    rig.director.desk.toggleSilence();

    expect(wired.stop).toHaveBeenCalledWith(1);
  });

  it('leaves token sounds alone when Bring back starts the mix again', async () => {
    const wired = await playingRig();
    rig = wired.rig;

    rig.director.desk.toggleSilence();
    rig.director.desk.toggleSilence();

    expect(rig.director.snapshot().mix.table.silenced).toBe(false);
    expect(wired.stop).toHaveBeenCalledOnce();
  });

  it('stops nothing more while the silence holds, so a token sound pressed then plays', async () => {
    const wired = await playingRig();
    rig = wired.rig;
    rig.director.desk.toggleSilence();

    rig.director.setChannelLevels({ masterDb: -3 }, false);

    expect(rig.director.snapshot().mix.table.silenced).toBe(true);
    expect(wired.stop).toHaveBeenCalledOnce();
  });

  it('leaves token sounds alone when only music and ambience are stopped', async () => {
    const wired = await playingRig();
    rig = wired.rig;

    rig.director.stop();

    expect(wired.stop).not.toHaveBeenCalled();
  });

  it('fades token sounds when Sound is switched off', async () => {
    const wired = await playingRig();
    rig = wired.rig;

    rig.settings.on = false;
    rig.fireSettings();

    expect(rig.director.isOn).toBe(false);
    expect(wired.stop).toHaveBeenCalledOnce();
  });

  it('listens no more once released', async () => {
    const wired = await playingRig();
    rig = wired.rig;

    wired.release();
    rig.director.desk.toggleSilence();

    expect(wired.stop).not.toHaveBeenCalled();
  });
});
