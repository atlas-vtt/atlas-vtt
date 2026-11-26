// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mood } from '@/app/sound/soundTypes';
import { RemoteControl, type RemoteChange } from '@/app/soundRemote/remoteControl';
import { fakeRemoteDirector, fakeTable, remoteMood, withMusic } from '../../helpers/soundRemoteRig';

function rig() {
  const director = fakeRemoteDirector(withMusic());
  let moods: Mood[] = [remoteMood('tavern', 'Tavern')];
  const moodListeners = new Set<() => void>();
  const table = fakeTable();
  const control = new RemoteControl({
    director,
    moods: {
      moods: () => moods,
      mood: (id) => moods.find((mood) => mood.id === id) ?? null,
      onChange: (listener) => {
        moodListeners.add(listener);
        return () => moodListeners.delete(listener);
      },
    },
    table: table.table,
  });
  const setMoods = (next: Mood[]): void => {
    moods = next;
    for (const listener of moodListeners) listener();
  };
  return { director, table, control, setMoods };
}

/** What one sender is handed, as `kind` lines. */
function sender() {
  const changes: RemoteChange[] = [];
  return { changes, send: (change: RemoteChange): void => { changes.push(change); }, kinds: (): string[] => changes.map((change) => change.kind) };
}

let control: RemoteControl | null = null;

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  control?.dispose();
  control = null;
  vi.useRealTimers();
});

describe('the remote\'s commands without a transport', () => {
  it('runs sound and table commands and says why one did nothing', () => {
    const made = rig();
    control = made.control;
    expect(control.run({ type: 'mood', id: 'tavern' })).toBeNull();
    expect(made.director.press).toHaveBeenCalledOnce();
    expect(control.run({ type: 'mood', id: 'gone' })).toBe('no-mood');
    expect(control.run({ type: 'combat' })).toBeNull();
    expect(made.table.state.startCombat).toHaveBeenCalledOnce();
    made.director.isOn = false;
    expect(control.run({ type: 'pause' })).toBe('sound-off');
    made.table.window.open = false;
    expect(control.run({ type: 'curtain' })).toBe('no-player-window');
  });

  it('reads the moods and the state a key draws', () => {
    control = rig().control;
    expect(control.moods()).toMatchObject([{ id: 'tavern', name: 'Tavern' }]);
    expect(control.state()).toMatchObject({ soundOn: true, playing: true, combat: { active: false, combatants: 2 }, player: { open: true } });
  });
});

describe('the remote\'s change detector', () => {
  it('hands a new sender everything at once, then only what changed', () => {
    const made = rig();
    control = made.control;
    const one = sender();
    control.watch(one.send);
    expect(one.kinds()).toEqual(['moods', 'state']);
    expect(one.changes[1]).toMatchObject({ kind: 'state', state: { levels: { masterDb: 0 } } });
    made.director.publish({});
    expect(one.kinds()).toEqual(['moods', 'state']);
    made.director.publish({ levels: { masterDb: -12, musicDb: 0, ambienceDb: 0 } });
    expect(one.kinds()).toEqual(['moods', 'state', 'state']);
    const last = one.changes[2];
    expect(last.kind === 'state' && last.json).toBe(JSON.stringify(control.state()));
  });

  it('hands out the state at once after a table command, which tells nobody it changed', () => {
    const made = rig();
    control = made.control;
    const one = sender();
    control.watch(one.send);
    expect(control.run({ type: 'combat' })).toBeNull();
    expect(one.changes.at(-1)).toMatchObject({ kind: 'state', state: { combat: { active: true, round: 1 } } });
  });

  it('hands out the moods when the list changes, and the state when it changed with them', () => {
    const made = rig();
    control = made.control;
    const one = sender();
    control.watch(one.send);
    made.setMoods([remoteMood('tavern', 'Tavern')]);
    expect(one.kinds()).toEqual(['moods', 'state']);
    made.setMoods([remoteMood('storm', 'Storm')]);
    expect(one.changes.at(-1)).toMatchObject({ kind: 'moods', moods: [{ id: 'storm' }] });
  });

  it('looks once a second for what changed without a word, and stops looking when the sender stops', () => {
    const made = rig();
    control = made.control;
    const one = sender();
    const watch = control.watch(one.send);
    made.table.window.curtained = true;
    vi.advanceTimersByTime(1000);
    expect(one.changes.at(-1)).toMatchObject({ kind: 'state', state: { player: { hidden: true } } });
    watch.stop();
    made.table.window.curtained = false;
    vi.advanceTimersByTime(5000);
    made.director.publish({ levels: { masterDb: -3, musicDb: 0, ambienceDb: 0 } });
    expect(one.kinds()).toEqual(['moods', 'state', 'state']);
  });

  it('keeps each sender\'s own record of what it was handed', () => {
    const made = rig();
    control = made.control;
    const one = sender();
    const two = sender();
    control.watch(one.send);
    made.director.publish({ levels: { masterDb: -6, musicDb: 0, ambienceDb: 0 } });
    const watch = control.watch(two.send);
    expect(two.kinds()).toEqual(['moods', 'state']);
    made.director.publish({});
    watch.resend();
    expect(one.kinds()).toEqual(['moods', 'state', 'state']);
    expect(two.kinds()).toEqual(['moods', 'state', 'moods', 'state']);
  });

  it('stops every sender when it is disposed', () => {
    const made = rig();
    const one = sender();
    made.control.watch(one.send);
    made.control.dispose();
    made.director.publish({ levels: { masterDb: -9, musicDb: 0, ambienceDb: 0 } });
    vi.advanceTimersByTime(2000);
    expect(one.kinds()).toEqual(['moods', 'state']);
  });
});
