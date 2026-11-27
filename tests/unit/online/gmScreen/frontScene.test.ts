import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../../../../src/app/atlasViewType';
import { atlasFrontScenes } from '../../../../src/app/online/gmScreen/statblocks/frontScene.ts';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import { EventEmitter } from '../../../../src/app/utils/typedEmitter';

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

  it('hears each roll of its map before the map\'s other dice listeners, so one of them that throws cannot hide a roll made', () => {
    const bus = new EventEmitter();
    const view = { getViewType: () => ATLAS_VIEW_TYPE, atlasStore: {}, viewId: 'view-1', getStore: () => ({}), serviceManager: { getEventBus: () => bus } };
    const workspace = { ...eventWorkspace(), getActiveViewOfType: () => view, getLeavesOfType: () => [] };
    const scene = atlasFrontScenes({ workspace } as unknown as App).current()!;
    bus.on('dice-rolled', () => {
      throw new Error('a dice toast failed');
    });
    const heard: DiceRollResult[] = [];
    const stop = scene.watchRolls((result) => heard.push(result));
    const roll = { id: 'r', timestamp: 1, formula: '1d20+4', rolls: [], modifiers: 4, total: 17 } as DiceRollResult;
    expect(() => bus.emit('dice-rolled', roll)).toThrow('a dice toast failed');
    expect(heard).toEqual([roll]);
    stop();
    expect(bus.listenerCount('dice-rolled')).toBe(1);
  });
});
