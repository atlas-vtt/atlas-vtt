import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyReader } from '../../../src/app/soundLibrary/copyReader';

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the reader turns', () => {
  it('give back a turn only when its reads settle, so reads on a dead share never outnumber the turns', async () => {
    const reader = new CopyReader(100);
    const started: number[] = [];
    const answers = Array.from({ length: 9 }, (_, index) => reader.within(`s${index}`, () => {
      started.push(index);
      return new Promise<string>(() => undefined);
    }));
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    await vi.advanceTimersByTimeAsync(100);
    expect(await Promise.all(answers.slice(0, 8))).toEqual(Array.from({ length: 8 }, () => 'unknown'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toHaveLength(8);
  });

  it('time a sound from when its turn comes, and let a hurried one go first', async () => {
    const reader = new CopyReader(100);
    const started: string[] = [];
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    for (let index = 0; index < 8; index++) void reader.within(`busy${index}`, () => held);
    const late = reader.within('late', async () => { started.push('late'); return 'read'; });
    const pressed = reader.within('pressed', async () => { started.push('pressed'); return 'read'; });
    reader.hurry('pressed');
    await vi.advanceTimersByTimeAsync(500);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['pressed', 'late']);
    expect([await late, await pressed]).toEqual(['read', 'read']);
  });
});
