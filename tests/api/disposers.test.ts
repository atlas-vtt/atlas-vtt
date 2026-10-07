import { describe, expect, it, vi } from 'vitest';
import { DisposerSet } from '../../src/api/disposers';

describe('DisposerSet', () => {
  it('C-life-4: a disposer called twice runs its cleanup once', () => {
    const set = new DisposerSet();
    const cleanup = vi.fn();
    const dispose = set.add(cleanup);
    dispose();
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(set.size).toBe(0);
  });

  it('disposeAll runs every cleanup, also after one throws', () => {
    const set = new DisposerSet();
    const after = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    set.add(() => { throw new Error('boom'); });
    set.add(after);
    set.disposeAll();
    expect(after).toHaveBeenCalledTimes(1);
    expect(set.size).toBe(0);
  });

  it('runs a cleanup added after disposeAll at once', () => {
    const set = new DisposerSet();
    set.disposeAll();
    const late = vi.fn();
    set.add(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});
