import { describe, expect, it, vi } from 'vitest';
import { DisposerSet } from '../../src/api/disposers';
import { lightingApi } from '../../src/api/lighting';
import type { PlayerVisibility } from '../../src/api/types/lighting';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { playerLightingOf } from '../../src/app/pixi/lighting/playerLightingLayers';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { character, fixtureLighting, lightingFromStore, scene, wall } from '../unit/lightingFixtures';
import { fakeView, framesFor, loadMap, trackerWith, type FakeView } from './apiFakes';

/**
 * What the player window hides since 0.6.1-beta (#296, #303), `lighting.playerVisibility` hides too: a token under
 * committed fog, every token while the fog cannot be drawn, and whatever only a GM-hidden token's vision would show.
 */

const MAP = { width: 1000, height: 500 };

const rect = (id: string, timestamp: number, x: number, isErasing = false): FogOperation => ({
  id, kind: 'fog', type: 'rectangle', timestamp, isErasing, x, y: 0, width: 200, height: 500,
});

function setup(): { view: FakeView; api: ReturnType<typeof lightingApi> } {
  const view = fakeView('v1');
  loadMap(view);
  view.atlasStore.getState().setSceneLighting({ enabled: true });
  const state = view.atlasStore.getState();
  view.atlasStore.setState({
    objects: { ...state.objects, tokens: { hero: character('hero', 100, 250), goblin: character('goblin', 800, 250) } },
  });
  return { view, api: lightingApi(trackerWith([view]).tracker, framesFor(), new DisposerSet()) };
}

const tokensOf = (answer: PlayerVisibility): Record<string, string> => {
  expect(answer.status).toBe('ready');
  return answer.status === 'ready' ? { ...answer.tokens } : {};
};

describe('player visibility and fog (#303)', () => {
  it('a token under committed fog is unseen, and seen again once the fog over it is erased', () => {
    const { view, api } = setup();
    view.setPlayerLighting(fixtureLighting({ perception: () => 'seen', fog: fogCoverage({ paint: rect('paint', 1, 700) }) }));
    expect(tokensOf(api.playerVisibility('v1'))).toEqual({ hero: 'seen', goblin: 'unseen' });
    const erased = fogCoverage({ paint: rect('paint', 1, 700), erase: rect('erase', 2, 700, true) });
    view.setPlayerLighting(fixtureLighting({ perception: () => 'seen', fog: erased }));
    expect(tokensOf(api.playerVisibility('v1'))).toEqual({ hero: 'seen', goblin: 'seen' });
  });

  it('fog never makes a token the lighting hides any more seen', () => {
    const { view, api } = setup();
    view.setPlayerLighting(fixtureLighting({ perception: (id) => (id === 'hero' ? 'sensed' : 'unseen'), fog: fogCoverage({}) }));
    expect(tokensOf(api.playerVisibility('v1'))).toEqual({ hero: 'sensed', goblin: 'unseen' });
  });

  it('fog whose geometry cannot be drawn covers the whole window: pending', () => {
    const { view, api } = setup();
    view.setPlayerLighting(fixtureLighting({ perception: () => 'seen', fog: null }));
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
  });

  it('watch fires when the fog changes', () => {
    const { view, api } = setup();
    const listener = vi.fn();
    api.watch('v1', listener);
    view.atlasStore.getState().addFogOperation(rect('paint', 1, 700));
    expect(listener).toHaveBeenCalled();
  });

  it("the players' lighting carries the view's fog, and none where the view has no fog", () => {
    const lit = {
      sightReady: () => true, currentSight: () => fixtureLighting().sight, ambientLight: () => ({ ambient: 1 }),
      lightReaches: () => [], seenSpots: () => [], showsExplored: () => false, exploredSettling: () => false,
    };
    const fog = fogCoverage({});
    expect(playerLightingOf(lit, () => 'seen', fog)?.fog).toBe(fog);
    expect(playerLightingOf(lit, () => 'seen', null)?.fog).toBeNull();
    expect(playerLightingOf(lit, () => 'seen')).not.toHaveProperty('fog');
  });
});

