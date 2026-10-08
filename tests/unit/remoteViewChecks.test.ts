import { describe, expect, it, vi } from 'vitest';
import { MAX_ROLL_DICE } from '../../src/api/diceRollCheck';
import { ListenerSet } from '../../src/app/remote-view/listeners';
import { framesIn } from '../../src/app/remote-view/ViewportFollower';
import { ROLL_NOT_SENT } from '../../src/app/remote-view/remoteControls';
import { REMOTE_LOG_ENTRIES, RemoteViewDice } from '../../src/app/remote-view/RemoteViewDice';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const roll = (id: string, overrides: Record<string, unknown> = {}): DiceRollResult => ({
  id, timestamp: 0, formula: '1d6', rolls: [{ die: 'd6', value: 3, max: 6 }], modifiers: 0, total: 3, crit: null, ...overrides,
} as DiceRollResult);

function dice(): { store: ReturnType<typeof createViewAtlasStore>; dice: RemoteViewDice } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-checks', undefined, false, { remote: true });
  return { store, dice: new RemoteViewDice(store) };
}

describe("a remote view's listeners", () => {
  it('keeps each registration of the same function apart: each disposer removes only its own, and twice is harmless', () => {
    const set = new ListenerSet<() => void>('onClose');
    const listener = (): void => undefined;
    const first = set.add(listener);
    const second = set.add(listener);
    expect(set.list()).toHaveLength(2);
    first();
    first();
    expect(set.list()).toEqual([listener]);
    second();
    const third = set.add(listener);
    second();
    expect(set.list()).toEqual([listener]);
    third();
    expect(set.list()).toEqual([]);
  });
});

describe("what a remote view's dice take", () => {
  it('checks the log as Atlas checks a published roll, keeps the newest 100 entries, and refuses what is not plain data by name', () => {
    const { store, dice: remote } = dice();
    const bad = [
      [roll('a', { modifiers: 'x' })], [roll('a', { rolls: [{ die: 'd6', value: Number.NaN, max: 6 }] })],
      [roll('a', { rolls: Array.from({ length: MAX_ROLL_DICE + 1 }, () => ({ die: 'd6', value: 1, max: 6 })) })],
    ];
    for (const entries of bad) expect(() => remote.setDiceLog(entries)).toThrow(/RemoteView.setDiceLog: the entries/);
    expect(() => remote.setDiceLog([{ ...roll('a'), run: (): void => undefined }])).toThrow('RemoteView.setDiceLog: the roll must be plain data.');
    expect(() => remote.throwRoll({ ...roll('a'), run: (): void => undefined })).toThrow('RemoteView.throwRoll: the roll must be plain data.');
    remote.setDiceLog(Array.from({ length: REMOTE_LOG_ENTRIES + 5 }, (_, index) => roll(`r${index}`)));
    expect(store.getState().remoteView?.diceLog).toHaveLength(REMOTE_LOG_ENTRIES);
  });

  it('reads each status field once, so a getter cannot change it after the check', () => {
    const { store, dice: remote } = dice();
    let reads = 0;
    const status = { connection: 'Live', tone: 'connected', message: null, get title(): unknown { return reads++ === 0 ? 'Table' : 42; } };
    remote.setStatus(status);
    expect(reads).toBe(1);
    expect(store.getState().remoteView?.status.title).toBe('Table');
    let labels = 0;
    const action = { id: 'a', icon: 'x', get label(): unknown { return labels++ === 0 ? 'Go' : ''; } };
    remote.setStatus({ title: 'T', connection: 'C', tone: 'pending', message: null, actions: [action] });
    expect(labels).toBe(1);
    expect(store.getState().remoteView?.status.actions?.[0]?.label).toBe('Go');
  });

  it('asks every roll listener until one sends the roll, keeps the first reason, and counts one that throws as not sent', () => {
    const { dice: remote } = dice();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stopThrowing = remote.rolls.add(() => { throw new Error('boom'); });
    expect(remote.roll({ d6: 1 }, 0)).toBe(ROLL_NOT_SENT);
    stopThrowing();
    remote.rolls.add(() => 'Not your turn');
    remote.rolls.add(() => { throw new Error('boom'); });
    remote.rolls.add(() => 'Not connected');
    expect(remote.roll({ d6: 1 }, 0)).toBe('Not your turn');
    const sent = vi.fn((): string | null => null);
    remote.rolls.add(sent);
    expect(remote.roll({ d6: 1 }, 0)).toBeNull();
    expect(sent).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});

describe("a remote view's camera frames", () => {
  it('come from the window the view is in when asked, and are cancelled there', () => {
    const fakeWindow = (): Window => ({ requestAnimationFrame: vi.fn(() => 7), cancelAnimationFrame: vi.fn() }) as unknown as Window;
    const main = fakeWindow();
    const popout = fakeWindow();
    let current = main;
    const frames = framesIn(() => current);
    frames.request(() => undefined);
    current = popout;
    frames.request(() => undefined);
    frames.cancel(7);
    expect(main.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(popout.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(popout.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(main.cancelAnimationFrame).not.toHaveBeenCalled();
  });
});
