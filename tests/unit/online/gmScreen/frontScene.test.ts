import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { atlasFrontScenes } from '../../../../src/app/online/gmScreen/statblocks/frontScene.ts';

/** A workspace that holds its handlers and calls them on `trigger`, as Obsidian's does. */
function eventWorkspace() {
  const handlers = new Map<object, { name: string; callback: () => void }>();
  return {
    on: (name: string, callback: () => void): object => {
      const ref = {};
      handlers.set(ref, { name, callback });
      return ref;
    },
    offref: (ref: object): void => void handlers.delete(ref),
    trigger: (name: string): void => {
      for (const handler of [...handlers.values()]) if (handler.name === name) handler.callback();
    },
    get handlers(): number { return handlers.size; },
  };
}

describe('the map in front, for the Statblocks screen', () => {
  it('says when another map may have come to the front, until its watch is stopped', () => {
    const workspace = eventWorkspace();
    const scenes = atlasFrontScenes({ workspace } as unknown as App);
    const moved = vi.fn();
    const stop = scenes.watch(moved);
    workspace.trigger('active-leaf-change');
    workspace.trigger('layout-change');
    workspace.trigger('file-open');
    expect(moved).toHaveBeenCalledTimes(2);
    stop();
    workspace.trigger('active-leaf-change');
    workspace.trigger('layout-change');
    expect(moved).toHaveBeenCalledTimes(2);
    expect(workspace.handlers).toBe(0);
  });
});
