// @vitest-environment jsdom
import { musicPosition } from '@/app/soundDirector/musicList';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeldInMix } from '@/app/react/components/dm-screen/sound/library/useLibrary';
import { MAX_MOOD_LAYERS, type SoundRecord } from '@/app/sound/soundTypes';
import { fileToMix, heldInMix, listToMix, prepareFiles, takeFromMix, type LibraryDeskDeps } from '@/app/soundDirector/libraryDesk';
import { MOOD_LIMITS } from '@/app/soundLibrary/moodFile';
import type { StoredSound } from '@/app/soundLibrary/soundRecords';
import { carriesSounds, readSoundDrag, SOUND_DRAG_TYPE, writeSoundDrag } from '@/app/soundLibrary/soundDrag';
import { libraryDeskRig } from '../../helpers/libraryDeskRig';
import { record, settle, type DirectorRig } from '../../helpers/soundDirectorRig';
import type { FakeSoundLocation } from '../../helpers/fakeSoundLocation';

let rig: DirectorRig;
let location: FakeSoundLocation;
let stored: StoredSound[];
let deps: LibraryDeskDeps;

function setUp(records: SoundRecord[]): void {
  ({ rig, location, stored, deps } = libraryDeskRig(records));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  rig.director.destroy();
  vi.useRealTimers();
});

const file = (path: string, kind: 'music' | 'ambience' = 'music'): { kind: typeof kind; path: string; name: string; size: number; mtime: number } => ({ kind, path, name: path, size: 5, mtime: 1 });

describe('the desk from the library', () => {
  it('a file without a copy waits, then plays now, as asked', async () => {
    setUp([record('a', 'music')]);
    rig.files.add('audio/b.ogg');
    await settle();
    await rig.director.shelf.refresh();
    await settle();
    rig.director.press({ id: 'm', name: 'm', order: 1, fadeSeconds: 0, music: { tracks: ['a'], shuffle: false, levelDb: 0 }, layers: [] });
    await settle();
    await fileToMix(deps, [file('b.ogg')], 'now');
    const waiting = rig.director.snapshot().mix;
    expect(waiting.soonest?.at).toBe('now');
    expect(waiting.table.music?.tracks.map((one) => one.key)).toEqual(['hash-audio/a.ogg']);
    await settle();
    expect(rig.conversions).toHaveLength(1);
    rig.conversions[0]?.finish();
    await settle();
    const mix = rig.director.snapshot().mix;
    expect(mix.soonest).toBeUndefined();
    expect(rig.director.shelf.recordOfKey(musicPosition(mix.table.music!, mix.table.music!.startAt + 1)!.track.key)?.filePath).toBe('audio/b.ogg');
    expect(mix.table.outgoing).toHaveLength(1);
  });

  it('plays files as the list, in order or shuffled, and the ambience stays', async () => {
    const records = [record('rain'), ...['a', 'b', 'c'].map((id) => record(id, 'music'))];
    setUp(records);
    await settle();
    await rig.director.shelf.refresh();
    rig.director.desk.addSound(records[0]!);
    await settle();
    const files = ['a.ogg', 'b.ogg', 'c.ogg'].map((name) => file(name));
    await listToMix(deps, files, false);
    await settle();
    await settle();
    const { mix } = rig.director.snapshot();
    expect(mix.table.layers.map((layer) => layer.sound.key)).toEqual(['hash-audio/rain.ogg']);
    expect(mix.table.music?.shuffle).toBe(false);
    expect(mix.table.music?.tracks.map((one) => one.key)).toHaveLength(3);
    await listToMix(deps, files, true);
    await settle();
    expect(rig.director.snapshot().mix.table.music?.shuffle).toBe(true);
  });

  it('refuses a ninth layer plainly', async () => {
    const records = Array.from({ length: MAX_MOOD_LAYERS }, (_, index) => record(`l${index}`));
    setUp(records);
    await settle();
    await rig.director.shelf.refresh();
    for (const one of records) rig.director.desk.addSound(one);
    await settle();
    rig.files.add('audio/ninth.ogg');
    const add = vi.spyOn(rig.director.desk, 'addSound').mockReturnValue(false);
    await fileToMix(deps, [file('ninth.ogg', 'ambience')], 'add', 'Fen');
    expect(add).not.toHaveBeenCalled();
    expect(rig.notices.at(-1)).toContain(String(MAX_MOOD_LAYERS));
  });

  it('says what the mix holds by file, and takes it out', async () => {
    const records = [record('rain'), record('song', 'music')];
    setUp(records);
    await settle();
    await rig.director.shelf.refresh();
    rig.director.desk.addSound(records[0]!);
    rig.director.desk.addSound(records[1]!);
    await settle();
    const held = heldInMix(rig.director);
    expect(held.get('audio/rain.ogg')).toMatchObject({ type: 'layer', id: 'rain' });
    expect(held.get('audio/song.ogg')).toMatchObject({ type: 'track', id: 'song' });
    takeFromMix(rig.director, held.get('audio/rain.ogg')!);
    expect(rig.director.snapshot().mix.table.layers).toEqual([]);
  });

  it('prepares files without writing a record', async () => {
    setUp([]);
    await settle();
    for (const name of ['a.ogg', 'b.ogg']) {
      location.addFile(name);
      rig.files.add(`audio/${name}`);
    }
    expect(await prepareFiles(deps, [file('a.ogg'), file('b.ogg')])).toBe(2);
    await settle();
    expect(stored).toEqual([]);
    expect(rig.conversions.length).toBeGreaterThan(0);
  });
});

