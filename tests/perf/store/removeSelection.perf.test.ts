import { describe, expect, it } from 'vitest';
import type { ViewAtlasStore } from '../../../src/app/storeFactory';
import { timeBound } from '../../helpers/timeBound';
import { dungeon } from './dungeonStore';

const RUNS = 5;

/** The middle of the runs, in milliseconds, each on a scene of its own. */
function middle(run: (store: ViewAtlasStore) => void, prepare: (store: ViewAtlasStore) => void = () => undefined): number {
  const times = Array.from({ length: RUNS }, () => {
    const store = dungeon();
    prepare(store);
    const start = performance.now();
    run(store);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return times[Math.floor(RUNS / 2)]!;
}

/** Every token, drawing and text of the scene but one in four: what a GM drags a lasso around before Delete. */
function selection(store: ViewAtlasStore): string[] {
  const { tokens, drawings, texts } = store.getState().objects;
  return [...Object.keys(tokens), ...Object.keys(drawings), ...Object.keys(texts)].filter((_, i) => i % 4 !== 0);
}

const remove = (store: ViewAtlasStore): void => store.getState().removeObjects(selection(store));
const undo = (store: ViewAtlasStore): void => store.temporal.getState().undo();
const redo = (store: ViewAtlasStore): void => store.temporal.getState().redo();

/**
 * What deleting a large selection costs on a big scene, and its undo and redo: the store's write,
 * its history step and travel, no renderer. Run alone (`npm run test:perf`).
 */
describe('deleting 900 tokens, drawings and texts of a three-floor dungeon', () => {
  it('takes them all, and undo and redo bring them back and take them again', () => {
    const store = dungeon();
    const objects = store.getState().objects;
    remove(store);
    const left = store.getState().objects;
    expect(Object.keys(left.tokens).length + Object.keys(left.drawings).length + Object.keys(left.texts).length).toBe(300);
    undo(store);
    expect(store.getState().objects).toEqual(objects);
    redo(store);
    expect(store.getState().objects).toEqual(left);
  });

  it('takes under 50 ms, and its undo and redo under 50 ms each', () => {
    const removal = middle(remove);
    const undone = middle(undo, remove);
    const redone = middle(redo, (store) => { remove(store); undo(store); });
    console.info(`delete ${removal.toFixed(1)} ms, undo ${undone.toFixed(1)} ms, redo ${redone.toFixed(1)} ms`);
    expect(removal).toBeLessThan(timeBound(50));
    expect(undone).toBeLessThan(timeBound(50));
    expect(redone).toBeLessThan(timeBound(50));
  });
});
