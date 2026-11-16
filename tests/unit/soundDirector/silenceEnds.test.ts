// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desiredSound } from '@/app/sound/engine/desiredSound';
import { directorRig, mood, record, settle, type DirectorRig } from '../../helpers/soundDirectorRig';

const RAIN = record('rain');
const WIND = record('wind');
const SONG = record('song', 'music');

async function silencedRig(): Promise<DirectorRig> {
  const rig = directorRig([RAIN, WIND, SONG]);
  await settle();
  await rig.director.shelf.refresh();
  rig.director.press(mood('tavern', ['rain']));
  await vi.advanceTimersByTimeAsync(5000);
  rig.director.desk.toggleSilence();
  await vi.advanceTimersByTimeAsync(5000);
  return rig;
}

/** Sources that hold sound: a gesture's unlock starts one of a single frame. */
const sounding = (rig: DirectorRig): number => rig.contexts.at(-1)?.playing().filter((source) => (source.buffer?.length ?? 0) > 1).length ?? 0;

describe('a Silence', () => {
  let rig: DirectorRig;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    rig?.director.destroy();
    vi.useRealTimers();
  });

  it('goes with the mix: Clear mix, then a sound, is heard', async () => {
    rig = await silencedRig();
    expect(sounding(rig)).toBe(0);
    rig.director.stop();
    const { table } = rig.director.snapshot().mix;
    expect(table.silenced).toBe(false);
    // Nothing that was silent may come up with the silence going.
    expect(table.outgoingLayers).toEqual([]);
    expect(desiredSound(table, rig.director.now() + 5000).voices).toEqual([]);
    rig.director.desk.addSound(WIND);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(rig.director.snapshot().mix.table.silenced).toBe(false);
    expect(sounding(rig)).toBe(1);
  });

  it('ends for the first sound of an empty mix, however the mix came to be empty', async () => {
    rig = await silencedRig();
    const key = rig.director.snapshot().mix.table.layers[0]?.sound.key ?? '';
    rig.director.desk.removeLayer('rain', key);
    rig.director.desk.addSound(SONG);
    const { table } = rig.director.snapshot().mix;
    expect(table.silenced).toBe(false);
    expect(table.outgoingLayers).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(sounding(rig)).toBe(1);
  });

  it('holds for a sound joining a mix that still holds another', async () => {
    rig = await silencedRig();
    rig.director.desk.addSound(WIND);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(rig.director.snapshot().mix.table.silenced).toBe(true);
    expect(sounding(rig)).toBe(0);
  });
});