describe('more than the mix can hold', () => {
  it('a longer list plays its first tracks, told once', async () => {
    setUp([]);
    const list = vi.spyOn(rig.director.desk, 'playList').mockImplementation(() => undefined);
    await listToMix(deps, Array.from({ length: MOOD_LIMITS.tracks + 3 }, (_, index) => file(`${index}.ogg`)), false);
    expect(list.mock.calls[0]?.[0]).toHaveLength(MOOD_LIMITS.tracks);
    expect(rig.notices).toEqual([`Playing the first ${MOOD_LIMITS.tracks} tracks.`]);
  });

  it('a list that fits says nothing', async () => {
    setUp([]);
    vi.spyOn(rig.director.desk, 'playList').mockImplementation(() => undefined);
    await listToMix(deps, Array.from({ length: MOOD_LIMITS.tracks }, (_, index) => file(`${index}.ogg`)), false);
    expect(rig.notices).toEqual([]);
  });

  it('preparing stops at what a list holds, and says how many', async () => {
    setUp([]);
    expect(await prepareFiles(deps, Array.from({ length: MOOD_LIMITS.tracks + 3 }, (_, index) => file(`${index}.ogg`)))).toBe(MOOD_LIMITS.tracks);
  });

  it('more ambience than fits fills the mix, told once, and leaves no record of the rest', async () => {
    setUp([]);
    await fileToMix(deps, Array.from({ length: MAX_MOOD_LAYERS + 4 }, (_, index) => file(`Weather/${index}.ogg`, 'ambience')), 'add');
    expect(rig.notices).toEqual([`A mix holds at most ${MAX_MOOD_LAYERS} layers.`]);
    expect(stored).toHaveLength(MAX_MOOD_LAYERS);
  });

  it('music joining a full list is told so, and Play now still plays', async () => {
    setUp([]);
    vi.spyOn(rig.director, 'snapshot').mockReturnValue({ ...rig.director.snapshot(), mix: { ...rig.director.snapshot().mix, waitingMusic: { tracks: Array.from({ length: MOOD_LIMITS.tracks }, (_, index) => `t${index}`), shuffle: false, levelDb: 0 } } });
    const next = vi.spyOn(rig.director.desk, 'playNext').mockImplementation(() => undefined);
    const now = vi.spyOn(rig.director.desk, 'playNow').mockImplementation(() => undefined);
    location.addFile('a.ogg');
    const one = { kind: 'music' as const, path: 'a.ogg', name: 'a.ogg', size: 1, mtime: 1 };
    await fileToMix(deps, [one], 'next', 'Fen');
    expect(next).not.toHaveBeenCalled();
    expect(rig.notices).toEqual([`A list holds at most ${MOOD_LIMITS.tracks} tracks.`]);
    await fileToMix(deps, [one], 'now', 'Fen');
    expect(now).toHaveBeenCalledTimes(1);
  });
});

describe('a drag of library rows', () => {
  const transfer = (): Pick<DataTransfer, 'setData' | 'getData' | 'types' | 'effectAllowed'> => {
    const data = new Map<string, string>();
    return {
      setData: (type: string, value: string) => { data.set(type, value); },
      getData: (type: string) => data.get(type) ?? '',
      get types() { return [...data.keys()]; },
      effectAllowed: 'none',
    } as Pick<DataTransfer, 'setData' | 'getData' | 'types' | 'effectAllowed'>;
  };

  it('reads back what it wrote, and says it carries rows', () => {
    setUp([]);
    const drag = { files: [file('Battle/a.mp3')] };
    const carrier = transfer();
    writeSoundDrag(carrier, drag);
    expect(carriesSounds(carrier)).toBe(true);
    expect(readSoundDrag(carrier)).toEqual(drag);
  });

  it('leaves out what cannot be read, and a path that would leave its root', () => {
    setUp([]);
    const carrier = transfer();
    carrier.setData(SOUND_DRAG_TYPE, JSON.stringify({ files: [file('../../secret.mp3'), { kind: 'other', path: 'a.mp3' }, 7] }));
    expect(readSoundDrag(carrier)).toEqual({ files: [] });
    carrier.setData(SOUND_DRAG_TYPE, 'not json');
    expect(readSoundDrag(carrier)).toBeNull();
  });

  it('music joins next on a drop on the desk, ambience is added', async () => {
    const records = [record('a', 'music'), record('b', 'music')];
    setUp(records);
    await settle();
    await rig.director.shelf.refresh();
    const next = vi.spyOn(rig.director.desk, 'playNext').mockImplementation(() => undefined);
    const add = vi.spyOn(rig.director.desk, 'addSound').mockReturnValue(true);
    await fileToMix(deps, [file('a.ogg'), file('r.ogg', 'ambience')], 'next');
    expect(next).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });
});

it('what the library shows of the mix stays the same map while a fader moves, and changes when the mix holds something else', async () => {
  setUp([record('rain'), record('wind')]);
  await settle();
  await rig.director.shelf.refresh();
  await settle();
  rig.director.press({ id: 'm', name: 'm', order: 1, fadeSeconds: 0, music: 'none', layers: [{ sound: 'rain', levelDb: 0 }] });
  await act(async () => { await settle(); });
  const { result } = renderHook(() => useHeldInMix(rig.director));
  const shown = result.current;
  expect([...shown.keys()]).toEqual(['audio/rain.ogg']);
  const key = rig.director.snapshot().mix.table.layers[0]?.sound.key ?? '';
  await act(async () => {
    rig.director.desk.setLayerLevel(key, -20);
    await settle();
  });
  expect(result.current).toBe(shown);
  await act(async () => {
    rig.director.desk.addSound(record('wind'));
    await settle();
  });
  expect(result.current).not.toBe(shown);
  expect([...result.current.keys()].sort()).toEqual(['audio/rain.ogg', 'audio/wind.ogg']);
});
