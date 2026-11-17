import { describe, expect, it, vi } from 'vitest';
import { Component } from 'obsidian';
import { guardChildUnload, guardedCleanup } from '../../src/app/plugin/guardedTeardown';

describe('guarded teardown', () => {
  it('runs every cleanup when one throws, and so does a child that fails to unload', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const component = new Component();
    const later = vi.fn();
    component.register(guardedCleanup(later));
    component.register(guardedCleanup(() => { throw new Error('boom'); }));

    const child = new Component();
    child.unload = () => { throw new Error('child boom'); };
    guardChildUnload(child);

    expect(() => child.unload()).not.toThrow();
    component.unload();
    expect(later).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
