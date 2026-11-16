// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { AudioBufferCache } from '@/app/audio/AudioBufferCache';
import { followOutputDevice, forgetOutputFollower, listOutputDevices, setOutputDevice } from '@/app/sound/engine/outputDevice';
import { availableHotkeys, MAP_HOTKEYS } from '@/app/keyboard/mapHotkeys';
import { arrowDirection } from '@/app/react/components/dm-screen/screenKeys';
import { moodIndexOfCode } from '@/app/react/components/dm-screen/sound/useSoundKeys';
import { DEFAULT_SOUND_SETTINGS, readSoundSettings } from '@/app/services/soundSettings';
import type { Mood, SoundRecord } from '@/app/sound/soundTypes';
import { loadLastMix, loadOutput, saveLastMix, saveOutput } from '@/app/soundDirector/deviceFacts';
import { moodProblems } from '@/app/soundDirector/moodReadiness';
import { watchFights, type FightState } from '@/app/soundDirector/fightWatch';
import { orderForMove } from '@/app/soundLibrary/moodOrdering';
import type { App } from 'obsidian';

function storage(): Pick<App, 'loadLocalStorage' | 'saveLocalStorage'> {
  const held = new Map<string, unknown>();
  return {
    loadLocalStorage: (key: string) => held.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { held.set(key, value); },
  } as Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;
}

function mood(id: string, order: number, partial: Partial<Mood> = {}): Mood {
  return { id, name: id, order, fadeSeconds: 1, music: 'none', layers: [], ...partial };
}

describe('moving a mood', () => {
  const moods = [mood('a', 1), mood('b', 2), mood('c', 3)];

  it('writes the one mood it moves, between its new neighbours', () => {
    expect(orderForMove(moods, 'a', 1)).toBe(2.5);
    expect(orderForMove(moods, 'c', 0)).toBe(0);
    expect(orderForMove(moods, 'a', 2)).toBe(4);
  });

  it('asks nothing of a mood that is not there or stands alone', () => {
    expect(orderForMove(moods, 'gone', 1)).toBeNull();
    expect(orderForMove([mood('a', 1)], 'a', 0)).toBeNull();
  });
});

describe('what keeps a mood from sounding whole', () => {
  const rain: SoundRecord = { id: 'rain', name: 'Rain', kind: 'ambience', filePath: 'r.ogg' };

  it('names each sound by what it waits for, and a deleted one without a name', () => {
    const states = { hasFile: true, state: { state: 'ready' } as const };
    const shelf = {
      recordOf: (id: string) => (id === 'rain' ? rain : null),
      hasFile: () => states.hasFile,
      stateOf: () => states.state,
    };
    const asked = mood('m', 1, { layers: [{ sound: 'rain', levelDb: 0 }, { sound: 'gone', levelDb: 0 }] });
    expect(moodProblems(asked, shelf)).toEqual([{ kind: 'deleted' }]);
    states.hasFile = false;
    expect(moodProblems(asked, shelf)[0]).toMatchObject({ kind: 'missing', name: 'Rain' });
    states.hasFile = true;
    expect(moodProblems(asked, { ...shelf, stateOf: () => ({ state: 'refused', reason: 'empty' }) })[0]).toEqual({ kind: 'refused', name: 'Rain', reason: 'empty' });
    expect(moodProblems(asked, { ...shelf, stateOf: () => ({ state: 'converting', progress: 0.5 }) })[0]).toEqual({ kind: 'converting', name: 'Rain' });
    expect(moodProblems(asked, { ...shelf, stateOf: () => ({ state: 'not-converted' }) })[0]).toEqual({ kind: 'notConverted', name: 'Rain' });
  });
});

describe('the facts of this device', () => {
  it('reads back what it stored, and what it cannot read is nothing', () => {
    const store = storage();
    expect(loadOutput(store)).toBeNull();
    saveOutput(store, { id: 'usb', label: 'USB' });
    expect(loadOutput(store)).toEqual({ id: 'usb', label: 'USB' });
    store.saveLocalStorage('atlas-vtt:sound-output', { id: 3 });
    expect(loadOutput(store)).toBeNull();
    const last = { mood: { id: 'm' }, mix: { fadeSeconds: 2, music: { tracks: ['a'], shuffle: true, levelDb: -3 }, layers: [{ sound: 'r', levelDb: 0 }] } };
    saveLastMix(store, last);
    expect(loadLastMix(store)).toEqual(last);
    store.saveLocalStorage('atlas-vtt:sound-last', { mix: { music: 7 } });
    expect(loadLastMix(store)).toBeNull();
  });
});

describe('the sound settings', () => {
  it('reads what a hand or a sync tool wrote as far as it can', () => {
    expect(readSoundSettings(undefined)).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(DEFAULT_SOUND_SETTINGS).toMatchObject({ musicDb: 0, ambienceDb: -6 });
    expect(readSoundSettings({ musicDb: 99, ambienceDb: 'x', fadeSeconds: -3, followScenes: false })).toMatchObject({ musicDb: 6, ambienceDb: -6, fadeSeconds: 0, followScenes: false });
  });
});

