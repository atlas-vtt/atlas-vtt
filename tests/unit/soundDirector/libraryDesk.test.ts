// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetService, SoundAsset } from '@/app/services/AssetService';
import { MAX_MOOD_LAYERS, type SoundRecord } from '@/app/sound/soundTypes';
import { dragToMix, fileToMix, filesToPlay, folderToMix, heldInMix, prepareFolder, takeFromMix, type LibraryDeskDeps } from '@/app/soundDirector/libraryDesk';
import { MOOD_LIMITS } from '@/app/soundLibrary/moodFile';
import type { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import { soundRecordOf } from '@/app/soundLibrary/soundRecords';
import { carriesSounds, readSoundDrag, SOUND_DRAG_TYPE, writeSoundDrag } from '@/app/soundLibrary/soundDrag';
import { directorRig, record, settle, type DirectorRig } from '../../helpers/soundDirectorRig';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';

let rig: DirectorRig;
let location: FakeSoundLocation;
let stored: SoundAsset[];
let deps: LibraryDeskDeps;

/** A desk over real records: what `recordsForFiles` made is what the shelf reads next. */
function setUp(records: SoundRecord[]): void {
  rig = directorRig(records);
  location = new FakeSoundLocation();
  stored = [];
  const library = {
    locationOf: () => location,
    audioPathOf: (_kind: string, path: string) => `audio/${path}`,
    ensureListed: async () => undefined,
  } as unknown as SoundLibrary;
  const assets = {
    runExclusive: <T>(work: () => Promise<T>) => work(),
    getAssets: async () => stored,
    addIdentifiedAssets: async (fresh: SoundAsset[]) => {
      stored.push(...fresh);
      rig.records.push(...fresh.map(soundRecordOf));
    },
  } as unknown as AssetService;
  deps = { assets, library, director: rig.director, notify: (message) => rig.notices.push(message) };
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
    rig.director.press('c', { id: 'm', name: 'm', order: 1, fadeSeconds: 0, music: { tracks: ['a'], shuffle: false, levelDb: 0 }, layers: [] });
    await settle();
    await fileToMix(deps, [file('b.ogg')], 'now', 'Fen');
    const waiting = rig.director.snapshot().mix;
    expect(waiting.soonest?.at).toBe('now');
    expect(waiting.table.music?.tracks.map((one) => one.key)).toEqual(['hash-audio/a.ogg']);
    await settle();
    expect(rig.conversions).toHaveLength(1);
    rig.conversions[0]?.finish();
    await settle();
    const mix = rig.director.snapshot().mix;
    expect(mix.soonest).toBeUndefined();
    expect(mix.table.music?.tracks[0]?.key).not.toBe('hash-audio/a.ogg');
    expect(mix.table.outgoing).toHaveLength(1);
  });

  it('plays a folder as the list, in order or shuffled, and the ambience stays', async () => {
    const records = [record('rain'), ...['a', 'b', 'c'].map((id) => record(id, 'music'))];
    setUp(records);
    await settle();
    await rig.director.shelf.refresh();
    rig.director.desk.addSound(records[0]!);
    await settle();
    for (const name of ['a.ogg', 'b.ogg', 'c.ogg']) location.addFile(name);
    await folderToMix(deps, 'music', '', false, 'Fen');
    await settle();
    await settle();
    const { mix } = rig.director.snapshot();
    expect(mix.table.layers.map((layer) => layer.sound.key)).toEqual(['hash-audio/rain.ogg']);
    expect(mix.table.music?.shuffle).toBe(false);
    expect(mix.table.music?.tracks.map((one) => one.key)).toHaveLength(3);
    await folderToMix(deps, 'music', '', true, 'Fen');
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

  it('prepares a folder without writing a record', async () => {
    setUp([]);
    await settle();
    for (const name of ['a.ogg', 'b.ogg']) {
      location.addFile(name);
      rig.files.add(`audio/${name}`);
    }
    expect(await prepareFolder(deps, 'music', '', 'Fen')).toBe(2);
    await settle();
    expect(stored).toEqual([]);
    expect(rig.conversions.length).toBeGreaterThan(0);
  });
});

