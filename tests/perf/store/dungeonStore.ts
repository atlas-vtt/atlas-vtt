import type { ViewAtlasStore } from '../../../src/app/storeFactory';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { openStore } from '../../helpers/historyScenes';

export const LEVELS: SceneLevel[] = ['cellar', 'ground', 'tower'].map((id, index) => ({ id, elevation: { bottom: index * 10, top: index * 10 + 10 }, background: null }));

/**
 * A three-floor dungeon on each floor: 400 walls, 50 lights, 200 tokens (one in ten with an aura),
 * 130 drawings, 70 texts and 30 pins; 40 of the tokens fight in a running fight.
 */
export function dungeon(): ViewAtlasStore {
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
