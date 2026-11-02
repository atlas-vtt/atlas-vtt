// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundRecord } from '@/app/sound/soundTypes';
import { fileToMix, type LibraryDeskDeps } from '@/app/soundDirector/libraryDesk';
import { libraryDeskRig } from '../../helpers/libraryDeskRig';
import { record, settle, type DirectorRig } from '../../helpers/soundDirectorRig';

let rig: DirectorRig;
let deps: LibraryDeskDeps;

function setUp(records: SoundRecord[]): void {
  ({ rig, deps } = libraryDeskRig(records));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  rig.director.destroy();
  vi.useRealTimers();
});

const file = (path: string): { kind: 'music'; path: string; name: string; size: number; mtime: number } => ({ kind: 'music', path, name: path, size: 5, mtime: 1 });

describe('a selection sent to the mix', () => {
  const keys = (): string[] | undefined => {
    const { mix } = rig.director.snapshot();
    const { shelf } = rig.director;
    return (mix.listChange ?? mix.table.music)?.tracks.map((one) => shelf.recordOf(shelf.idOfKey(one.key) ?? '')?.filePath.replace('audio/', '').replace('.ogg', '') ?? one.key);
  };
  const select = (): ReturnType<typeof file>[] => ['a', 'b', 'c'].map((name) => file(`${name}.ogg`));
  const finishAll = async (): Promise<void> => {
    await settle();
    while (rig.conversions.length > 0) {
      rig.conversions.shift()?.finish();
      await settle();
    }
  };

  it('with Play next follows what sounds in its own order, in one state', async () => {
    setUp([record('s', 'music')]);
    await settle();
    await rig.director.shelf.refresh();
    for (const id of ['s', 'a', 'b', 'c']) rig.files.add(`audio/${id}.ogg`);
    rig.director.desk.addSound(record('s', 'music'));
    await finishAll();
    expect(keys()).toEqual(['s']);
    await fileToMix(deps, select(), 'next');
    await finishAll();
    expect(keys()).toEqual(['s', 'a', 'b', 'c']);
  });

  it('with no music starts its first, in its own order, as the copies come', async () => {
    setUp([]);
    await settle();
    for (const id of ['a', 'b', 'c']) rig.files.add(`audio/${id}.ogg`);
    await fileToMix(deps, select(), 'next');
    await finishAll();
    expect(keys()).toEqual(['a', 'b', 'c']);
    expect(rig.director.snapshot().mix.soonest).toBeUndefined();
    expect(rig.director.snapshot().mix.waitingMusic).toBeNull();
  });

  it('with Play now starts its first, the rest after it, as the copies come', async () => {
    setUp([record('s', 'music')]);
    await settle();
    await rig.director.shelf.refresh();
    for (const id of ['s', 'a', 'b', 'c']) rig.files.add(`audio/${id}.ogg`);
    rig.director.desk.addSound(record('s', 'music'));
    await finishAll();
    await fileToMix(deps, select(), 'now');
    await finishAll();
    expect(keys()).toEqual(['a', 'b', 'c', 's']);
    expect(rig.director.snapshot().mix.soonest).toBeUndefined();
  });

  it('is one state where every copy is here', async () => {
    setUp([]);
    await settle();
    for (const id of ['a', 'b', 'c']) rig.files.add(`audio/${id}.ogg`);
    await fileToMix(deps, select(), 'add');
    await finishAll();
    rig.director.desk.stop();
    await settle();
    const states = vi.fn();
    rig.director.onStateChanged(states);
    await fileToMix(deps, select(), 'now');
    expect(states).toHaveBeenCalledTimes(1);
    expect(keys()).toEqual(['a', 'b', 'c']);
  });

  it('gives way to the next where its first is refused', async () => {
    setUp([]);
    await settle();
    for (const id of ['a', 'b']) rig.files.add(`audio/${id}.ogg`);
    await fileToMix(deps, select().slice(0, 2), 'now');
    await settle();
    rig.conversions.shift()?.fail(new Error('unreadable'));
    await settle();
    rig.conversions.shift()?.finish();
    await settle();
    await settle();
    expect(keys()).toEqual(['b']);
    expect(rig.director.snapshot().mix.soonest).toBeUndefined();
  });
});