describe('what a folder plays', () => {
  it('is what lies directly in it, else everything below it, within what a mood holds', async () => {
    setUp([]);
    location.addFile('Set/b.mp3');
    location.addFile('Set/a.mp3');
    location.addFile('Set/Deep/x.mp3');
    expect((await filesToPlay(location, 'music', 'Set')).map((one) => one.path)).toEqual(['Set/a.mp3', 'Set/b.mp3']);
    location.addFile('Only/Deep/y.mp3');
    location.addFile('Only/Above/z.mp3');
    expect((await filesToPlay(location, 'music', 'Only')).map((one) => one.path)).toEqual(['Only/Above/z.mp3', 'Only/Deep/y.mp3']);
    for (let index = 0; index < MOOD_LIMITS.tracks + 5; index++) location.addFile(`Huge/${index}.mp3`);
    expect(await filesToPlay(location, 'music', 'Huge')).toHaveLength(MOOD_LIMITS.tracks);
    await expect(filesToPlay(location, 'music', 'Gone')).resolves.toEqual([]);
  });
});

describe('more than the mix can hold', () => {
  it('a music folder plays its first tracks, told once', async () => {
    setUp([]);
    const list = vi.spyOn(rig.director.desk, 'playList').mockImplementation(() => undefined);
    for (let index = 0; index < MOOD_LIMITS.tracks + 3; index++) location.addFile(`${index}.ogg`);
    await folderToMix(deps, 'music', '', false, 'Fen');
    expect(list.mock.calls[0]?.[0]).toHaveLength(MOOD_LIMITS.tracks);
    expect(rig.notices).toEqual([`Playing the first ${MOOD_LIMITS.tracks} tracks of this folder.`]);
  });

  it('a music folder that fits says nothing', async () => {
    setUp([]);
    vi.spyOn(rig.director.desk, 'playList').mockImplementation(() => undefined);
    for (let index = 0; index < MOOD_LIMITS.tracks; index++) location.addFile(`${index}.ogg`);
    await folderToMix(deps, 'music', '', false, 'Fen');
    expect(rig.notices).toEqual([]);
  });

  it('an ambience folder dropped on the desk fills the mix, told once, and leaves no record of the rest', async () => {
    setUp([]);
    for (let index = 0; index < MAX_MOOD_LAYERS + 4; index++) location.addFile(`Weather/${index}.ogg`);
    await dragToMix(deps, { files: [], folders: [{ kind: 'ambience', path: 'Weather' }] }, 'Fen');
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
    const drag = { files: [file('Battle/a.mp3')], folders: [{ kind: 'ambience' as const, path: 'Weather' }] };
    const carrier = transfer();
    writeSoundDrag(carrier, drag);
    expect(carriesSounds(carrier)).toBe(true);
    expect(readSoundDrag(carrier)).toEqual(drag);
  });

  it('leaves out what cannot be read, and a path that would leave its root', () => {
    setUp([]);
    const carrier = transfer();
    carrier.setData(SOUND_DRAG_TYPE, JSON.stringify({ files: [file('../../secret.mp3'), { kind: 'other', path: 'a.mp3' }, 7], folders: [{ kind: 'music', path: '/etc' }] }));
    expect(readSoundDrag(carrier)).toEqual({ files: [], folders: [] });
    carrier.setData(SOUND_DRAG_TYPE, 'not json');
    expect(readSoundDrag(carrier)).toBeNull();
  });

  it('music joins next on a drop on the desk, ambience is added, a music folder becomes the list', async () => {
    const records = [record('a', 'music'), record('b', 'music')];
    setUp(records);
    await settle();
    await rig.director.shelf.refresh();
    const next = vi.spyOn(rig.director.desk, 'playNext').mockImplementation(() => undefined);
    const list = vi.spyOn(rig.director.desk, 'playList').mockImplementation(() => undefined);
    const add = vi.spyOn(rig.director.desk, 'addSound').mockReturnValue(true);
    location.addFile('Set/x.mp3');
    await dragToMix(deps, { files: [file('a.ogg'), file('r.ogg', 'ambience')], folders: [{ kind: 'music', path: 'Set' }] }, 'Fen');
    expect(next).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
