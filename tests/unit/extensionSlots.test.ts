import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlotRegistry, safely } from '../../src/app/extensions/SlotRegistry';
import { invalidateSlots, toolbarSlot } from '../../src/app/extensions/slots';
import {
  activePresentationTarget, addPresentationTarget, presentationTargetSlot, subscribePresentationTargets,
} from '../../src/app/services/presentationTargets';

afterEach(() => { vi.restoreAllMocks(); });

describe('SlotRegistry', () => {
  it('adds and lists items in order, with their owner', () => {
    const registry = new SlotRegistry<string>();
    registry.add('a', 'one');
    registry.add('b', 'two');
    expect(registry.list()).toEqual([{ owner: 'a', item: 'one' }, { owner: 'b', item: 'two' }]);
  });

  it('removes an item once, however often the removal is called', () => {
    const registry = new SlotRegistry<string>();
    const removeOne = registry.add('a', 'one');
    registry.add('a', 'one');
    removeOne();
    const version = registry.version();
    removeOne();
    expect(registry.list()).toHaveLength(1);
    expect(registry.version()).toBe(version);
  });

  it('bumps the version and tells subscribers on add, remove and invalidate', () => {
    const registry = new SlotRegistry<string>();
    const listener = vi.fn();
    const stop = registry.subscribe(listener);
    const start = registry.version();
    const remove = registry.add('a', 'one');
    registry.invalidate();
    remove();
    expect(registry.version()).toBe(start + 3);
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    registry.invalidate();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('keeps the list when it is invalidated', () => {
    const registry = new SlotRegistry<string>();
    registry.add('a', 'one');
    const before = registry.list();
    registry.invalidate();
    expect(registry.list()).toBe(before);
  });
});

describe('safely', () => {
  it('returns what the callback returns', () => {
    expect(safely('ext', 'badge', () => 3, null)).toBe(3);
  });

  it('logs and returns the fallback when the callback throws', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(safely('ext', 'badge', () => { throw new Error('boom'); }, null)).toBeNull();
    expect(log).toHaveBeenCalledWith('[Atlas API] ext: badge failed:', expect.any(Error));
  });
});

describe('presentation targets on the slot registry', () => {
  it('adding the same target object twice changes nothing; the first removal removes it', () => {
    const target = { id: 'on', label: 'On', isActive: () => true };
    const first = addPresentationTarget(target);
    const second = addPresentationTarget(target);
    expect(presentationTargetSlot.list()).toHaveLength(1);
    second();
    expect(presentationTargetSlot.list()).toHaveLength(1);
    first();
    expect(presentationTargetSlot.list()).toHaveLength(0);
  });

  it('follows the active target, and a target that throws counts as inactive', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stopBroken = addPresentationTarget({ id: 'broken', label: 'Broken', isActive: () => { throw new Error('boom'); } }, 'ext');
    expect(activePresentationTarget()).toBeNull();
    const target = { id: 'on', label: 'On', isActive: () => true };
    const stop = addPresentationTarget(target);
    expect(activePresentationTarget()).toBe(target);
    stop();
    stopBroken();
    expect(activePresentationTarget()).toBeNull();
  });

  it('is asked to read again by invalidateSlots', () => {
    const listener = vi.fn();
    const stop = subscribePresentationTargets(listener);
    const before = toolbarSlot.version();
    invalidateSlots();
    expect(listener).toHaveBeenCalledOnce();
    expect(toolbarSlot.version()).toBe(before + 1);
    stop();
  });
});
