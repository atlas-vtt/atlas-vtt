import { describe, expect, it } from 'vitest';
import type { ViewAtlasStore } from '../../../src/app/storeFactory';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { openStore } from '../../helpers/historyScenes';
import { timeBound } from '../../helpers/timeBound';

const LEVELS: SceneLevel[] = ['cellar', 'ground', 'tower'].map((id, index) => ({ id, elevation: { bottom: index * 10, top: index * 10 + 10 }, background: null }));
const RUNS = 5;

/**
 * A three-floor dungeon on each floor: 400 walls, 50 lights, 200 tokens (one in ten with an aura),
 * 130 drawings, 70 texts and 30 pins; 40 of the tokens fight in a running fight.
 */
function dungeon(): ViewAtlasStore {
  const { store } = openStore();
  const state = store.getState();
  state.setLevels(LEVELS);
  const fighters: string[] = [];
  for (const { id: level } of LEVELS) {
    state.setViewedLevel(level);
    for (let i = 0; i < 400; i += 1) state.addObject('walls', { type: i % 20 === 0 ? 'door' : 'solid', p1: { x: (i % 40) * 70, y: Math.floor(i / 40) * 70 }, p2: { x: (i % 40) * 70 + 60, y: Math.floor(i / 40) * 70 } });
    for (let i = 0; i < 50; i += 1) state.addObject('lights', { x: i * 50, y: 500, emission: { bright: 20, dim: 40, color: '#ffaa55', intensity: 1 } });
    const tokens = state.addTokens(Array.from({ length: 200 }, (_, i) => ({ x: (i % 20) * 70, y: Math.floor(i / 20) * 70, imagePath: `art/${i % 12}.png` })));
    state.setTokenAuras(tokens.filter((_, i) => i % 10 === 0).map((tokenId) => ({ tokenId, aura: 10, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] })));
    fighters.push(...tokens.slice(0, 14));
    state.addDrawings(Array.from({ length: 130 }, (_, i) => ({ type: 'line' as const, points: [{ x: i, y: 0 }, { x: i + 50, y: 40 }], color: '#ffffff', width: 2, opacity: 1 })));
    for (let i = 0; i < 70; i += 1) state.addText({ x: i * 20, y: 900, text: `Room ${i}`, fontSize: 16, fontFamily: 'serif', color: '#ffffff' });
    for (let i = 0; i < 30; i += 1) state.addNotePin(i * 30, 1000, `notes/room-${i}.md`);
  }
  for (const tokenId of fighters.slice(0, 40)) state.addToInitiative({ tokenId, name: tokenId, initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true });
  state.startCombat();
  return store;
}

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
