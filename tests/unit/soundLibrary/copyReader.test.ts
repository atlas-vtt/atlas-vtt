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

  it('let a hurried sound go first', async () => {
    const reader = new CopyReader(1000);
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

  it('give a sound that waits behind reads stuck past their time unknown, without reading it', async () => {
    const reader = new CopyReader(100);
    for (let index = 0; index < 8; index++) void reader.within(`dead${index}`, () => new Promise<string>(() => undefined));
    const work = vi.fn(async () => 'read');
    let answer: string | null = null;
    void reader.within('late', work).then((value) => { answer = value; });
    await vi.advanceTimersByTimeAsync(150);
    expect(answer).toBeNull();
    await vi.advanceTimersByTimeAsync(50);
    expect(answer).toBe('unknown');
    expect(work).not.toHaveBeenCalled();
  });

  it('keep a sound waiting while turns turn over, however long the reads ahead of it take', async () => {
    const reader = new CopyReader(100);
    const slow = (): Promise<string> => new Promise((resolve) => setTimeout(() => resolve('read'), 60));
    const answers = Array.from({ length: 40 }, (_, index) => reader.within(`s${index}`, slow));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await Promise.all(answers)).toEqual(answers.map(() => 'read'));
  });

  it('give a turn back when the work throws before it returns a promise', async () => {
    const reader = new CopyReader(100);
    const thrown = Array.from({ length: 8 }, (_, index) => reader.within(`t${index}`, () => { throw new Error('at once'); }));
    for (const answer of thrown) await expect(answer).rejects.toThrow('at once');
    const after = reader.within('after', async () => 'read');
    await vi.advanceTimersByTimeAsync(0);
    expect(await after).toBe('read');
  });
});
