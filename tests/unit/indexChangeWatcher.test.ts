import { describe, expect, it, vi } from 'vitest';
import { IndexChangeWatcher } from '../../src/app/services/sceneChanges';

describe('IndexChangeWatcher', () => {
  it('works out no signature on an index save while nobody listens', () => {
    const signature = vi.fn((value: string) => value);
    const watcher = new IndexChangeWatcher(signature, 'test');
    watcher.check('a');
    watcher.check('b');
    expect(signature).not.toHaveBeenCalled();
  });

  it('takes note of the index as the first listener comes, and reports the next change', () => {
    const signature = vi.fn((value: string) => value);
    let index = 'a';
    const watcher = new IndexChangeWatcher(signature, 'test', () => index);
    watcher.check(index);
    const listener = vi.fn();
    const stop = watcher.onChange(listener);
    watcher.check(index);
    expect(listener).not.toHaveBeenCalled();
    index = 'b';
    watcher.check(index);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    signature.mockClear();
    watcher.check('c');
    expect(signature).not.toHaveBeenCalled();
  });

  it('reports a change made between the first listener coming and the next save', () => {
    let index = 'a';
    const watcher = new IndexChangeWatcher((value: string) => value, 'test', () => index);
    const listener = vi.fn();
    watcher.onChange(listener);
    index = 'b';
    watcher.check(index);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
