import type { WorkspaceLeaf } from 'obsidian';
import type { ObservedStore, SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { describe, expect, it } from 'vitest';
import { cpuFloorSource, HELD_TAB, type FloorSource, type GmTab } from '../../../../src/app/online/gm/floorSource.ts';
import { gmTabOf } from '../../../../src/app/online/gm/gmTab.ts';
import { sceneState } from './shareHarness.ts';

/*
 * The binding names the source of each floor at each read: the GM's renderer for the floor its view shows once
 * it has drawn it, the floor worked out on the CPU for any other, and nothing for any floor while the scene is held.
 */

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
];

/** A floor worked out on the CPU. */
const cpu: FloorSource = cpuFloorSource({ lighting: () => null, frame: (lit) => lit, roofed: () => false, drawn: () => ({}), outline: () => null }, { tokenSource: () => null, mapLayers: () => null, seen: () => null });

const marks = { source: () => null, showPlayers: () => undefined, showPlayerDrags: () => undefined, showPlayerCursors: () => undefined, showPlayerStrokes: () => undefined };

/** The GM's tab on `state`, its renderer having drawn the level its view shows while `drawn` says so. */
function tabOn(state: SceneState, drawn: { now: boolean }): { readonly renderer: object; readonly gm: GmTab } {
  const store: ObservedStore = { getState: () => state, setState: () => undefined, subscribe: () => () => undefined };
  const renderer = {
    lighting: { renderer: { sightIsCurrent: () => drawn.now } },
    playerRollTokens: () => new Map(),
    getGridOptions: () => ({ size: 70 }),
  };
  const view = {};
  return { renderer, gm: gmTabOf({ leaf: { view } as unknown as WorkspaceLeaf, view, store, renderer }, marks) };
}

describe('the source of a floor', () => {
  it('is the GM\'s renderer in a scene of one floor, drawn or not', () => {
    const drawn = { now: false };
    const { gm, renderer } = tabOn(sceneState(), drawn);
    expect(gm.sourceOf(null, cpu)).toBe(gm);
    drawn.now = true;
    expect(gm.sourceOf(null, cpu)).toBe(gm);
    expect(gm.tokenSource()).toBe(renderer);
  });

  it('is the GM\'s renderer for the floor its view shows once it has drawn it, and the CPU before and for any other floor', () => {
    const drawn = { now: false };
    const { gm } = tabOn(sceneState({ levels: LEVELS, viewedLevel: 'upper' }), drawn);
    expect(gm.sourceOf('upper', cpu)).toBe(cpu);
    expect(gm.sourceOf('ground', cpu)).toBe(cpu);
    drawn.now = true;
    expect(gm.sourceOf('upper', cpu)).toBe(gm);
    expect(gm.sourceOf('ground', cpu)).toBe(cpu);
  });

  it('is nothing for every floor while the scene is held: no tokens, map layers, basis, rules, dice or marks of the GM\'s', () => {
    for (const floor of [null, 'ground', 'upper']) expect(HELD_TAB.sourceOf(floor, cpu)).toBe(HELD_TAB);
    const read = [HELD_TAB.tokenSource(), HELD_TAB.mapLayers(), HELD_TAB.basis(), HELD_TAB.lightingSource(), HELD_TAB.tokenRules(), HELD_TAB.tokenMoves(), HELD_TAB.dice(), HELD_TAB.gmMarks(), HELD_TAB.gmDragRuler()];
    expect(read).toEqual([null, null, null, null, null, null, null, null, null]);
    expect(HELD_TAB.drawnPlaces(['ana']).size).toBe(0);
    expect(HELD_TAB.followsSight).toBe(false);
  });
});
