import { describe, expect, it } from 'vitest';
import { changesTaken, isLocked, unlockedCopy, unlockedIds, unlocks } from '../annotationLock';

describe('what a lock is against', () => {
  it('counts a lock only where it is true', () => {
    expect(isLocked({ locked: true })).toBe(true);
    for (const entry of [{}, { locked: false }, { locked: 'yes' }, { locked: 1 }, undefined]) expect(isLocked(entry)).toBe(false);
  });

  it('takes changes that name the lock as removed for an unlocking, and no others', () => {
    expect(unlocks({ locked: undefined })).toBe(true);
    expect(unlocks({ locked: undefined, color: '#000000' })).toBe(true);
    for (const changes of [{}, { locked: true }, { locked: false }, { color: '#000000' }]) expect(unlocks(changes)).toBe(false);
  });

  it('writes every change to what is not locked, and to a locked one its unlocking alone', () => {
    const changes = { color: '#000000', hidden: true as const };
    expect(changesTaken({}, changes)).toBe(changes);
    expect(changesTaken({ locked: true }, changes)).toBeNull();
    expect(changesTaken({ locked: true }, { locked: true })).toBeNull();
    expect(changesTaken({ locked: true }, { locked: undefined })).toEqual({ locked: undefined });
    // An unlocking that comes with other changes unlocks, and changes nothing else.
    const taken = changesTaken({ locked: true }, { locked: undefined, color: '#000000' });
    expect(taken).toEqual({ locked: undefined });
    expect(taken).not.toHaveProperty('color');
  });

  it('keeps the ids of what is not locked, in their order, and those of neither a drawing nor a text', () => {
    const objects = { drawings: { a: {}, b: { locked: true } }, texts: { c: { locked: true }, d: { locked: false } } };
    expect(unlockedIds(['d', 'token', 'c', 'b', 'a'], objects)).toEqual(['d', 'token', 'a']);
    expect(unlockedIds([], objects)).toEqual([]);
  });

  it('copies everything but the lock, and leaves the original its own', () => {
    const original = { id: 'a', color: '#aa3300', locked: true };
    const copy = unlockedCopy(original);
    expect(copy).toEqual({ id: 'a', color: '#aa3300' });
    expect(copy).not.toHaveProperty('locked');
    expect(original.locked).toBe(true);
    const free = { id: 'b' };
    expect(unlockedCopy(free)).toEqual(free);
    expect(unlockedCopy(free)).not.toBe(free);
  });
});
