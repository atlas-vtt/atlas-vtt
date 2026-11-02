// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileToMix, listToMix, type LibraryDeskDeps } from '@/app/soundDirector/libraryDesk';
import { libraryDeskRig, type LibraryDeskRig } from '../../helpers/libraryDeskRig';
import { record, settle, type DirectorRig } from '../../helpers/soundDirectorRig';

let rig: DirectorRig;
let deps: LibraryDeskDeps;

const openContexts = (): number => rig.contexts.filter((context) => !context.closed).length;
const sounding = (): number => rig.contexts.at(-1)?.playing().filter((source) => (source.buffer?.length ?? 0) > 1).length ?? 0;
const file = (name: string, kind: 'music' | 'ambience' = 'ambience'): { kind: typeof kind; path: string; name: string; size: number; mtime: number } => ({ kind, path: name, name, size: 5, mtime: 1 });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1_000_000);
  ({ rig, deps } = libraryDeskRig([]));
  await settle();
});

afterEach(() => {
  rig.director.destroy();
  vi.useRealTimers();
});

describe('the context a press opens', () => {
  it('goes again where the press came to nothing: an empty list', async () => {
    await listToMix(deps, [], false);
    expect(rig.contexts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(openContexts()).toBe(0);
  });

  it('goes again where all it sent is refused, and comes back with what later plays', async () => {
    rig.files.add('audio/bad.ogg');
    await fileToMix(deps, [file('bad.ogg')], 'add');
    await settle();
    rig.conversions.shift()?.fail(new Error('unreadable'));
    await settle();
    expect(rig.director.snapshot().mix.waitingLayers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(openContexts()).toBe(0);

    rig.files.add('audio/good.ogg');
    await fileToMix(deps, [file('good.ogg')], 'add');
    await settle();
    rig.conversions.shift()?.finish();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(openContexts()).toBe(1);
    expect(sounding()).toBe(1);
  });

  it('stands through a press whose records take longer than a pulse, and the sound comes on it', async () => {
    rig.files.add('audio/slow.ogg');
    let finishRead = (): void => undefined;
    const read = new Promise<void>((resolve) => { finishRead = resolve; });
    const refresh = rig.director.shelf.refresh.bind(rig.director.shelf);
    vi.spyOn(rig.director.shelf, 'refresh').mockImplementation(async () => {
      await read;
      await refresh();
    });
    const pressed = fileToMix(deps, [file('slow.ogg')], 'add');
    const [context] = rig.contexts;
    await vi.advanceTimersByTimeAsync(5000);
    expect(context?.closed).toBe(false);
    finishRead();
    await pressed;
    await settle();
    rig.conversions.shift()?.finish();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(rig.contexts).toHaveLength(1);
    expect(sounding()).toBe(1);
  });

  it('stands under a mix that just ended, for what the press adds', async () => {
    rig.files.add('audio/rain.ogg');
    await fileToMix(deps, [file('rain.ogg')], 'add');
    await settle();
    rig.conversions.shift()?.finish();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    rig.director.desk.stop();
    // The pulses go on until the fade is over, and the press waits for its record across that.
    rig.files.add('audio/wind.ogg');
    let finishRead = (): void => undefined;
    const read = new Promise<void>((resolve) => { finishRead = resolve; });
    const refresh = rig.director.shelf.refresh.bind(rig.director.shelf);
    vi.spyOn(rig.director.shelf, 'refresh').mockImplementation(async () => {
      await read;
      await refresh();
    });
    const pressed = fileToMix(deps, [file('wind.ogg')], 'add');
    await vi.advanceTimersByTimeAsync(10000);
    finishRead();
    await pressed;
    await settle();
    rig.conversions.shift()?.finish();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(openContexts()).toBe(1);
    expect(sounding()).toBe(1);
  });

  it('is opened by a sound that joins without any press, where none stands', async () => {
    const song = record('song', 'music');
    rig.files.add(song.filePath);
    rig.records.push(song);
    await rig.director.shelf.refresh();
    rig.director.desk.addSound(song);
    await vi.advanceTimersByTimeAsync(1000);
    rig.conversions.shift()?.finish();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(sounding()).toBe(1);
  });

  it('keeps nothing open beside what plays', async () => {
    rig.files.add('audio/Set/a.ogg');
    await listToMix(deps, [file('Set/a.ogg', 'music')], false);
    await settle();
    rig.conversions.shift()?.finish();
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(openContexts()).toBe(1);
    expect(sounding()).toBe(1);
  });
});
