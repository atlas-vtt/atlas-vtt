import { describe, expect, it } from 'vitest';
import { playerLightingOf } from '../../src/app/pixi/lighting/playerLightingLayers';
import { SEES_ALL } from '../../src/app/vision/sight';
import { character, light, lightingFromStore, MAP, scene, wall, type Scene } from './lightingFixtures';

/** Daylight, and a wall from top to bottom at x = 500: the hero sees the left half only. */
const walled = (): Scene => scene({ ambient: 1 }, {
  tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }), goblin: character('goblin', 800, 400) },
  walls: { w: wall('w', { x: 500, y: -10 }, { x: 500, y: 810 }) },
});

/** Night, a torch at (400, 400) dim to 10 ft (140 px): the hero sees only what it lights, and itself. */
const torchlit = (goblinX = 420): Scene => scene({ ambient: 0 }, {
  tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }), goblin: character('goblin', goblinX, 400) },
  lights: { torch: light('torch', 400, 400) },
});

/** A lighting view whose answers a test sets. */
function view(ready: boolean, showsExplored = false) {
  return {
    sightReady: () => ready, currentSight: () => SEES_ALL, ambientLight: () => ({ ambient: 1 }),
    lightReaches: () => [], seenSpots: () => [], showsExplored: () => showsExplored, exploredSettling: () => false,
  };
}

describe('the players\' lighting of a view', () => {
  it('is undefined while the scene is unlit: lighting hides nothing then', () => {
    const state = walled();
    expect(lightingFromStore({ ...state, lighting: { ...state.lighting, enabled: false } }, MAP)).toBeUndefined();
    expect(playerLightingOf(view(true), undefined)).toBeUndefined();
  });

  it('is not ready until the view has worked out the scene\'s sight', () => {
    expect(playerLightingOf(view(false), () => 'seen')?.ready).toBe(false);
    expect(playerLightingOf(view(true), () => 'seen')?.ready).toBe(true);
  });

  it('shows the explored memory only where the view does', () => {
    expect(playerLightingOf(view(true, true), () => 'seen')?.showsExplored).toBe(true);
    expect(playerLightingOf(view(true, false), () => 'seen')?.showsExplored).toBe(false);
    const state = torchlit();
    expect(lightingFromStore({ ...state, lighting: { ...state.lighting, exploredMemory: true } }, MAP)?.showsExplored).toBe(true);
    expect(lightingFromStore({ ...state, lighting: { ...state.lighting, exploredMemory: false } }, MAP)?.showsExplored).toBe(false);
  });

  it('perceives a token outside every vision as unseen, and the hero as seen', () => {
    const perception = lightingFromStore(walled(), MAP)!.perception;
    expect(perception('hero')).toBe('seen');
    expect(perception('goblin')).toBe('unseen');
    expect(perception('nobody')).toBe('unseen');
  });

  it('sees a token in torchlight and not one in the dark', () => {
    expect(lightingFromStore(torchlit(420), MAP)!.perception('goblin')).toBe('seen');
    expect(lightingFromStore(torchlit(800), MAP)!.perception('goblin')).toBe('unseen');
  });

  it('passes on what the view perceives, a token the players only sense included', () => {
    const lighting = playerLightingOf(view(true), (id) => (id === 'hero' ? 'seen' : 'sensed'))!;
    expect(lighting.perception('hero')).toBe('seen');
    expect(lighting.perception('goblin')).toBe('sensed');
  });
});