describe('player visibility and fog on an unlit scene', () => {
  function unlit(): { view: FakeView; api: ReturnType<typeof lightingApi> } {
    const { view, api } = setup();
    view.atlasStore.getState().setSceneLighting({ enabled: false });
    view.setPlayerLighting(null);
    return { view, api };
  }

  it('is unlit with no token unseen while the scene has no fog', () => {
    const { api } = unlit();
    expect(api.playerVisibility('v1')).toEqual({ status: 'unlit', tokens: {} });
  });

  it('answers unseen for a token under committed fog, as the window hides it', () => {
    const { view, api } = unlit();
    view.atlasStore.getState().addFogOperation(rect('paint', 1, 700));
    expect(api.playerVisibility('v1')).toEqual({ status: 'unlit', tokens: { goblin: 'unseen' } });
  });

  it('also with dynamic lighting off, where the view has no lighting at all', () => {
    const { view, api } = unlit();
    view.setPlayerLighting(undefined);
    view.atlasStore.getState().addFogOperation(rect('paint', 1, 700));
    expect(api.playerVisibility('v1')).toEqual({ status: 'unlit', tokens: { goblin: 'unseen' } });
  });

  it('is pending while the fog cannot be drawn, since the window then covers the whole map', () => {
    const { view, api } = unlit();
    view.atlasStore.getState().addFogOperation(rect('paint', 1, 700));
    view.setCommittedFog(null);
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
  });

  it('is pending while the scene has fog the view cannot read', () => {
    const { view, api } = unlit();
    view.atlasStore.getState().addFogOperation(rect('paint', 1, 700));
    view.setCommittedFog(undefined);
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
  });
});

describe('player visibility and GM-hidden tokens (#296)', () => {
  /** Daylight, a wall at x = 500. The hero sees the left half; the scout, on the right, sees the goblin there. */
  const walled = (scoutHidden: boolean) => lightingFromStore(scene({ ambient: 1 }, {
    tokens: {
      hero: character('hero', 140, 250, { vision: { enabled: true } }),
      scout: character('scout', 860, 250, { vision: { enabled: true }, isHidden: scoutHidden }),
      goblin: character('goblin', 700, 250),
    },
    walls: { w: wall('w', { x: 500, y: -10 }, { x: 500, y: 510 }) },
  }), MAP)!;

  function answer(scoutHidden: boolean): PlayerVisibility {
    const view = fakeView('v1');
    loadMap(view);
    view.atlasStore.getState().setSceneLighting({ enabled: true });
    const state = view.atlasStore.getState();
    view.atlasStore.setState({
      objects: { ...state.objects, tokens: {
        hero: character('hero', 140, 250, { vision: { enabled: true } }),
        scout: character('scout', 860, 250, { vision: { enabled: true }, isHidden: scoutHidden }),
        goblin: character('goblin', 700, 250),
      } },
    });
    view.setPlayerLighting(walled(scoutHidden));
    return lightingApi(trackerWith([view]).tracker, framesFor(), new DisposerSet()).playerVisibility('v1');
  }

  const shownAt = (visibility: PlayerVisibility, x: number, y: number): boolean => {
    if (visibility.status !== 'ready') throw new Error('not ready');
    const { cellSize, cols, shown } = visibility.darkness;
    return shown[Math.floor(y / cellSize) * cols + Math.floor(x / cellSize)] === 1;
  };

  it("a visible scout's vision shows its side of the wall and the goblin there", () => {
    const visible = answer(false);
    expect(tokensOf(visible)).toMatchObject({ hero: 'seen', scout: 'seen', goblin: 'seen' });
    expect(shownAt(visible, 750, 250)).toBe(true);
  });

  it("a GM-hidden scout's vision shows players nothing: its side stays dark, the goblin and the scout unseen", () => {
    const hidden = answer(true);
    expect(tokensOf(hidden)).toMatchObject({ hero: 'seen', scout: 'unseen', goblin: 'unseen' });
    expect(shownAt(hidden, 750, 250)).toBe(false);
    expect(shownAt(hidden, 200, 250)).toBe(true);
  });
});