describe('the keys', () => {
  it('press moods by the key’s place, on any layout', () => {
    expect(moodIndexOfCode('Digit1')).toBe(0);
    expect(moodIndexOfCode('Digit9')).toBe(8);
    expect(moodIndexOfCode('Digit0')).toBe(9);
    expect(moodIndexOfCode('Numpad3')).toBe(2);
    expect(moodIndexOfCode('KeyA')).toBeNull();
    expect(arrowDirection('ArrowUp')).toBe('up');
  });

  it('next mood and Stop all show only while sound is switched on, and only to the GM', () => {
    const ids = (player: boolean, on: boolean): string[] => availableHotkeys(player, () => on).map(({ id }) => id);
    expect(ids(false, false)).not.toContain('nextMood');
    expect(ids(false, true)).toEqual(expect.arrayContaining(['nextMood', 'silence']));
    expect(ids(true, true)).not.toContain('silence');
  });

  it('take keys no other shortcut uses', () => {
    const bindings = MAP_HOTKEYS.filter((hotkey) => !('whileWidgetHeld' in hotkey)).map((hotkey) => hotkey.defaultKey);
    for (const key of ['n', 'Shift+s']) expect(bindings.filter((binding) => binding === key)).toHaveLength(1);
  });
});

describe('the hidden map sound tool', () => {
  it('makes no context until a sound is decoded', () => {
    const create = vi.fn();
    const cache = new AudioBufferCache(create, {} as App, { getSound: () => null } as never);
    expect(create).not.toHaveBeenCalled();
    cache.dispose();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('the output device', () => {
  it('moves every follower, also one that comes later, and leaves a context that cannot alone', async () => {
    const early = { setSinkId: vi.fn(() => Promise.resolve()) };
    const old = {};
    followOutputDevice(early);
    followOutputDevice(old);
    await setOutputDevice('usb');
    expect(early.setSinkId).toHaveBeenCalledWith('usb');
    const late = { setSinkId: vi.fn(() => Promise.resolve()) };
    followOutputDevice(late);
    await Promise.resolve();
    expect(late.setSinkId).toHaveBeenCalledWith('usb');
    forgetOutputFollower(early);
    forgetOutputFollower(old);
    forgetOutputFollower(late);
    await setOutputDevice('');
  });

  it('falls back to the default when the device is gone, and says so', async () => {
    const output = {
      setSinkId: vi.fn((id: string) => (id === '' ? Promise.resolve() : Promise.reject(new DOMException('gone', 'NotFoundError')))),
    };
    followOutputDevice(output);
    const missing = vi.fn();
    await setOutputDevice('gone', missing);
    expect(missing).toHaveBeenCalledTimes(1);
    expect(output.setSinkId).toHaveBeenLastCalledWith('');
    forgetOutputFollower(output);
    await setOutputDevice('');
  });

  it('asks for the permission that names devices only when the list has no names', async () => {
    const stopped = vi.fn();
    const named = [{ kind: 'audiooutput', deviceId: 'a', label: 'Speakers' }] as MediaDeviceInfo[];
    const unnamed = [{ kind: 'audiooutput', deviceId: 'a', label: '' }] as MediaDeviceInfo[];
    const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [{ stop: stopped }] } as unknown as MediaStream));
    await expect(listOutputDevices({ enumerateDevices: () => Promise.resolve(named), getUserMedia })).resolves.toEqual([{ id: 'a', label: 'Speakers' }]);
    expect(getUserMedia).not.toHaveBeenCalled();
    const lists = [unnamed, named];
    await expect(listOutputDevices({ enumerateDevices: () => Promise.resolve(lists.shift() ?? named), getUserMedia })).resolves.toEqual([{ id: 'a', label: 'Speakers' }]);
    expect(stopped).toHaveBeenCalled();
    const refused = vi.fn(() => Promise.reject(new Error('no')));
    await expect(listOutputDevices({ enumerateDevices: () => Promise.resolve(unnamed), getUserMedia: refused })).resolves.toEqual([{ id: 'a', label: '' }]);
  });
});

describe('hearing a fight', () => {
  function store(): { state: FightState; write(change: Partial<FightState>): void; subscribe: (listener: (next: FightState, previous: FightState) => void) => () => void; getState: () => FightState } {
    const listeners = new Set<(next: FightState, previous: FightState) => void>();
    const made = {
      state: { mapPath: 'a', isMapLoading: false, sound: null, initiative: { isActive: false } } as FightState,
      write(change: Partial<FightState>): void {
        const previous = made.state;
        made.state = { ...previous, ...change };
        for (const listener of listeners) listener(made.state, previous);
      },
      subscribe: (listener: (next: FightState, previous: FightState) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getState: () => made.state,
    };
    return made;
  }

  it('hears a start and an end, and no other write of the store', () => {
    const fights = store();
    const started = vi.fn();
    const ended = vi.fn();
    const stop = watchFights(fights, { started, ended });
    fights.write({ sound: { mood: 'x' } });
    expect(started).not.toHaveBeenCalled();
    fights.write({ initiative: { isActive: true } });
    expect(started).toHaveBeenCalledWith('a', { mood: 'x' });
    fights.write({ initiative: { isActive: false } });
    expect(ended).toHaveBeenCalledWith('a');
    stop();
    fights.write({ initiative: { isActive: true } });
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('takes a fight that a scene brings along for nobody’s start', () => {
    const fights = store();
    const started = vi.fn();
    watchFights(fights, { started, ended: vi.fn() });
    fights.write({ mapPath: 'b', initiative: { isActive: true } });
    expect(started).not.toHaveBeenCalled();
  });
});
